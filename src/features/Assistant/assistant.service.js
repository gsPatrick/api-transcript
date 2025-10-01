  // src/features/Assistant/assistant.service.js
  const { OpenAI } = require('openai');
  const db = require('../../config/database');
  const systemOpenai = require('../../config/openai');
  const pdfGenerator = require('../../utils/pdfGenerator');
  const path = require('path');
  const fs = require('fs');
  const fsPromises = require('fs/promises');

  const UPLOADS_BASE_DIR = path.resolve(__dirname, '..', '..', '..', 'uploads');
  const { Assistant, User, Plan, Transcription, AssistantHistory } = db;
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const assistantService = {

    // =========================================================================
    // MÉTODOS DE GERENCIAMENTO DE ASSISTENTES (CRUD)
    // =========================================================================

    async createAssistant(userId, assistantData, files = []) {
      const { user } = await this._validateUserPlanForCreation(userId);
      
      const newAssistantDB = await Assistant.create({
        ...assistantData,
        createdByUserId: user.role === 'admin' ? null : userId,
        isSystemAssistant: user.role === 'admin',
        requiresUserOpenAiToken: user.role !== 'admin', 
      });

      const openaiClient = this._getOpenAIClientForManagement(user, newAssistantDB);
      
      let vectorStore;
      try {
        let toolResources = {};
        let tools = [];

        if (files && files.length > 0) {
          tools.push({ type: "file_search" });

          vectorStore = await openaiClient.beta.vectorStores.create({
            name: `VS_${newAssistantDB.name.replace(/\s+/g, '_')}_${Date.now()}`,
          });
          toolResources = { file_search: { vector_store_ids: [vectorStore.id] } };
          
          const fileIds = await this._uploadAndAssociateFiles(openaiClient, vectorStore.id, files);
          
          newAssistantDB.knowledgeBase = { openaiFileIds: fileIds };
          newAssistantDB.openaiVectorStoreId = vectorStore.id;
        }
        
        const openaiAssistant = await openaiClient.beta.assistants.create({
          name: newAssistantDB.name,
          instructions: newAssistantDB.instructions,
          model: newAssistantDB.model,
          tools: tools,
          tool_resources: toolResources,
        });

        newAssistantDB.openaiAssistantId = openaiAssistant.id;
        await newAssistantDB.save();

        if (user.role !== 'admin') {
          await user.increment('assistantsCreatedCount');
        }

        return newAssistantDB;

      } catch (error) {
          console.error("Falha na criação do assistente na OpenAI. Iniciando limpeza...", error);
          if (vectorStore) await openaiClient.beta.vectorStores.del(vectorStore.id).catch(e => console.error("Falha ao limpar Vector Store:", e));
          await newAssistantDB.destroy();
          throw new Error(`Erro ao criar assistente na OpenAI: ${error.message}`);
      }
    },
    
    async updateAssistant(assistantId, userId, updateData, newFiles = [], filesToRemoveIds = []) {
        const { user, assistant } = await this._validateUserAndGetAssistant(userId, assistantId);
        const openaiClient = this._getOpenAIClientForManagement(user, assistant);

        try {
            await openaiClient.beta.assistants.update(assistant.openaiAssistantId, {
                name: updateData.name,
                instructions: updateData.instructions,
                model: updateData.model,
            });

            if (assistant.openaiVectorStoreId) {
                if (filesToRemoveIds.length > 0) {
                    for (const fileId of filesToRemoveIds) {
                        await openaiClient.beta.vectorStores.files.del(assistant.openaiVectorStoreId, fileId);
                        await openaiClient.files.del(fileId);
                    }
                    assistant.knowledgeBase.openaiFileIds = assistant.knowledgeBase.openaiFileIds.filter(id => !filesToRemoveIds.includes(id));
                }
                if (newFiles.length > 0) {
                    const newFileIds = await this._uploadAndAssociateFiles(openaiClient, assistant.openaiVectorStoreId, newFiles);
                    assistant.knowledgeBase.openaiFileIds.push(...newFileIds);
                }
            }
            
            assistant.set(updateData);
            assistant.changed('knowledgeBase', true);
            await assistant.save();
            
            return assistant;

        } catch (error) {
            console.error(`Falha ao atualizar o assistente ${assistantId}:`, error);
            throw new Error(`Erro ao atualizar assistente: ${error.message}`);
        }
    },

    async deleteAssistant(userId, assistantId) {
      const { user, assistant } = await this._validateUserAndGetAssistant(userId, assistantId);
      const openaiClient = this._getOpenAIClientForManagement(user, assistant);

      try {
        await openaiClient.beta.assistants.del(assistant.openaiAssistantId);

        if (assistant.openaiVectorStoreId) {
          await openaiClient.beta.vectorStores.del(assistant.openaiVectorStoreId);
        }

        if (assistant.knowledgeBase?.openaiFileIds?.length > 0) {
          for (const fileId of assistant.knowledgeBase.openaiFileIds) {
            await openaiClient.files.del(fileId).catch(e => console.warn(`Aviso: Arquivo ${fileId} não pôde ser deletado na OpenAI.`));
          }
        }

        await assistant.destroy();
        
        if (user.role !== 'admin' && user.assistantsCreatedCount > 0) {
          await user.decrement('assistantsCreatedCount');
        }

        return { message: 'Assistente e todos os seus dados foram deletados com sucesso.' };
      } catch (e) {
        console.error(`Falha na deleção completa do assistente ${assistantId}:`, e);
        await Assistant.destroy({ where: { id: assistantId } }); 
        throw new Error("Erro na limpeza de dados do assistente na OpenAI, mas o registro local foi removido.");
      }
    },
    
     async listAvailableAssistants(userId) {
      const user = await User.findByPk(userId, { 
        include: [{ model: Plan, as: 'currentPlan' }] 
      });
      if (!user) throw new Error('Usuário não encontrado.');

      if (user.role === 'admin') {
        return Assistant.findAll({
          include: [
            { model: Plan, as: 'allowedPlans', attributes: ['id', 'name'], through: { attributes: [] } },
            { model: User, as: 'creator', attributes: ['id', 'name', 'email'] }
          ],
          order: [['isSystemAssistant', 'DESC'], ['name', 'ASC']]
        });
      }

      if (!user.currentPlan || !user.planExpiresAt || user.planExpiresAt < new Date()) {
        return [];
      }
      
      const userPlan = user.currentPlan;
      const availableAssistants = [];

      const systemAssistants = await Assistant.findAll({ 
        where: { isSystemAssistant: true } 
      });

      systemAssistants.forEach(assistant => {
        if (!assistant.planSpecific) {
          availableAssistants.push(assistant);
        } 
        else if (assistant.allowedPlanIds && assistant.allowedPlanIds.includes(userPlan.id)) {
          availableAssistants.push(assistant);
        }
      });

      if (userPlan.features.allowUserAssistantCreation) {
        const userCreatedAssistants = await Assistant.findAll({
          where: { createdByUserId: userId }
        });
        availableAssistants.push(...userCreatedAssistants);
      }

      return availableAssistants;
    },

    // =========================================================================
    // LÓGICA DE EXECUÇÃO DO ASSISTENTE
    // =========================================================================

    async runAssistantOnTranscription(userId, assistantId, transcriptionId, options = {}) {
      let historyRecord;
      try {
        const { user, assistant, transcription } = await this._validateRunInputs(userId, assistantId, transcriptionId);
        
        if (!assistant.openaiAssistantId) {
          throw new Error("Assistente não sincronizado. Edite e salve o assistente para sincronizar com a OpenAI.");
        }
        
        // ================== INÍCIO DA CORREÇÃO DE PERMISSÃO (Passo 1) ==================
        let openaiClient;

        if (assistant.isSystemAssistant) {
            // Assistentes do sistema SEMPRE devem ser executados com a chave de API do sistema.
            if (!systemOpenai) {
                throw new Error("Chave de API do sistema indisponível para execução.");
            }
            openaiClient = systemOpenai;
        } else {
            // Assistentes de usuário SEMPRE devem ser executados com a chave de API do seu CRIADOR.
            const creator = await User.findByPk(assistant.createdByUserId);
            if (!creator || !creator.openAiApiKey) {
                throw new Error(`O criador do assistente "${assistant.name}" não foi encontrado ou não possui uma chave de API configurada.`);
            }
            openaiClient = new OpenAI({ apiKey: creator.openAiApiKey });
        }
        // ================== FIM DA CORREÇÃO DE PERMISSÃO ==================
        
        const finalOutputFormat = options.outputFormat || assistant.outputFormat;
        
        historyRecord = await AssistantHistory.create({
          userId, 
          assistantId, 
          transcriptionId,
          inputText: transcription.transcriptionText,
          outputFormat: finalOutputFormat,
          status: 'pending',
          // ================== CORREÇÃO DO REGISTRO DE USO (Passo 3) ==================
          usedSystemToken: assistant.isSystemAssistant,
        });

        (async () => {
          try {
            await this._processRunInBackground(historyRecord.id, openaiClient, assistant, transcription.transcriptionText, user, options);
          } catch (error) {
            console.error(`Erro fatal no processo de background [HistoryID: ${historyRecord.id}]:`, error);
            const errorMessage = error.response?.data?.error?.message || error.message;
            await AssistantHistory.update({ status: 'failed', errorMessage: `Erro de background: ${errorMessage}` }, { where: { id: historyRecord.id } });
          }
        })();
        
        return historyRecord;
      } catch (error) {
        if (historyRecord) {
          await historyRecord.update({ status: 'failed', errorMessage: error.message });
        }
        throw error;
      }
    },
    
    async _processRunInBackground(historyId, openaiClient, assistant, inputText, user, options) {
      let threadId;
      let runId;
      try {
        await AssistantHistory.update({ status: 'processing' }, { where: { id: historyId } });

        const thread = await openaiClient.beta.threads.create();
        if (!thread?.id) throw new Error("Falha ao criar Thread na OpenAI.");
        threadId = thread.id;
        await AssistantHistory.update({ openaiThreadId: threadId }, { where: { id: historyId } });
        console.log(`[HistoryID: ${historyId}] Thread criada com ID: ${threadId}`);

        await openaiClient.beta.threads.messages.create(threadId, { 
          role: 'user', 
          content: `Baseado na transcrição a seguir, execute suas instruções.\n\n--- TRANSCRIÇÃO ---\n${inputText}` 
        });
        
        const runConfig = assistant.runConfiguration || {};
        
        const runParams = {
            assistant_id: assistant.openaiAssistantId,
            instructions: options.dynamicPrompt || assistant.instructions,
            temperature: runConfig.temperature ?? 1.0,
            top_p: runConfig.top_p ?? 1.0,
            max_completion_tokens: runConfig.max_completion_tokens || null,
        };

        const run = await openaiClient.beta.threads.runs.create(threadId, runParams);
        if (!run?.id) throw new Error("Falha ao criar Run na OpenAI.");
        runId = run.id;
        await AssistantHistory.update({ openaiRunId: runId }, { where: { id: historyId } });
        console.log(`[HistoryID: ${historyId}] Run criada com ID: ${runId}. Iniciando polling.`);
        console.log(`[DEBUG BEFORE POLLING] threadId: "${threadId}", runId: "${runId}"`);
        await this._pollRunStatus(historyId, threadId, runId, openaiClient, user);

      } catch (error) {
        const errorMessage = error.response?.data?.error?.message || error.message;
        console.error(`[ERRO] Falha em _processRunInBackground para HistoryID: ${historyId}. Causa: ${errorMessage}`, { stack: error.stack });
        await AssistantHistory.update({ status: 'failed', errorMessage: `Erro na API OpenAI: ${errorMessage}` }, { where: { id: historyId } });
      }
    },

    async _pollRunStatus(historyId, threadId, runId, openaiClient, user) {
      console.log(`[DEBUG POLL START] historyId: ${historyId}`);
      console.log(`[DEBUG POLL START] threadId: "${threadId}" (tipo: ${typeof threadId})`);
      console.log(`[DEBUG POLL START] runId: "${runId}" (tipo: ${typeof runId})`);
      console.log(`[DEBUG POLL START] openaiClient:`, !!openaiClient);
      console.log(`[DEBUG POLL START] openaiClient.beta:`, !!openaiClient?.beta);
      console.log(`[DEBUG POLL START] openaiClient.beta.threads:`, !!openaiClient?.beta?.threads);
      console.log(`[DEBUG POLL START] openaiClient.beta.threads.runs:`, !!openaiClient?.beta?.threads?.runs);
      
      const startTime = Date.now();
      const timeout = 5 * 60 * 1000;

      while (Date.now() - startTime < timeout) {
        try {
          if (typeof threadId !== 'string' || !threadId.startsWith('thread_')) {
            throw new Error(`[Validação] ID da Thread inválido no polling: ${threadId}`);
          }
          if (typeof runId !== 'string' || !runId.startsWith('run_')) {
              throw new Error(`[Validação] ID da Run inválido no polling: ${runId}`);
          }
          
          console.log(`[Polling] HistoryID: ${historyId} - Verificando status da Run: ${runId} na Thread: ${threadId}`);
          console.log(`[DEBUG RETRIEVE] Tentativa 1 - Método direto`);
          console.log(`[DEBUG RETRIEVE] threadId: "${threadId}", runId: "${runId}"`);
          
          try {
            const runStatus = await openaiClient.beta.threads.runs.retrieve(threadId, runId);
            console.log(`[SUCCESS] Retrieve funcionou! Status: ${runStatus.status}`);
            
            await AssistantHistory.update({ status: runStatus.status }, { where: { id: historyId } });

            if (runStatus.status === 'completed') {
                await this._processCompletedRun(historyId, threadId, openaiClient, user);
                return;
            }
            
            if (['failed', 'cancelled', 'expired'].includes(runStatus.status)) {
                const lastError = runStatus.last_error;
                const errorMessage = `A execução falhou com status: ${runStatus.status}. Causa: ${lastError ? lastError.message : 'Nenhuma informação adicional.'}`;
                console.error(`[ERRO] HistoryID: ${historyId} - ${errorMessage}`);
                await AssistantHistory.update({ status: 'failed', errorMessage }, { where: { id: historyId } });
                return;
            }

            if (runStatus.status === 'requires_action') {
                const errorMessage = 'A execução parou pois requer uma ação manual (ex: function calling) que não está implementada.';
                console.warn(`[AVISO] Run ${runId} requer ação.`, runStatus.required_action);
                await AssistantHistory.update({ status: 'failed', errorMessage }, { where: { id: historyId } });
                return;
            }

            await sleep(3000);
            
          } catch (retrieveError) {
            console.error(`[ERRO RETRIEVE] Falha na chamada retrieve:`, retrieveError.message);
            
            console.log(`[DEBUG] Tentativa 2 - Usando abordagem alternativa`);
            
            try {
              const url = `https://api.openai.com/v1/threads/${threadId}/runs/${runId}`;
              console.log(`[DEBUG] URL construída: ${url}`);
              
              const response = await fetch(url, {
                method: 'GET',
                headers: {
                  'Authorization': `Bearer ${openaiClient.apiKey}`,
                  'Content-Type': 'application/json',
                  'OpenAI-Beta': 'assistants=v2'
                }
              });
              
              if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
              }
              
              const runStatus = await response.json();
              console.log(`[SUCCESS] Fetch direto funcionou! Status: ${runStatus.status}`);
              
              await AssistantHistory.update({ status: runStatus.status }, { where: { id: historyId } });

              if (runStatus.status === 'completed') {
                  await this._processCompletedRun(historyId, threadId, openaiClient, user);
                  return;
              }
              
            } catch (fetchError) {
              console.error(`[ERRO FETCH] Falha no fetch direto:`, fetchError.message);
              throw retrieveError;
            }
          }

        } catch (error) {
          const errorMessage = error.response?.data?.error?.message || error.message;
          console.error(`[ERRO] Exceção durante o polling [RunID: ${runId}]: ${errorMessage}`, { stack: error.stack });
          await AssistantHistory.update({ status: 'failed', errorMessage: `Erro de comunicação com a OpenAI: ${errorMessage}` }, { where: { id: historyId } });
          return;
        }
      }

      const timeoutMessage = 'A execução excedeu o tempo limite de 5 minutos.';
      console.error(`[ERRO] HistoryID: ${historyId} - ${timeoutMessage}`);
      await AssistantHistory.update({ status: 'failed', errorMessage: timeoutMessage }, { where: { id: historyId } });
    },

    async _processCompletedRun(historyId, threadId, openaiClient, user) {
      const messages = await openaiClient.beta.threads.messages.list(threadId, { order: 'desc', limit: 1 });
      if (!messages.data.length || messages.data[0].role !== 'assistant') {
          throw new Error('Nenhuma resposta do assistente foi encontrada na thread após a conclusão.');
      }
      const outputText = messages.data[0].content.filter(c => c.type === 'text').map(c => c.text.value).join('\n');
      const historyRecord = await AssistantHistory.findByPk(historyId);
      let outputFilePath = null;
      if (historyRecord.outputFormat === 'pdf') {
          const fileName = `assistant_output_${historyId}`;
          await fsPromises.mkdir(UPLOADS_BASE_DIR, { recursive: true });
          const fullPath = await pdfGenerator.generateTextPdf(outputText, fileName, UPLOADS_BASE_DIR);
          outputFilePath = path.basename(fullPath); 
      }
      await historyRecord.update({ status: 'completed', outputText, outputFilePath });
      if (historyRecord.usedSystemToken) await user.increment('assistantUsesUsed');
    },
    
    // =========================================================================
    // MÉTODOS AUXILIARES E DE VALIDAÇÃO
    // =========================================================================
    
    async _uploadAndAssociateFiles(openaiClient, vectorStoreId, files) {
        const uploadPromises = files.map(file => {
            return openaiClient.files.create({
                file: fs.createReadStream(file.path),
                purpose: 'assistants',
            });
        });
        const openaiFiles = await Promise.all(uploadPromises);

        await openaiClient.beta.vectorStores.fileBatches.create(vectorStoreId, {
            file_ids: openaiFiles.map(f => f.id)
        });
        
        files.forEach(file => fsPromises.unlink(file.path).catch(err => console.error(`Falha ao remover arquivo temporário ${file.path}:`, err)));

        return openaiFiles.map(file => file.id);
    },
    
    _getOpenAIClientForManagement(user, assistant) {
        if (user.role === 'admin' || !assistant.requiresUserOpenAiToken) {
            if (!systemOpenai) throw new Error("A chave de API do sistema não está configurada.");
            return systemOpenai;
        }
        if (!user.openAiApiKey) throw new Error('Esta ação requer sua chave de API da OpenAI.');
        return new OpenAI({ apiKey: user.openAiApiKey });
    },
    
    // ================== FUNÇÃO REMOVIDA (Passo 2) ==================
    /*
    _getOpenAIClientForExecution(user, assistant) {
      if (user.role === 'admin' || !assistant.requiresUserOpenAiToken) {
        if (!systemOpenai) throw new Error("Chave de API do sistema indisponível para execução.");
        return systemOpenai;
      }
      if (!user.openAiApiKey) throw new Error('Este assistente requer sua chave de API OpenAI para ser executado.');
      return new OpenAI({ apiKey: user.openAiApiKey });
    },
    */

   async _validateUserPlanForCreation(userId) {
    if (!userId) {
      return { user: { role: 'admin' } };
    }

    const user = await User.findByPk(userId, { include: [{ model: Plan, as: 'currentPlan' }] });
    if (!user) throw new Error('Usuário não encontrado.');

    if (user.role !== 'admin') {
        const plan = user.currentPlan;
        if (!plan || user.planExpiresAt < new Date()) throw new Error('Você precisa de um plano ativo para criar assistentes.');
        const planFeatures = plan.features;
        if (!planFeatures.allowUserAssistantCreation) throw new Error('Seu plano não permite criar assistentes.');
        const max = planFeatures.maxAssistants ?? 0;
        if (max !== -1 && user.assistantsCreatedCount >= max) throw new Error('Você atingiu o limite de criação de assistentes do seu plano.');
    }
    return { user };
  },

    async _validateUserAndGetAssistant(userId, assistantId) {
        const user = await User.findByPk(userId);
        if (!user) throw new Error('Usuário não encontrado.');
        const whereClause = { id: assistantId };
        if (user.role !== 'admin') {
          whereClause.createdByUserId = userId;
        }
        const assistant = await Assistant.findOne({ where: whereClause });
        if (!assistant) throw new Error('Assistente não encontrado ou você não tem permissão de acesso.');
        return { user, assistant };
    },

  async _validateRunInputs(userId, assistantId, transcriptionId) {
        const user = await User.findByPk(userId, { include: { model: Plan, as: 'currentPlan' } });
        if (!user) throw new Error('Usuário não encontrado.');
  
        const assistant = await Assistant.findByPk(assistantId);
        if (!assistant) throw new Error('Assistente não encontrado.');
  
        const transcriptionWhereClause = { id: transcriptionId };
        if (user.role !== 'admin') {
            transcriptionWhereClause.userId = user.id;
        }
        const transcription = await Transcription.findOne({ where: transcriptionWhereClause });

        if (!transcription) throw new Error('Transcrição não encontrada ou sem permissão de acesso.');
        if (transcription.status !== 'completed') throw new Error('A transcrição ainda não foi concluída e não pode ser usada.');
  
        if (user.role !== 'admin') {
            if (!assistant.requiresUserOpenAiToken) {
                const plan = user.currentPlan;
                if (!plan || user.planExpiresAt < new Date()) {
                    throw new Error('Você precisa de um plano ativo para executar assistentes.');
                }
                const limit = plan.features.maxAssistantUses ?? 0;
                if (limit !== -1 && user.assistantUsesUsed >= limit) {
                    throw new Error('Você atingiu o limite de uso de assistentes do seu plano.');
                }
            }
        }

        return { user, assistant, transcription };
    },
      
    
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
        attributes: { exclude: ['inputText', 'outputText'] }
      });
      return { history: rows, total: count, totalPages: Math.ceil(count / limit), currentPage: parseInt(page, 10) };
    },

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

    async getHistoryOutputFile(historyId, userId) {
      const history = await AssistantHistory.findOne({
        where: { id: historyId, userId, status: 'completed' }
      });
      if (!history || !history.outputFilePath || history.outputFormat !== 'pdf') {
        throw new Error('Arquivo de saída não encontrado, não está pronto ou não está em formato PDF.');
      }
      
      const fullPath = path.join(UPLOADS_BASE_DIR, history.outputFilePath);
      try {
        await fsPromises.access(fullPath);
        return fullPath;
      } catch (err) {
        console.error(`Arquivo ${fullPath} não encontrado no servidor:`, err);
        throw new Error('Arquivo de saída não encontrado no servidor.');
      }
    }
  };

  module.exports = assistantService;