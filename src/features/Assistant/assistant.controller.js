// src/features/Assistant/assistant.controller.js
const assistantService = require('./assistant.service');
const path = require('path');

const assistantController = {

  async runOnTranscription(req, res, next) {
    try {
      const userId = req.user.userId;
      const { assistantId, transcriptionId, outputFormat } = req.body;
      if (!assistantId || !transcriptionId) return res.status(400).json({ message: 'ID do assistente e ID da transcrição são obrigatórios.' });
      const historyRecord = await assistantService.runAssistantOnTranscription(userId, assistantId, transcriptionId, outputFormat);
      return res.status(202).json({
        message: 'Ação do assistente iniciada com sucesso.',
        historyId: historyRecord.id,
        status: historyRecord.status,
      });
    } catch (error) {
      if (error.message.includes('não encontrado') || error.message.includes('permissão') || error.message.includes('limite')) {
        return res.status(400).json({ message: error.message });
      }
      next(error);
    }
  },

  async listAvailable(req, res, next) {
    try {
      const assistants = await assistantService.listAvailableAssistants(req.user.userId);
      res.status(200).json(assistants);
    } catch (error) { next(error); }
  },

  // <<< MODIFICADO: Passa todos os dados do body para o serviço >>>
  async createMyAssistant(req, res, next) {
    try {
      const userId = req.user.userId;
      // Agora o body pode conter { name, instructions, model, executionMode, knowledgeBase, runConfiguration, outputFormat }
      const assistantData = req.body; 
      const newAssistant = await assistantService.createAssistant(userId, assistantData);
      res.status(201).json({ message: 'Assistente criado com sucesso!', assistant: newAssistant });
    } catch (error) {
       if (error.message.includes('plano') || error.message.includes('limite')) {
        return res.status(403).json({ message: error.message });
      }
      next(error);
    }
  },

  // <<< MODIFICADO: Passa todos os dados do body para o serviço >>>
  async updateMyAssistant(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const updateData = req.body;
      const updatedAssistant = await assistantService.updateAssistant(id, userId, updateData);
      res.status(200).json({ message: 'Assistente atualizado com sucesso!', assistant: updatedAssistant });
    } catch (error) {
      if (error.message.includes('não encontrado') || error.message.includes('permissão')) {
        return res.status(404).json({ message: error.message });
      }
      next(error);
    }
  },

  async deleteMyAssistant(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const result = await assistantService.deleteAssistant(userId, id);
      res.status(200).json(result);
    } catch (error) {
      if (error.message.includes('não encontrado') || error.message.includes('permissão')) {
        return res.status(404).json({ message: error.message });
      }
      next(error);
    }
  },

  async listMyHistory(req, res, next) {
    try {
      const userId = req.user.userId;
      const filters = req.query;
      const result = await assistantService.listUserHistory(userId, filters);
      return res.status(200).json(result);
    } catch (error) { next(error); }
  },

  async getMyHistory(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const history = await assistantService.getHistoryById(id, userId);
      return res.status(200).json(history);
    } catch (error) {
      if (error.message.includes('não encontrado')) return res.status(404).json({ message: error.message });
      next(error);
    }
  },

  async downloadHistoryOutput(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const filePath = await assistantService.getHistoryOutputFile(id, userId);
      const fileName = path.basename(filePath);
      res.download(filePath, fileName, (err) => {
        if (err && !res.headersSent) res.status(500).json({ message: 'Erro ao fazer download.' });
      });
    } catch (error) {
      if (error.message.includes('não encontrado')) return res.status(404).json({ message: error.message });
      next(error);
    }
  },
};

module.exports = assistantController;