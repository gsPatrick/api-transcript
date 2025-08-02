// src/features/Transcription/transcription.service.js

const db = require('../../config/database');
const openai = require('../../config/openai');
const fsPromises = require('fs/promises');
const fs = require('fs');
const path = require('path');
const { User, Plan, Transcription, AgentAction, Agent } = db;

const transcriptionService = {
  async createTranscription(userId, file) {
    let transcriptionRecord;

    try {
      const user = await User.findByPk(userId, {
        include: [{ model: Plan, as: 'currentPlan' }],
      });

      if (!user) {
        throw new Error('Usuário não encontrado.');
      }
      if (!user.currentPlan || !user.planExpiresAt || user.planExpiresAt < new Date()) {
        throw new Error('Você não tem um plano ativo. Por favor, adquira um plano.');
      }

      const planFeatures = user.currentPlan.features;

      if (planFeatures.maxAudioTranscriptions !== -1 && user.transcriptionsUsedCount >= planFeatures.maxAudioTranscriptions) {
        throw new Error('Limite de transcrições de áudio atingido para o seu plano.');
      }
      
      const fileSizeInKB = Math.round(file.size / 1024);

      transcriptionRecord = await Transcription.create({
        userId: user.id,
        audioPath: file.path,
        originalFileName: file.originalname,
        fileSizeKB: fileSizeInKB,
        status: 'pending',
      });

      this._processTranscriptionInBackground(transcriptionRecord.id, file.path, user.id, planFeatures);

      return transcriptionRecord;

    } catch (error) {
      console.error('Erro ao iniciar processo de transcrição:', error);
      if (file && file.path) {
        await fsPromises.unlink(file.path).catch(err => console.error('Erro ao deletar arquivo de áudio após falha na criação:', err));
      }
      if (transcriptionRecord && transcriptionRecord.status === 'pending') {
        await transcriptionRecord.update({ status: 'failed', errorMessage: error.message });
      }
      throw error;
    }
  },

  async _processTranscriptionInBackground(transcriptionId, audioFilePath, userId, planFeatures) {
    let transcriptionRecord;
    try {
      transcriptionRecord = await Transcription.findByPk(transcriptionId);
      if (!transcriptionRecord) {
        console.error(`Registro de transcrição ${transcriptionId} não encontrado para processamento.`);
        return;
      }

      await transcriptionRecord.update({ status: 'processing' });

      const transcriptionResponse = await openai.audio.transcriptions.create({
        file: fs.createReadStream(audioFilePath),
        model: 'whisper-1',
      });

      const transcriptionText = transcriptionResponse.text;
      
      const user = await User.findByPk(userId);
      if (!user) throw new Error('Usuário não encontrado durante o processamento em background.');

      const estimatedDurationSeconds = (transcriptionRecord.fileSizeKB * 8) / 128;
      const estimatedDurationMinutes = estimatedDurationSeconds / 60;

      if (planFeatures.maxTranscriptionMinutes !== -1 && (user.transcriptionMinutesUsed + estimatedDurationMinutes) > planFeatures.maxTranscriptionMinutes) {
          throw new Error('A transcrição excederia o limite de minutos do seu plano.');
      }
      
      await transcriptionRecord.update({
        transcriptionText: transcriptionText,
        durationSeconds: estimatedDurationSeconds,
        status: 'completed',
      });

      await user.increment('transcriptionMinutesUsed', { by: estimatedDurationMinutes });
      await user.increment('transcriptionsUsedCount', { by: 1 });

      console.log(`Transcrição ${transcriptionId} concluída e uso do usuário ${userId} atualizado.`);

    } catch (error) {
      console.error(`Erro durante o processamento da transcrição ${transcriptionId}:`, error);
      const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
      if (transcriptionRecord) {
        await transcriptionRecord.update({ status: 'failed', errorMessage: `Erro na API Whisper: ${errorMessage}` });
      }
    } finally {
      if (audioFilePath) {
        await fsPromises.unlink(audioFilePath).catch(err => console.error(`Erro ao deletar arquivo de áudio final: ${audioFilePath}`, err));
      }
    }
  },

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
        attributes: { exclude: ['audioPath', 'transcriptionText'] }
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

  async getUserPlanUsage(userId) {
    try {
      const user = await User.findByPk(userId, {
        include: [{ model: Plan, as: 'currentPlan' }],
      });

      if (!user) throw new Error('Usuário não encontrado.');

      const planFeatures = user.currentPlan?.features || {};
      
      let status = 'inactive';
      if (user.currentPlan) {
        status = (user.planExpiresAt && user.planExpiresAt > new Date()) ? 'active' : 'expired';
      }

      const calculateRemaining = (limit, used) => {
        if (status !== 'active') return 0;
        if (limit === -1) return -1;
        return Math.max(0, limit - used);
      };

      return {
        plan: user.currentPlan ? {
          id: user.currentPlan.id,
          name: user.currentPlan.name,
          features: planFeatures,
        } : null,
        usage: {
          transcriptions: {
            used: user.transcriptionsUsedCount,
            limit: planFeatures.maxAudioTranscriptions ?? 0,
            remaining: calculateRemaining(planFeatures.maxAudioTranscriptions, user.transcriptionsUsedCount)
          },
          minutes: {
            used: parseFloat(user.transcriptionMinutesUsed),
            limit: planFeatures.maxTranscriptionMinutes ?? 0,
            remaining: calculateRemaining(planFeatures.maxTranscriptionMinutes, parseFloat(user.transcriptionMinutesUsed))
          },
          // <<< MODIFICADO: Uso do novo contador 'assistantUsesUsed' >>>
          assistantUses: {
            used: user.assistantUsesUsed,
            limit: planFeatures.maxAgentUses ?? 0, // Reutilizando a chave 'maxAgentUses'
            remaining: calculateRemaining(planFeatures.maxAgentUses, user.assistantUsesUsed)
          },
          userCreatedAssistants: {
            used: user.assistantsCreatedCount,
            limit: planFeatures.maxAssistants ?? 0, // Usando a chave 'maxAssistants'
            remaining: calculateRemaining(planFeatures.maxAssistants, user.assistantsCreatedCount)
          }
        },
        expiresAt: user.planExpiresAt,
        status: status
      };
    } catch (error) {
      console.error('Erro ao obter uso do plano do usuário:', error);
      throw error;
    }
  },
  
  // <<< MODIFICADO: Tarefa agendada atualizada >>>
  async resetUserUsageAndPlanExpiration() {
    try {
      const now = new Date();
      const users = await User.findAll({
        include: [{ model: Plan, as: 'currentPlan' }],
      });

      for (const user of users) {
        let updateData = {};
        
        if (user.planId && user.planExpiresAt && user.planExpiresAt <= now) {
          console.log(`Plano do usuário ${user.email} expirou. Resetando uso.`);
          updateData = {
            planId: null,
            planExpiresAt: null,
            transcriptionsUsedCount: 0,
            transcriptionMinutesUsed: 0,
            agentUsesUsed: 0,
            userAgentsCreatedCount: 0,
            lastAgentCreationResetDate: null,
            // <<< ADICIONADO: Zerar contadores de assistente na expiração >>>
            assistantUsesUsed: 0,
            assistantsCreatedCount: 0,
            lastAssistantCreationResetDate: null,
          };
        }
        
        if (Object.keys(updateData).length > 0) {
          await user.update(updateData);
        }
      }
      console.log(`Tarefa de verificação de planos e uso concluída. ${users.length} usuários processados.`);
    } catch (error) {
      console.error('Erro na tarefa agendada de reset de uso:', error);
    }
  },

  async getAgentActionsForTranscription(transcriptionId, userId) {
    const transcription = await Transcription.findOne({ where: { id: transcriptionId, userId } });
    if (!transcription) {
      throw new Error('Transcrição não encontrada ou acesso negado.');
    }
    return await AgentAction.findAll({
      where: { transcriptionId },
      include: [{ model: Agent, as: 'agent', attributes: ['name'] }],
      order: [['createdAt', 'DESC']]
    });
  },

};

module.exports = transcriptionService;