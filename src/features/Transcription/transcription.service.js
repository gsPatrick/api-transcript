// src/features/Transcription/transcription.service.js
const db = require('../../config/database');
const openai = require('../../config/openai');
const fs = require('fs/promises'); // Para manipulação de arquivos assíncrona
const path = require('path');
const { User, Plan, Transcription } = db;

const transcriptionService = {
  /**
   * Inicia o processo de transcrição de um arquivo de áudio.
   * @param {string} userId - ID do usuário.
   * @param {object} file - Objeto de arquivo do Multer (path, originalname, size).
   * @returns {object} O registro da transcrição criada.
   */
  async createTranscription(userId, file) {
    let transcriptionRecord; // Declara fora do try para ser acessível no catch

    try {
      const user = await User.findByPk(userId, {
        include: [{ model: Plan, as: 'currentPlan' }],
      });

      if (!user) {
        throw new Error('Usuário não encontrado.');
      }
      if (!user.currentPlan || user.planExpiresAt < new Date()) {
        throw new Error('Você não tem um plano ativo. Por favor, adquira um plano.');
      }

      const planFeatures = user.currentPlan.features;

      // 1. Verificar limites de transcrição por quantidade
      if (planFeatures.maxAudioTranscriptions !== -1 && user.transcriptionsUsedCount >= planFeatures.maxAudioTranscriptions) {
        throw new Error('Limite de transcrições de áudio atingido para o seu plano.');
      }

      // 2. Verificar limites de transcrição por minutos (após obter duração real)
      // A duração real só pode ser obtida após o upload ou usando uma biblioteca como ffprobe.
      // Por enquanto, faremos uma estimativa ou a validação mais precisa será após a transcrição.
      // Para ser mais preciso, o ideal seria obter a duração do áudio ANTES de enviar para o Whisper
      // para não gastar o limite de quantidade se o áudio exceder o limite de minutos.
      // Por simplicidade, faremos a validação de minutos APÓS a transcrição, assumindo que o limite de 25MB do Whisper já filtra arquivos muito grandes.

      // 3. Criar registro inicial da transcrição no DB como 'pending'
      transcriptionRecord = await Transcription.create({
        userId: user.id,
        audioPath: file.path, // Caminho temporário do arquivo
        originalFileName: file.originalname,
        fileSizeKB: file.size / 1024,
        status: 'pending',
      });

      // Iniciar a transcrição em segundo plano para não bloquear a resposta da API
      this._processTranscriptionInBackground(transcriptionRecord.id, file.path, user.id, planFeatures);

      return transcriptionRecord;

    } catch (error) {
      console.error('Erro ao iniciar transcrição:', error);
      // Se houve um erro antes de criar o registro ou no início, o arquivo pode precisar ser deletado
      if (file && file.path) {
        await fs.unlink(file.path).catch(err => console.error('Erro ao deletar arquivo de áudio após falha:', err));
      }
      // Se o registro foi criado mas deu erro antes de processar, marcar como failed
      if (transcriptionRecord && transcriptionRecord.status === 'pending') {
        await transcriptionRecord.update({ status: 'failed', errorMessage: error.message });
      }
      throw error;
    }
  },

  /**
   * Processa a transcrição do áudio com a API Whisper em segundo plano.
   * @param {string} transcriptionId - ID do registro de transcrição no DB.
   * @param {string} audioFilePath - Caminho completo do arquivo de áudio.
   * @param {string} userId - ID do usuário.
   * @param {object} planFeatures - Features do plano do usuário.
   * @private
   */
  async _processTranscriptionInBackground(transcriptionId, audioFilePath, userId, planFeatures) {
    let transcriptionRecord;
    try {
      transcriptionRecord = await Transcription.findByPk(transcriptionId);
      if (!transcriptionRecord) {
        console.error(`Registro de transcrição ${transcriptionId} não encontrado para processamento.`);
        return;
      }

      await transcriptionRecord.update({ status: 'processing' });

      // 1. Enviar arquivo para a API Whisper da OpenAI
      const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(audioFilePath), // Lê o arquivo como stream
        model: 'whisper-1',
        response_format: 'text', // Retorna apenas o texto transcrito
      });

      const transcriptionText = transcription; // Whisper API retorna diretamente o texto

      // 2. Estimar duração do áudio para controle de minutos (se não tiver uma forma mais precisa)
      // Para uma precisão maior, seria necessário usar uma biblioteca como 'ffprobe' aqui.
      // Assumindo uma taxa de bits média do áudio para estimar a duração a partir do tamanho do arquivo.
      // Esta é uma estimativa bruta. O ideal é usar uma biblioteca como `fluent-ffmpeg` ou `ffprobe-static`
      // para obter a duração exata do arquivo de áudio.
      const estimatedDurationSeconds = (transcriptionRecord.fileSizeKB * 1024) / (128 * 1000 / 8); // Ex: 128 kbps
      const estimatedDurationMinutes = estimatedDurationSeconds / 60;

      // 3. Validar limite de minutos APÓS a transcrição (já que temos a duração estimada/real)
      const user = await User.findByPk(userId); // Recarrega o usuário para ter os dados mais recentes
      if (!user) throw new Error('Usuário não encontrado durante o processamento de transcrição.');

      if (planFeatures.maxTranscriptionMinutes !== -1 && (user.transcriptionMinutesUsed + estimatedDurationMinutes) > planFeatures.maxTranscriptionMinutes) {
        // Se exceder o limite de minutos, marca como falha e não atualiza o uso
        await transcriptionRecord.update({
          status: 'failed',
          errorMessage: 'Transcrição excederia o limite de minutos do seu plano. Não processada.',
          durationSeconds: estimatedDurationSeconds,
        });
        console.warn(`Transcrição ${transcriptionId} falhou: limite de minutos excedido para o usuário ${userId}.`);
        // Não deleta o arquivo aqui, pois a transcrição foi feita, mas não "consumida" pelo plano.
        // Poderíamos ter uma política de deletar arquivos transcritos ou mantê-los.
        return;
      }

      // 4. Atualizar o registro da transcrição no DB
      await transcriptionRecord.update({
        transcriptionText: transcriptionText,
        durationSeconds: estimatedDurationSeconds,
        status: 'completed',
      });

      // 5. Atualizar o consumo do usuário
      await user.update({
        transcriptionsUsedCount: user.transcriptionsUsedCount + 1,
        transcriptionMinutesUsed: user.transcriptionMinutesUsed + estimatedDurationMinutes,
      });

      console.log(`Transcrição ${transcriptionId} concluída e uso do usuário ${userId} atualizado.`);

    } catch (error) {
      console.error(`Erro durante o processamento da transcrição ${transcriptionId}:`, error);
      const errorMessage = error.response ? error.response.data : error.message;
      if (transcriptionRecord) {
        await transcriptionRecord.update({ status: 'failed', errorMessage: `Erro na API Whisper: ${errorMessage}` });
      }
    } finally {
      // 6. Deletar o arquivo de áudio temporário após o processamento (sucesso ou falha)
      if (audioFilePath) {
        await fs.unlink(audioFilePath).catch(err => console.error('Erro ao deletar arquivo de áudio:', err));
      }
    }
  },

  /**
   * Lista as transcrições de um usuário.
   * @param {string} userId - ID do usuário.
   * @param {object} filters - Filtros de paginação e status.
   * @returns {object} Lista de transcrições.
   */
  async listUserTranscriptions(userId, filters = {}) {
    try {
      const { status, page = 1, limit = 10 } = filters;
      const where = { userId };

      if (status) where.status = status;

      const offset = (page - 1) * limit;

      const { count, rows } = await Transcription.findAndCountAll({
        where,
        limit: Number.parseInt(limit),
        offset,
        order: [['createdAt', 'DESC']],
        attributes: { exclude: ['audioPath'] } // Não expõe o caminho do arquivo no servidor
      });

      return {
        transcriptions: rows,
        total: count,
        totalPages: Math.ceil(count / limit),
        currentPage: Number.parseInt(page),
      };
    } catch (error) {
      console.error('Erro ao listar transcrições do usuário:', error);
      throw error;
    }
  },

  /**
   * Busca uma transcrição específica de um usuário.
   * @param {string} transcriptionId - ID da transcrição.
   * @param {string} userId - ID do usuário (para segurança).
   * @returns {object} A transcrição encontrada.
   */
  async getTranscriptionById(transcriptionId, userId) {
    try {
      const transcription = await Transcription.findOne({
        where: { id: transcriptionId, userId },
        attributes: { exclude: ['audioPath'] }
      });

      if (!transcription) {
        throw new Error('Transcrição não encontrada ou você não tem permissão para acessá-la.');
      }
      return transcription;
    } catch (error) {
      console.error('Erro ao buscar transcrição por ID:', error);
      throw error;
    }
  },

  /**
   * Reinicia os contadores de uso de transcrição para todos os usuários com planos expirados.
   * Esta função deve ser chamada periodicamente (ex: via cron job).
   */
  async resetExpiredPlanUsage() {
    try {
      const now = new Date();
      const usersToReset = await User.findAll({
        where: {
          planExpiresAt: {
            [db.Sequelize.Op.lte]: now, // Planos que expiraram ou estão expirando agora
          },
          planId: {
            [db.Sequelize.Op.ne]: null, // Que tinham um plano associado
          }
        },
      });

      for (const user of usersToReset) {
        // Verifica se o plano realmente não foi renovado/atualizado
        // Se o user.planExpiresAt for menor ou igual a 'now', e o plano não foi trocado, reseta
        if (user.planExpiresAt <= now) {
            await user.update({
                planId: null, // Remove o plano atual
                planExpiresAt: null, // Limpa a data de expiração
                transcriptionsUsedCount: 0,
                transcriptionMinutesUsed: 0,
                agentUsesUsed: 0,
            });
            console.log(`Uso do usuário ${user.email} resetado e plano desativado.`);
        }
      }
      console.log(`Verificação de planos expirados concluída. ${usersToReset.length} usuários processados.`);
    } catch (error) {
      console.error('Erro ao resetar uso de planos expirados:', error);
    }
  },

  /**
   * Obtém informações de uso do plano para um usuário.
   * @param {string} userId - ID do usuário.
   * @returns {object} Informações do plano e uso atual.
   */

async resetUserUsageAndPlanExpiration() {
    try {
      const now = new Date();
      // Busca todos os usuários, incluindo seus planos, para verificar expiração e resets periódicos
      const users = await User.findAll({
        include: [{ model: Plan, as: 'currentPlan' }],
      });

      for (const user of users) {
        let shouldResetAllUsage = false;
        let shouldResetAgentCreation = false;
        let updateData = {};

        // 1. Verificar expiração do plano
        if (user.planExpiresAt && user.planExpiresAt <= now) {
          console.log(`Plano do usuário ${user.email} expirou. Desativando plano e resetando todo o uso.`);
          shouldResetAllUsage = true;
          updateData.planId = null;
          updateData.planExpiresAt = null;
        }

        // 2. Resetar contadores se o plano expirou
        if (shouldResetAllUsage) {
          updateData.transcriptionsUsedCount = 0;
          updateData.transcriptionMinutesUsed = 0;
          updateData.agentUsesUsed = 0;
          updateData.userAgentsCreatedCount = 0; // Resetar agentes criados
          updateData.lastAgentCreationResetDate = null; // Resetar data de reset
        } else if (user.currentPlan) {
          // 3. Verificar resets periódicos de agentes criados (APENAS se o plano estiver ativo)
          const planFeatures = user.currentPlan.features;
          const resetPeriod = planFeatures.userAgentCreationResetPeriod;

          if (resetPeriod && resetPeriod !== 'never' && user.lastAgentCreationResetDate) {
            let nextResetDate = new Date(user.lastAgentCreationResetDate);

            if (resetPeriod === 'monthly') {
              nextResetDate.setMonth(nextResetDate.getMonth() + 1);
            } else if (resetPeriod === 'yearly') {
              nextResetDate.setFullYear(nextResetDate.getFullYear() + 1);
            }

            if (now >= nextResetDate) {
              console.log(`Reset periódico de agentes criados para ${user.email} (${resetPeriod}).`);
              shouldResetAgentCreation = true;
              updateData.userAgentsCreatedCount = 0;
              // Define a nova data de reset para o início do próximo período
              // Ex: se era 15/01 e o reset é mensal, a nova data é 15/02.
              // Se o reset for para o início do mês/ano, a lógica seria diferente.
              // Para simplicidade, vamos usar a data atual como o novo ponto de partida para o próximo ciclo.
              updateData.lastAgentCreationResetDate = now;
            }
          }
        }

        // Aplicar as atualizações se houver alguma
        if (Object.keys(updateData).length > 0) {
          await user.update(updateData);
        }
      }
      console.log(`Verificação de uso de usuários e planos concluída. ${users.length} usuários processados.`);
    } catch (error) {
      console.error('Erro ao resetar uso de usuários e planos expirados:', error);
    }
  },


 async getUserPlanUsage(userId) {
    try {
      const user = await User.findByPk(userId, {
        include: [{ model: Plan, as: 'currentPlan' }],
      });

      if (!user) {
        throw new Error('Usuário não encontrado.');
      }

      if (!user.currentPlan || user.planExpiresAt < new Date()) {
        return {
          plan: null,
          usage: {
            transcriptions: { used: 0, limit: 0 },
            minutes: { used: 0, limit: 0 },
            agents: { used: 0, limit: 0 },
            userCreatedAgents: { used: 0, limit: 0, resetPeriod: null } // Adicionado
          },
          expiresAt: null,
          status: 'inactive'
        };
      }

      const planFeatures = user.currentPlan.features;

      return {
        plan: {
          id: user.currentPlan.id,
          name: user.currentPlan.name,
          price: user.currentPlan.price,
          durationInDays: user.currentPlan.durationInDays,
          features: planFeatures, // Inclui todas as features para o frontend exibir
        },
        usage: {
          transcriptions: {
            used: user.transcriptionsUsedCount,
            limit: planFeatures.maxAudioTranscriptions,
            remaining: planFeatures.maxAudioTranscriptions === -1 ? -1 : planFeatures.maxAudioTranscriptions - user.transcriptionsUsedCount
          },
          minutes: {
            used: user.transcriptionMinutesUsed,
            limit: planFeatures.maxTranscriptionMinutes,
            remaining: planFeatures.maxTranscriptionMinutes === -1 ? -1 : planFeatures.maxTranscriptionMinutes - user.transcriptionMinutesUsed
          },
          agents: {
            used: user.agentUsesUsed,
            limit: planFeatures.maxAgentUses,
            remaining: planFeatures.maxAgentUses === -1 ? -1 : planFeatures.maxAgentUses - user.agentUsesUsed
          },
          userCreatedAgents: { // NOVO
            used: user.userAgentsCreatedCount,
            limit: planFeatures.maxUserAgents,
            resetPeriod: planFeatures.userAgentCreationResetPeriod,
            remaining: planFeatures.maxUserAgents === -1 ? -1 : planFeatures.maxUserAgents - user.userAgentsCreatedCount
          }
        },
        expiresAt: user.planExpiresAt,
        status: 'active'
      };

    } catch (error) {
      console.error('Erro ao obter uso do plano do usuário:', error);
      throw error;
    }

 }


 /**
   * Reinicia os contadores de uso de um usuário e/ou desativa planos expirados.
   * Esta função deve ser chamada periodicamente (ex: via cron job).
   * Ela agora lida com resets baseados em expiração E resets periódicos de recursos.
   */

 




};

module.exports = transcriptionService;