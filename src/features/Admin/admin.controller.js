// src/features/Admin/admin.controller.js
const adminService = require('./admin.service');
const multer = require('multer');
const upload = multer(); // Usado para o upload de arquivos de assistentes

const adminController = {
  /* Métodos de Dashboard */
  async getDashboardStats(req, res, next) {
    try {
      const stats = await adminService.getDashboardStats();
      res.status(200).json(stats);
    } catch (error) { next(error); }
  },

  /* Métodos de Gerenciamento de Usuários */
async getAllUsers(req, res, next) {
    try {
      // O serviço agora ignora o req.query e retorna um array simples.
      const users = await adminService.getAllUsers(req.query);
      // <<< MUDANÇA: A API agora retorna o array de usuários diretamente >>>
      res.status(200).json(users);
    } catch (error) { next(error); }
  },

  async updateUser(req, res, next) {
    try {
      const user = await adminService.updateUser(req.params.id, req.body);
      res.status(200).json(user);
    } catch (error) {
      if (error.message.includes('não encontrado')) return res.status(404).json({ message: error.message });
      next(error);
    }
  },

  // <<< NOVO MÉTODO PARA ATUALIZAR SENHA PELO ADMIN >>>
  async updateUserPassword(req, res, next) {
    try {
      const { id } = req.params;
      const { newPassword } = req.body;

      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ message: 'A nova senha é obrigatória e deve ter no mínimo 6 caracteres.' });
      }

      const result = await adminService.updateUserPassword(id, newPassword);
      res.status(200).json(result);
    } catch (error) {
      if (error.message.includes('não encontrado')) {
        return res.status(404).json({ message: error.message });
      }
      next(error);
    }
  },
  // <<< FIM DO NOVO MÉTODO >>>

  async deleteUser(req, res, next) {
    try {
      const result = await adminService.deleteUser(req.params.id);
      res.status(200).json(result);
    } catch (error) {
      if (error.message.includes('não encontrado')) return res.status(404).json({ message: error.message });
      next(error);
    }
  },

  async assignPlanToUser(req, res, next) {
    try {
      const { userId, planId } = req.body;
      const result = await adminService.assignPlanToUser(userId, planId);
      res.status(200).json(result);
    } catch (error) {
      if (error.message.includes('não encontrado')) return res.status(404).json({ message: error.message });
      next(error);
    }
  },

  /* Métodos de Gerenciamento de Planos */
  async getAllPlans(req, res, next) {
    try {
      const plans = await adminService.getAllPlans();
      res.status(200).json(plans);
    } catch (error) { next(error); }
  },
  async createPlan(req, res, next) {
    try {
      const plan = await adminService.createPlan(req.body);
      res.status(201).json(plan);
    } catch (error) { next(error); }
  },
  async updatePlan(req, res, next) {
    try {
      const plan = await adminService.updatePlan(req.params.id, req.body);
      res.status(200).json(plan);
    } catch (error) { next(error); }
  },
  async deletePlan(req, res, next) {
    try {
      const result = await adminService.deletePlan(req.params.id);
      res.status(200).json(result);
    } catch (error) { next(error); }
  },

  /* Métodos de Gerenciamento de Configurações */
  async getAllSettings(req, res, next) {
    try {
      const settings = await adminService.getAllSettings();
      res.status(200).json(settings);
    } catch (error) { next(error); }
  },
  async updateSetting(req, res, next) {
    try {
      const setting = await adminService.updateSetting(req.params.key, req.body.value);
      res.status(200).json({ message: 'Configuração atualizada com sucesso!', setting });
    } catch (error) { next(error); }
  },
  
  /* Métodos de Gerenciamento de Agentes (Legado) */
  async getSystemAgents(req, res, next) {
    try {
      const agents = await adminService.getSystemAgents();
      res.status(200).json(agents);
    } catch (error) { next(error); }
  },
  async getUserCreatedAgents(req, res, next) {
    try {
      const agents = await adminService.getUserCreatedAgents();
      res.status(200).json(agents);
    } catch (error) { next(error); }
  },
  async createSystemAgent(req, res, next) {
    try {
      const agent = await adminService.createSystemAgent(req.body);
      res.status(201).json(agent);
    } catch (error) { next(error); }
  },
  async updateSystemAgent(req, res, next) {
    try {
      const agent = await adminService.updateSystemAgent(req.params.id, req.body);
      res.status(200).json(agent);
    } catch (error) { next(error); }
  },
  async deleteSystemAgent(req, res, next) {
    try {
      const result = await adminService.deleteSystemAgent(req.params.id);
      res.status(200).json(result);
    } catch (error) { next(error); }
  },

  /* Métodos de Gerenciamento de Assistentes */
  async getSystemAssistants(req, res, next) {
    try {
      const assistants = await adminService.getSystemAssistants();
      res.status(200).json(assistants);
    } catch (error) { next(error); }
  },
  async getUserCreatedAssistants(req, res, next) {
    try {
      const assistants = await adminService.getUserCreatedAssistants();
      res.status(200).json(assistants);
    } catch (error) { next(error); }
  },
  async createSystemAssistant(req, res, next) {
    try {
      // O middleware multer (upload.array('knowledgeFiles')) deve ser usado na rota
      const assistant = await adminService.createSystemAssistant(req.body, req.files);
      res.status(201).json(assistant);
    } catch (error) { next(error); }
  },
  async updateSystemAssistant(req, res, next) {
    try {
      const assistant = await adminService.updateSystemAssistant(req.params.id, req.body, req.files);
      res.status(200).json(assistant);
    } catch (error) { next(error); }
  },
  async deleteSystemAssistant(req, res, next) {
    try {
      const result = await adminService.deleteSystemAssistant(req.params.id);
      res.status(200).json(result);
    } catch (error) { next(error); }
  },

  /* Métodos de Gerenciamento de Transcrições */
  async getAllTranscriptions(req, res, next) {
    try {
      const result = await adminService.getAllTranscriptions(req.query);
      res.status(200).json(result);
    } catch (error) { next(error); }
  },
  async updateTranscription(req, res, next) {
    try {
      const transcription = await adminService.updateTranscription(req.params.id, req.body);
      res.status(200).json(transcription);
    } catch (error) { next(error); }
  },
  async deleteTranscription(req, res, next) {
    try {
      const result = await adminService.deleteTranscription(req.params.id);
      res.status(200).json(result);
    } catch (error) { next(error); }
  },

  /* Métodos de Gerenciamento de Histórico */
  async getAllHistory(req, res, next) {
    try {
      const result = await adminService.getAllHistory(req.query);
      res.status(200).json(result);
    } catch (error) { next(error); }
  }
};

module.exports = adminController;
