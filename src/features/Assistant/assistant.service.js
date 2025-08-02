// src/features/Assistant/assistant.service.js
const { OpenAI } = require('openai');
const { v4: uuidv4 } = require('uuid');
const db = require('../../config/database');
const systemOpenai = require('../../config/openai');
const pdfGenerator = require('../../utils/pdfGenerator');
const path = require('path');
const { Assistant, User, Plan, Transcription, AssistantHistory } = db;

const assistantService = {

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

    const {
        name,
        model,
        instructions,
        executionMode,
        runConfiguration,
        knowledgeBase,
        outputFormat
    } = assistantData;

    const newAssistantPayload = {
        name,
        model, // O nome do modelo já deve vir formatado corretamente do frontend
        instructions,
        executionMode,
        runConfiguration,
        knowledgeBase,
        outputFormat: outputFormat || 'text',
        openaiAssistantId: `ph-assistant-${uuidv4()}`,
        createdByUserId: userId,
        isSystemAssistant: false,
        requiresUserOpenAiToken: true,
    };

    const newAssistant = await Assistant.create(newAssistantPayload);
    
    await user.increment('assistantsCreatedCount');

    return newAssistant;
  },

  async updateAssistant(assistantId, userId, updateData) {
    const assistant = await Assistant.findOne({ where: { id: assistantId, createdByUserId: userId }});
    if (!assistant) {
      throw new Error('Assistente não encontrado ou você não tem permissão para editá-lo.');
    }
    
    delete updateData.id;
    delete updateData.createdByUserId;
    delete updateData.isSystemAssistant;
    delete updateData.openaiAssistantId;
    
    await assistant.update(updateData);
    return assistant;
  },

  async deleteAssistant(userId, assistantId) {
    const user = await User.findByPk(userId);
    if (!user) throw new Error('Usuário não encontrado.');

    const deletedRows = await Assistant.destroy({
      where: { id: assistantId, createdByUserId: userId }
    });

    if (deletedRows === 0) {
      throw new Error('Assistente não encontrado ou você não tem permissão.');
    }
    
    if (user.assistantsCreatedCount > 0) {
      await user.decrement('assistantsCreatedCount');
    }

    return { message: 'Assistente deletado com sucesso.' };
  },

  async runAssistantOnTranscription(userId, assistantId, transcriptionId, outputFormat) {
    let historyRecord;
    try {
      const user = await User.findByPk(userId, { include: [{ model: Plan, as: 'currentPlan' }] });
      const assistant = await Assistant.findByPk(assistantId);
      const transcription = await Transcription.findByPk(transcriptionId);

      if (!user || !assistant || !transcription) throw new Error('Recursos não encontrados.');
      if (assistant.executionMode !== 'FIXO') throw new Error('A estratégia "Dinâmico" ainda não está disponível.');
      if (transcription.userId !== userId || transcription.status !== 'completed') throw new Error('Transcrição inválida.');
      
      const plan = user.currentPlan;
      if (!plan || user.planExpiresAt < new Date()) throw new Error('Você não tem um plano ativo.');
      
      const planFeatures = plan.features;
      let openaiClient = null;
      let useSystemToken = false;

      if (assistant.requiresUserOpenAiToken || !assistant.isSystemAssistant) {
        if (!user.openAiApiKey) throw new Error('Este assistente requer sua chave da OpenAI.');
        openaiClient = new OpenAI({ apiKey: user.openAiApiKey });
      } else {
        if (planFeatures.allowUserProvideOwnAgentToken && user.openAiApiKey) {
          openaiClient = new OpenAI({ apiKey: user.openAiApiKey });
        } else if (planFeatures.useSystemTokenForSystemAgents) {
          if (planFeatures.maxAgentUses !== -1 && user.assistantUsesUsed >= planFeatures.maxAgentUses) {
            throw new Error('Limite de uso de assistentes atingido.');
          }
          openaiClient = systemOpenai;
          useSystemToken = true;
        } else {
          throw new Error('Seu plano não permite o uso de assistentes com o token da plataforma.');
        }
      }
      
      const finalOutputFormat = outputFormat || assistant.outputFormat;
      historyRecord = await AssistantHistory.create({
        userId, assistantId, transcriptionId,
        inputText: transcription.transcriptionText,
        outputFormat: finalOutputFormat,
        status: 'pending',
        usedSystemToken: useSystemToken,
      });

      this._processInBackground(historyRecord.id, openaiClient, assistant, transcription.transcriptionText, user, useSystemToken);
      return historyRecord;
    } catch (error) {
      if (historyRecord) await historyRecord.update({ status: 'failed', errorMessage: error.message });
      throw error;
    }
  },
  
  async _processInBackground(historyId, openaiClient, assistant, inputText, user, useSystemToken) {
    let historyRecord;
    try {
      historyRecord = await AssistantHistory.findByPk(historyId);
      if (!historyRecord) return;
      await historyRecord.update({ status: 'processing' });
      
      let knowledgeText = '';
      if (assistant.knowledgeBase && assistant.knowledgeBase.files && assistant.knowledgeBase.files.length > 0) {
        knowledgeText = assistant.knowledgeBase.files.map(file => file.content).join('\n\n---\n\n');
      }
      
      const finalPrompt = `
        **CONTEXTO DA BASE DE CONHECIMENTO (Use esta informação para basear sua resposta):**
        ---
        ${knowledgeText || 'Nenhum contexto adicional fornecido.'}
        ---

        **SUAS INSTRUÇÕES (Siga estas regras para executar a tarefa):**
        ---
        ${assistant.instructions}
        ---

        **TEXTO A SER PROCESSADO (Aplique suas instruções a este texto):**
        ---
        ${inputText}
        ---
      `;

      const chatCompletion = await openaiClient.chat.completions.create({
        // CORREÇÃO: Remove a formatação do nome do modelo. O frontend já deve enviar o nome correto.
        model: assistant.model, 
        messages: [{ role: 'user', content: finalPrompt }],
        temperature: assistant.runConfiguration.temperature,
        top_p: assistant.runConfiguration.top_p,
        max_tokens: assistant.runConfiguration.max_completion_tokens,
      });

      const outputText = chatCompletion.choices[0].message.content;
      let outputFilePath = null;
      if (historyRecord.outputFormat === 'pdf') {
        const fileName = `assistant_history_${historyId}`;
        const fullPath = await pdfGenerator.generateTextPdf(outputText, fileName);
        outputFilePath = path.relative(path.join(__dirname, '..', '..', 'uploads'), fullPath);
      }
      
      await historyRecord.update({ status: 'completed', outputText, outputFilePath });
      if (useSystemToken) await user.increment('assistantUsesUsed');
    } catch (error) {
      if (historyRecord) {
        // CORREÇÃO: Captura a mensagem de erro específica da API da OpenAI
        const errorMessage = error.response && error.response.data && error.response.data.error ? 
                             JSON.stringify(error.response.data.error) : error.message;
        await historyRecord.update({ status: 'failed', errorMessage: `Erro na API: ${errorMessage}` });
      }
    }
  },

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
      if (assistant.planSpecific && assistant.allowedPlanIds.length > 0) isAllowed = assistant.allowedPlanIds.includes(userPlanId);
      if (isAllowed && planFeatures.allowedSystemAssistantIds && planFeatures.allowedSystemAssistantIds.length > 0) isAllowed = planFeatures.allowedSystemAssistantIds.includes(assistant.id);
      if (isAllowed) availableAssistants.push(assistant);
    });
    if (planFeatures.allowUserAssistantCreation) {
      const userAssistants = await Assistant.findAll({ where: { isSystemAssistant: false, createdByUserId: userId } });
      availableAssistants = availableAssistants.concat(userAssistants);
    }
    return availableAssistants;
  },

  async listUserHistory(userId, filters = {}) {
    const { status, page = 1, limit = 10, transcriptionId } = filters; // ADICIONADO transcriptionId
    const where = { userId };
    if (status) where.status = status;
    if (transcriptionId) where.transcriptionId = transcriptionId; // FILTRO POR transcriptionId

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

  async getHistoryById(historyId, userId) {
    const history = await AssistantHistory.findOne({
      where: { id: historyId, userId },
      // Garante que os dados de assistente e transcrição sejam carregados para o download
      include: [
        { model: Assistant, as: 'assistant' }, 
        { model: Transcription, as: 'transcription' }
      ]
    });
    if (!history) throw new Error('Registro de histórico não encontrado.');
    return history;
  },

  async getHistoryOutputFile(historyId, userId) {
    const history = await AssistantHistory.findOne({ where: { id: historyId, userId, status: 'completed', outputFormat: 'pdf' } });
    if (!history || !history.outputFilePath) throw new Error('Arquivo de saída não encontrado.');
    const fullPath = path.join(__dirname, '..', '..', 'uploads', history.outputFilePath);
    try {
        await fs.promises.access(fullPath);
        return fullPath;
    } catch {
        throw new Error('Arquivo de saída não encontrado no servidor.');
    }
  }
};

module.exports = assistantService;