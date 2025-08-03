// src/features/Assistant/assistant.service.js
const { OpenAI } = require('openai');
const { v4: uuidv4 } = require('uuid');
const db = require('../../config/database');
const systemOpenai = require('../../config/openai'); // SDK da OpenAI com token do sistema
const pdfGenerator = require('../../utils/pdfGenerator');
const path = require('path');
const fs = require('fs/promises'); // Para manipulação de arquivos (criar pasta, deletar)

// Diretório base para uploads de arquivos gerados (PDFs)
// Ajuste este caminho se sua pasta 'uploads' não estiver na raiz do projeto (fora de 'src')
const UPLOADS_BASE_DIR = path.resolve(__dirname, '..', '..', '..', 'uploads');

const { Assistant, User, Plan, Transcription, AssistantHistory } = db;

const assistantService = {

  /**
   * Auxiliar: Gerencia arquivos na OpenAI (upload, delete) e no Vector Store do Assistente.
   * @param {object} openaiClient - Instância do cliente OpenAI (system ou user).
   * @param {string} assistantId - ID do Assistente no nosso DB.
   * @param {Array<object>} filesToUpload - Array de objetos File do JS (do frontend).
   * @param {Array<string>} fileIdsToDelete - Array de IDs de arquivos da OpenAI a serem deletados.
   * @param {string|null} currentVectorStoreId - ID do Vector Store atual, se existir.
   * @returns {Promise<{openaiFileIds: Array<string>, openaiVectorStoreId: string}>} IDs dos arquivos e do Vector Store atualizados.
   */
  async _manageAssistantFiles(openaiClient, assistantId, filesToUpload, fileIdsToDelete, currentVectorStoreId) {
    let openaiFileIds = [];
    let openaiVectorStoreId = currentVectorStoreId;

    // 1. Criar ou Obter Vector Store
    if (!openaiVectorStoreId) {
      const vectorStore = await openaiClient.beta.vectorStores.create({
        name: `Assistant_${assistantId}_VectorStore`,
        expires_after: { anchor: "last_active_at", days: 30 } // Exemplo: expira após 30 dias de inatividade
      });
      openaiVectorStoreId = vectorStore.id;
      console.log(`[AssistantService] Novo Vector Store criado: ${openaiVectorStoreId}`);
    } else {
      // Obter arquivos existentes no Vector Store
      try {
        const existingVectorStoreFiles = await openaiClient.beta.vectorStores.files.list(openaiVectorStoreId);
        openaiFileIds = existingVectorStoreFiles.data.map(f => f.id);
      } catch (error) {
        console.warn(`[AssistantService] Erro ao listar arquivos do Vector Store ${openaiVectorStoreId}. Pode não existir mais ou erro de permissão. Criando um novo.`, error);
        // Se o Vector Store não existe ou erro, crie um novo
        const newVectorStore = await openaiClient.beta.vectorStores.create({ name: `Assistant_${assistantId}_VectorStore` });
        openaiVectorStoreId = newVectorStore.id;
        openaiFileIds = [];
      }
    }

    // 2. Deletar arquivos marcados para remoção
    for (const fileId of fileIdsToDelete) {
      if (openaiFileIds.includes(fileId)) {
        try {
          await openaiClient.beta.vectorStores.files.del(openaiVectorStoreId, fileId);
          await openaiClient.files.del(fileId); // Deleta o File Object principal também
          openaiFileIds = openaiFileIds.filter(id => id !== fileId);
          console.log(`[AssistantService] Arquivo deletado da OpenAI: ${fileId}`);
        } catch (error) {
          console.error(`[AssistantService] Erro ao deletar arquivo ${fileId} da OpenAI/Vector Store:`, error.message);
        }
      }
    }

    // 3. Upload de novos arquivos e anexar ao Vector Store
    const newUploadedFileIds = [];
    for (const file of filesToUpload) {
      try {
        const openaiFile = await openaiClient.files.create({
          file: Buffer.from(await file.arrayBuffer()), // Converte File para Buffer
          purpose: 'assistants',
        });
        await openaiClient.beta.vectorStores.files.create(openaiVectorStoreId, { file_id: openaiFile.id });
        newUploadedFileIds.push(openaiFile.id);
        console.log(`[AssistantService] Arquivo enviado para OpenAI: ${openaiFile.id} (${file.name})`);
      } catch (error) {
        console.error(`[AssistantService] Erro ao enviar arquivo ${file.name} para OpenAI:`, error.message);
      }
    }

    openaiFileIds = [...openaiFileIds, ...newUploadedFileIds];

    return { openaiFileIds, openaiVectorStoreId };
  },

  /**
   * Cria um novo Assistente no nosso DB e na OpenAI.
   */
  async createAssistant(userId, assistantData) {
    const user = await User.findByPk(userId, { include: [{ model: Plan, as: 'currentPlan' }] });
    if (!user) throw new Error('Usuário não encontrado.');
    const plan = user.currentPlan;
    if (!plan || user.planExpiresAt < new Date()) throw new Error('Você precisa de um plano ativo para criar assistentes.');
    const planFeatures = plan.features;
    if (!planFeatures.allowUserAssistantCreation) {
      throw new Error('Seu plano não permite a criação de assistentes personalizados.');
    }
    const maxAssistants = planFeatures.maxAssistants ?? -1;
    if (maxAssistants !== -1 && user.assistantsCreatedCount >= maxAssistants) {
      throw new Error(`Você atingiu o limite de ${maxAssistants} assistente(s) para o seu plano.`);
    }

    const { name, model, instructions, executionMode, runConfiguration, knowledgeBase, outputFormat, requiresUserOpenAiToken } = assistantData;
    const filesToUpload = knowledgeBase.files || []; // Frontend envia objetos File
    const openaiClient = requiresUserOpenAiToken && user.openAiApiKey
      ? new OpenAI({ apiKey: user.openAiApiKey })
      : systemOpenai;

    let openaiAssistantId = null;
    let openaiVectorStoreId = null;
    let openaiFileIds = [];

    try {
      // 1. Gerenciar arquivos e Vector Store
      const fileManagementResult = await this._manageAssistantFiles(
        openaiClient,
        null, // No creation, no assistantId yet
        filesToUpload,
        [], // No files to delete on creation
        null // No current vector store ID
      );
      openaiFileIds = fileManagementResult.openaiFileIds;
      openaiVectorStoreId = fileManagementResult.openaiVectorStoreId;

      // 2. Criar Assistente na OpenAI
      const openaiAssistant = await openaiClient.beta.assistants.create({
        name: name,
        instructions: instructions,
        model: model,
        tools: [{ type: 'file_search' }], // Habilita a ferramenta de busca de arquivos
        tool_resources: {
          file_search: {
            vector_stores: [{ tool_resources: { file_ids: openaiFileIds } }],
          },
        },
      });
      openaiAssistantId = openaiAssistant.id;
      console.log(`[AssistantService] Assistente OpenAI criado: ${openaiAssistantId}`);

      // 3. Salvar no nosso DB
      const newAssistantPayload = {
        name,
        model,
        instructions,
        executionMode,
        runConfiguration,
        knowledgeBase: {
          openaiFileIds: openaiFileIds,
        },
        openaiVectorStoreId,
        openaiAssistantId,
        outputFormat: outputFormat || 'text',
        createdByUserId: userId,
        isSystemAssistant: false, // Usuários criam assistentes não-sistema
        requiresUserOpenAiToken,
      };

      const newAssistant = await Assistant.create(newAssistantPayload);
      await user.increment('assistantsCreatedCount');
      return newAssistant;

    } catch (error) {
      console.error('[AssistantService] ERRO ao criar Assistente (OpenAI/DB):', error.message, error.response?.data);
      // Tentar limpar recursos criados na OpenAI em caso de falha no DB
      if (openaiAssistantId) await openaiClient.beta.assistants.del(openaiAssistantId).catch(err => console.error('Erro ao deletar Assistant OpenAI após falha:', err));
      if (openaiVectorStoreId) await openaiClient.beta.vectorStores.del(openaiVectorStoreId).catch(err => console.error('Erro ao deletar Vector Store OpenAI após falha:', err));
      for (const fileId of openaiFileIds) await openaiClient.files.del(fileId).catch(err => console.error('Erro ao deletar File OpenAI após falha:', err));
      throw new Error(`Não foi possível criar o assistente. Erro da OpenAI: ${error.response?.data?.message || error.message}`);
    }
  },

  /**
   * Atualiza um Assistente no nosso DB e na OpenAI.
   */
  async updateAssistant(assistantId, userId, updateData) {
    const assistant = await Assistant.findOne({ where: { id: assistantId, createdByUserId: userId } });
    if (!assistant) {
      throw new Error('Assistente não encontrado ou você não tem permissão para editá-lo.');
    }

    const { name, model, instructions, executionMode, runConfiguration, knowledgeBase, outputFormat, requiresUserOpenAiToken } = updateData;
    const filesToUpload = knowledgeBase?.files || []; // Frontend envia objetos File
    const fileIdsToDelete = knowledgeBase?.fileIdsToDelete || []; // Frontend envia IDs de arquivos OpenAI a deletar

    const openaiClient = requiresUserOpenAiToken && user.openAiApiKey // Use o token do usuário se required ou do sistema
      ? new OpenAI({ apiKey: user.openAiApiKey })
      : systemOpenai;

    try {
      // 1. Gerenciar arquivos e Vector Store
      const fileManagementResult = await this._manageAssistantFiles(
        openaiClient,
        assistant.id, // ID do assistente para nomear recursos
        filesToUpload,
        fileIdsToDelete,
        assistant.openaiVectorStoreId
      );
      const updatedOpenaiFileIds = fileManagementResult.openaiFileIds;
      const updatedOpenaiVectorStoreId = fileManagementResult.openaiVectorStoreId;

      // 2. Atualizar Assistente na OpenAI
      const openaiAssistantPayload = {
        name: name,
        instructions: instructions,
        model: model,
        tools: [{ type: 'file_search' }],
        tool_resources: {
          file_search: {
            vector_stores: [{ tool_resources: { file_ids: updatedOpenaiFileIds } }],
          },
        },
      };

      await openaiClient.beta.assistants.update(assistant.openaiAssistantId, openaiAssistantPayload);
      console.log(`[AssistantService] Assistente OpenAI atualizado: ${assistant.openaiAssistantId}`);

      // 3. Salvar no nosso DB
      const dbUpdatePayload = {
        name,
        model,
        instructions,
        executionMode,
        runConfiguration,
        knowledgeBase: {
          openaiFileIds: updatedOpenaiFileIds,
        },
        openaiVectorStoreId: updatedOpenaiVectorStoreId,
        outputFormat,
        requiresUserOpenAiToken,
      };

      await assistant.update(dbUpdatePayload);
      return assistant;

    } catch (error) {
      console.error('[AssistantService] ERRO ao atualizar Assistente (OpenAI/DB):', error.message, error.response?.data);
      throw new Error(`Não foi possível atualizar o assistente. Erro da OpenAI: ${error.response?.data?.message || error.message}`);
    }
  },

  /**
   * Deleta um assistente do nosso DB e da OpenAI.
   */
  async deleteAssistant(userId, assistantId) {
    const assistant = await Assistant.findByPk(assistantId);
    if (!assistant || assistant.createdByUserId !== userId) { // Garante que o usuário tem permissão
      throw new Error('Assistente não encontrado ou você não tem permissão.');
    }

    const openaiClient = assistant.requiresUserOpenAiToken && assistant.creator?.openAiApiKey
      ? new OpenAI({ apiKey: assistant.creator.openAiApiKey })
      : systemOpenai;

    try {
      // Deletar da OpenAI primeiro
      if (assistant.openaiAssistantId) {
        await openaiClient.beta.assistants.del(assistant.openaiAssistantId);
        console.log(`[AssistantService] Assistente OpenAI deletado: ${assistant.openaiAssistantId}`);
      }
      if (assistant.openaiVectorStoreId) {
        await openaiClient.beta.vectorStores.del(assistant.openaiVectorStoreId);
        console.log(`[AssistantService] Vector Store OpenAI deletado: ${assistant.openaiVectorStoreId}`);
      }

      // Deletar do nosso DB
      const deletedRows = await Assistant.destroy({ where: { id: assistantId } });
      if (deletedRows === 0) {
        throw new Error('Assistente não encontrado no DB.');
      }
      
      // Decrementar contador do usuário
      if (assistant.createdByUserId && assistant.createdByUserId === userId) { // Se foi criado por este usuário
        const user = await User.findByPk(userId);
        if (user && user.assistantsCreatedCount > 0) {
          await user.decrement('assistantsCreatedCount');
        }
      }
      return { message: 'Assistente deletado com sucesso.' };
    } catch (error) {
      console.error('[AssistantService] ERRO ao deletar Assistente:', error.message, error.response?.data);
      throw new Error(`Não foi possível deletar o assistente. Erro da OpenAI: ${error.response?.data?.message || error.message}`);
    }
  },

  /**
   * Executa a ação do assistente sobre uma transcrição usando a API de Assistentes.
   */
  async runAssistantOnTranscription(userId, assistantId, transcriptionId, outputFormat) {
    let historyRecord;
    try {
      const user = await User.findByPk(userId, { include: [{ model: Plan, as: 'currentPlan' }] });
      // Incluir criador para pegar openAiApiKey se necessário
      const assistant = await Assistant.findByPk(assistantId, { include: [{ model: User, as: 'creator' }] });
      const transcription = await Transcription.findByPk(transcriptionId);

      if (!user || !assistant || !transcription) throw new Error('Recursos não encontrados (Usuário, Assistente ou Transcrição).');
      if (!assistant.openaiAssistantId) throw new Error('Este assistente não está configurado corretamente com a OpenAI.');
      if (transcription.userId !== userId || transcription.status !== 'completed') throw new Error('Transcrição inválida ou não concluída.');
      
      const plan = user.currentPlan;
      if (!plan || user.planExpiresAt < new Date()) throw new Error('Você não tem um plano ativo.');
      
      const planFeatures = plan.features;
      let openaiClient = null;
      let usedSystemToken = false;

      // Lógica para determinar qual token da OpenAI usar (usuário ou sistema)
      if (assistant.requiresUserOpenAiToken) {
        if (!user.openAiApiKey) throw new Error('Este assistente requer sua chave da OpenAI. Configure-a em seu perfil.');
        openaiClient = new OpenAI({ apiKey: user.openAiApiKey });
      } else { // Assistente não exige token do usuário, verifica permissões do plano
        if (planFeatures.allowUserProvideOwnToken && user.openAiApiKey) {
          openaiClient = new OpenAI({ apiKey: user.openAiApiKey });
        } else if (planFeatures.useSystemTokenForAI) { // Nova chave: useSystemTokenForAI
          if (planFeatures.maxAssistantUses !== -1 && user.assistantUsesUsed >= planFeatures.maxAssistantUses) {
            throw new Error('Limite de uso de assistentes atingido para o seu plano.');
          }
          openaiClient = systemOpenai; // Usa o token do sistema
          usedSystemToken = true;
        } else {
          throw new Error('Seu plano não permite o uso deste assistente com o token da plataforma. Por favor, forneça sua própria chave da OpenAI ou adquira um plano diferente.');
        }
      }
      
      const finalOutputFormat = outputFormat || assistant.outputFormat;

      historyRecord = await AssistantHistory.create({
        userId, assistantId, transcriptionId,
        inputText: transcription.transcriptionText,
        outputFormat: finalOutputFormat,
        status: 'pending',
        usedSystemToken: usedSystemToken,
      });

      // Inicia o processamento do Assistente da OpenAI em segundo plano
      this._processOpenAIAssistantRunInBackground(historyRecord.id, openaiClient, assistant, transcription.transcriptionText, user, usedSystemToken);
      return historyRecord;

    } catch (error) {
      console.error('[AssistantService] ERRO ao iniciar Run do Assistente:', error.message, error.response?.data);
      if (historyRecord) {
        const errorMessage = error.response?.data?.message || error.message;
        await historyRecord.update({ status: 'failed', errorMessage: `Erro: ${errorMessage}` });
      }
      throw error;
    }
  },
  
  /**
   * Processa o Run do Assistente da OpenAI em segundo plano.
   * Lida com Threads, Mensagens e Runs.
   */
  async _processOpenAIAssistantRunInBackground(historyId, openaiClient, assistant, inputText, user, usedSystemToken) {
    let historyRecord;
    let threadId = null; // Para modo DINAMICO
    try {
      historyRecord = await AssistantHistory.findByPk(historyId);
      if (!historyRecord) {
        console.error(`[AssistantService] Registro de histórico ${historyId} não encontrado.`);
        return;
      }
      await historyRecord.update({ status: 'processing' });

      // 1. Gerenciar Thread (conversa)
      if (assistant.executionMode === 'DINAMICO') {
        // Tentar encontrar uma thread existente para este user-assistant pair
        // Por simplicidade agora, vamos criar uma nova thread a cada run no modo DINAMICO também.
        // Uma implementação mais avançada buscaria a última thread do AssistantHistory para reutilizar.
        // Ou o ThreadId poderia ser armazenado no modelo User/Assistant via uma tabela de junção, etc.
        // Por hora, manteremos a criação por run, mesmo no modo DINAMICO, para demonstrar o conceito.
        const thread = await openaiClient.beta.threads.create();
        threadId = thread.id;
        console.log(`[AssistantService] Nova Thread OpenAI criada para modo DINAMICO: ${threadId}`);
      } else { // FIXO
        const thread = await openaiClient.beta.threads.create();
        threadId = thread.id;
        console.log(`[AssistantService] Nova Thread OpenAI criada para modo FIXO: ${threadId}`);
      }
      
      // Atualiza o registro de histórico com o threadId
      await historyRecord.update({ openaiThreadId: threadId });

      // 2. Adicionar mensagem do usuário à Thread
      await openaiClient.beta.threads.messages.create(threadId, {
        role: 'user',
        content: inputText,
        // Futuro: Adicionar suporte a outros tipos de conteúdo aqui (imagens, etc.)
        // file_ids: [...] se o user enviar arquivos na msg
      });
      console.log(`[AssistantService] Mensagem adicionada à Thread ${threadId}.`);

      // 3. Iniciar o Run do Assistente
      const run = await openaiClient.beta.threads.runs.create(threadId, {
        assistant_id: assistant.openaiAssistantId,
        // Passa os parâmetros de runConfiguration do nosso assistente para o Run da OpenAI
        temperature: assistant.runConfiguration.temperature,
        top_p: assistant.runConfiguration.top_p,
        // max_completion_tokens é usado pelo Assistente, mas não é um param direto do Run de Thread.
        // O assistente tenta respeitar, mas não é um hard limit como no chat completions.
        // Podemos usá-lo para a resposta final.
        // max_completion_tokens: assistant.runConfiguration.max_completion_tokens,
      });
      await historyRecord.update({ openaiRunId: run.id });
      console.log(`[AssistantService] Run OpenAI iniciado: ${run.id} na Thread ${threadId}.`);

      // 4. Polling do status do Run
      let runStatus = run.status;
      while (runStatus === 'queued' || runStatus === 'in_progress' || runStatus === 'cancelling') {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Espera 1 segundo
        const retrievedRun = await openaiClient.beta.threads.runs.retrieve(threadId, run.id);
        runStatus = retrievedRun.status;
        console.log(`[AssistantService] Run ${run.id} status: ${runStatus}`);
      }

      if (runStatus === 'completed') {
        // 5. Recuperar mensagens da Thread para obter o resultado
        const messages = await openaiClient.beta.threads.messages.list(threadId, { order: 'desc', limit: 1 });
        const lastAssistantMessage = messages.data.find(msg => msg.role === 'assistant');
        const outputText = lastAssistantMessage?.content[0]?.text?.value || 'Nenhuma resposta do assistente.';
        console.log(`[AssistantService] Run ${run.id} concluído. Resposta: "${outputText.substring(0, 100)}..."`);

        let outputFilePath = null;
        if (historyRecord.outputFormat === 'pdf') {
          const fileName = `assistant_output_${historyId}`;
          await fs.mkdir(UPLOADS_BASE_DIR, { recursive: true }).catch(err => console.error('Erro ao criar pasta de uploads:', err));
          const fullPath = await pdfGenerator.generateTextPdf(outputText, fileName, UPLOADS_BASE_DIR);
          outputFilePath = path.basename(fullPath); 
          console.log(`[AssistantService] PDF gerado em: ${fullPath}`);
        }
        
        await historyRecord.update({ status: 'completed', outputText, outputFilePath });
        if (usedSystemToken) await user.increment('assistantUsesUsed');
        console.log(`[AssistantService] Ação do assistente ${historyId} concluída e uso do usuário ${user.id} atualizado.`);

      } else {
        // Tratar outros status (failed, cancelled, expired)
        console.error(`[AssistantService] Run ${run.id} falhou com status: ${runStatus}`);
        let errorMessage = `Run finalizou com status "${runStatus}".`;
        if (run.last_error) {
            errorMessage += ` Detalhes: ${JSON.stringify(run.last_error)}`;
        }
        await historyRecord.update({ status: 'failed', errorMessage: `Erro no Run da OpenAI: ${errorMessage}` });
      }

    } catch (error) {
      console.error(`[AssistantService] ERRO CRÍTICO durante o processamento do Run ${historyId}:`, error.message, error.response?.data);
      let errorMessage = 'Erro desconhecido durante a execução do Assistente.';
      if (error.response && error.response.data) {
        errorMessage = `Erro da OpenAI: ${JSON.stringify(error.response.data)}`;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      if (historyRecord) {
        await historyRecord.update({ status: 'failed', errorMessage: `Erro no Run: ${errorMessage}` });
      }
      // Considerar deletar a thread se a falha for irrecuperável e não no modo dinâmico
      if (threadId && assistant.executionMode === 'FIXO') {
        await openaiClient.beta.threads.del(threadId).catch(err => console.error('Erro ao deletar Thread OpenAI após falha:', err));
      }
    }
  },

  /**
   * Lista os assistentes disponíveis para um usuário.
   */
  async listAvailableAssistants(userId) {
    const user = await User.findByPk(userId, { include: [{ model: Plan, as: 'currentPlan' }] });
    if (!user) throw new Error('Usuário não encontrado.');
    const plan = user.currentPlan;
    if (!plan || user.planExpiresAt < new Date()) return [];
    
    const planFeatures = plan.features;
    const userPlanId = plan.id;
    let availableAssistants = [];

    const allSystemAssistants = await Assistant.findAll({ where: { isSystemAssistant: true } });
    allSystemAssistants.forEach(assistant => {
      let isAllowed = true;
      if (assistant.planSpecific && assistant.allowedPlanIds && assistant.allowedPlanIds.length > 0) {
        isAllowed = assistant.allowedPlanIds.includes(userPlanId);
      }
      // Assume-se que 'allowedSystemAssistantIds' pode ser uma whitelist no plano.
      // Se não for definida no plano, todos os assistentes de sistema são permitidos, a menos que o assistente seja planSpecific.
      if (isAllowed && planFeatures.allowedSystemAssistantIds && planFeatures.allowedSystemAssistantIds.length > 0) {
        isAllowed = planFeatures.allowedSystemAssistantIds.includes(assistant.id);
      }
      if (isAllowed) availableAssistants.push(assistant);
    });

    if (planFeatures.allowUserAssistantCreation) {
      const userAssistants = await Assistant.findAll({ where: { isSystemAssistant: false, createdByUserId: userId } });
      availableAssistants = availableAssistants.concat(userAssistants);
    }
    return availableAssistants;
  },

  /**
   * Lista o histórico de ações de assistentes de um usuário.
   */
  async listUserHistory(userId, filters = {}) {
    const { status, page = 1, limit = 10, transcriptionId } = filters;
    const where = { userId };
    if (status) where.status = status;
    if (transcriptionId) where.transcriptionId = transcriptionId; 

    const offset = (page - 1) * limit;
    const { count, rows } = await AssistantHistory.findAndCountAll({
      where,
      include: [
        { model: Assistant, as: 'assistant', attributes: ['id', 'name', 'outputFormat'] },
        { model: Transcription, as: 'transcription', attributes: ['id', 'originalFileName'] }
      ],
      limit: parseInt(limit, 10),
      offset,
      order: [['createdAt', 'DESC']],
      attributes: { exclude: ['outputFilePath', 'inputText', 'outputText'] } 
    });
    return { history: rows, total: count, totalPages: Math.ceil(count / limit), currentPage: parseInt(page, 10) };
  },

  /**
   * Obtém os detalhes de uma ação de assistente específica do histórico.
   */
  async getHistoryById(historyId, userId) {
    const history = await AssistantHistory.findOne({
      where: { id: historyId, userId },
      include: [
        { model: Assistant, as: 'assistant' }, 
        { model: Transcription, as: 'transcription' }
      ]
    });
    if (!history) throw new Error('Registro de histórico não encontrado.');
    return history;
  },

  /**
   * Fornece o caminho completo para download de um arquivo de saída de assistente (PDF).
   */
  async getHistoryOutputFile(historyId, userId) {
    const history = await AssistantHistory.findOne({ 
      where: { id: historyId, userId, status: 'completed', outputFormat: 'pdf' } 
    });
    if (!history || !history.outputFilePath) {
        throw new Error('Arquivo de saída não encontrado ou não disponível para download.');
    }
    
    const fullPath = path.join(UPLOADS_BASE_DIR, history.outputFilePath); 

    try {
        await fs.access(fullPath); 
        return fullPath;
    } catch (err) {
        console.error(`[AssistantService] Arquivo ${fullPath} não encontrado no servidor ou sem permissão de acesso:`, err);
        throw new Error('Arquivo de saída não encontrado no servidor.');
    }
  }
};

module.exports = assistantService;