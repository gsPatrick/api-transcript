// src/features/Admin/admin.controller.js

const adminService = require('./admin.service');

const adminController = {
  // --- Controladores de Usuários ---
  async getAllUsers(req, res, next) {
    try {
      const result = await adminService.getAllUsers(req.query);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },

  async getUserById(req, res, next) {
    try {
      const user = await adminService.getUserById(req.params.id);
      res.status(200).json(user);
    } catch (error) {
      if (error.message.includes('não encontrado')) return res.status(404).json({ message: error.message });
      next(error);
    }
  },

  async updateUser(req, res, next) {
    try {
      const updatedUser = await adminService.updateUser(req.params.id, req.body);
      res.status(200).json({ message: 'Usuário atualizado com sucesso!', user: updatedUser });
    } catch (error) {
      if (error.message.includes('não encontrado')) return res.status(404).json({ message: error.message });
      next(error);
    }
  },

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
      if (!userId) return res.status(400).json({ message: 'ID do usuário é obrigatório.' });
      const result = await adminService.assignPlanToUser(userId, planId);
      res.status(200).json(result);
    } catch (error) {
      if (error.message.includes('não encontrado')) return res.status(404).json({ message: error.message });
      next(error);
    }
  },

  // --- Controladores de Planos ---
  async createPlan(req, res, next) {
    try {
      const newPlan = await adminService.createPlan(req.body);
      res.status(201).json(newPlan);
    } catch (error) {
      next(error);
    }
  },

  async getAllPlans(req, res, next) {
    try {
      const plans = await adminService.getAllPlans();
      res.status(200).json(plans);
    } catch (error) {
      next(error);
    }
  },
  
  // --- Rota para Estatísticas do Dashboard ---
  async getDashboardStats(req, res, next) {
    try {
      const stats = await adminService.getDashboardStats();
      res.status(200).json(stats);
    } catch (error) {
      next(error);
    }
  },

  // --- Rotas para Gerenciamento de Configurações Globais ---
  async listSettings(req, res, next) {
    try {
      const settingsList = await adminService.listGlobalSettings();
      res.status(200).json(settingsList);
    } catch (error) {
      next(error);
    }
  },

  async updateSetting(req, res, next) {
    try {
      const { key } = req.params;
      const { value } = req.body;
      if (value === undefined) return res.status(400).json({ message: 'O campo "value" é obrigatório.' });
      const updatedSetting = await adminService.updateGlobalSetting(key, value);
      res.status(200).json({ message: 'Configuração atualizada com sucesso.', setting: updatedSetting });
    } catch (error) {
      next(error);
    }
  },

  // --- Controladores de Assistentes (Sistema) ---
  async createSystemAssistant(req, res, next) {
    try {
      const assistantData = req.body;
      const files = req.files || [];

      // Faz o "parse" dos campos que foram enviados como strings JSON
      try {
        if (assistantData.runConfiguration) assistantData.runConfiguration = JSON.parse(assistantData.runConfiguration);
        if (assistantData.allowedPlanIds) assistantData.allowedPlanIds = JSON.parse(assistantData.allowedPlanIds);
      } catch (e) {
        return res.status(400).json({ message: 'Dados de configuração (runConfiguration, allowedPlanIds) inválidos.' });
      }
      
      const newAssistant = await adminService.createSystemAssistant(assistantData, files);
      res.status(201).json(newAssistant);
    } catch (error) {
      next(error);
    }
  },

  async getAllSystemAssistants(req, res, next) {
    try {
      const assistants = await adminService.getAllSystemAssistants();
      res.status(200).json(assistants);
    } catch (error) {
      next(error);
    }
  },

  async getSystemAssistantById(req, res, next) {
    try {
      const assistant = await adminService.getSystemAssistantById(req.params.id);
      res.status(200).json(assistant);
    } catch (error) {
      if (error.message.includes('não encontrado')) return res.status(404).json({ message: error.message });
      next(error);
    }
  },

  async updateSystemAssistant(req, res, next) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const newFiles = req.files || [];
      let filesToRemoveIds = [];

      // Faz o "parse" dos campos que foram enviados como strings JSON
      try {
        if (updateData.runConfiguration) updateData.runConfiguration = JSON.parse(updateData.runConfiguration);
        if (updateData.allowedPlanIds) updateData.allowedPlanIds = JSON.parse(updateData.allowedPlanIds);
        if (updateData.filesToRemoveIds) filesToRemoveIds = JSON.parse(updateData.filesToRemoveIds);
      } catch (e) {
        return res.status(400).json({ message: 'Dados de configuração (runConfiguration, allowedPlanIds, filesToRemoveIds) inválidos.' });
      }
      
      delete updateData.filesToRemoveIds; // Remove do objeto principal para não ser passado ao service

      const updatedAssistant = await adminService.updateSystemAssistant(id, updateData, newFiles, filesToRemoveIds);
      res.status(200).json(updatedAssistant);
    } catch (error) {
      if (error.message.includes('não encontrado')) return res.status(404).json({ message: error.message });
      next(error);
    }
  },

  async deleteSystemAssistant(req, res, next) {
    try {
      const result = await adminService.deleteSystemAssistant(req.params.id);
      res.status(200).json(result);
    } catch (error) {
      if (error.message.includes('não encontrado')) return res.status(404).json({ message: error.message });
      next(error);
    }
  },
  
  async getAllUserCreatedAssistants(req, res, next) {
    try {
      const assistants = await adminService.getAllUserCreatedAssistants();
      res.status(200).json(assistants);
    } catch (error) {
      next(error);
    }
  },

  // <<< ADICIONADO: Controlador para ATUALIZAR um plano >>>
  async updatePlan(req, res, next) {
    try {
      const updatedPlan = await adminService.updatePlan(req.params.id, req.body);
      res.status(200).json(updatedPlan);
    } catch (error) {
      if (error.message.includes('não encontrado')) return res.status(404).json({ message: error.message });
      next(error);
    }
  },

  // <<< ADICIONADO: Controlador para DELETAR um plano >>>
  async deletePlan(req, res, next) {
    try {
      const result = await adminService.deletePlan(req.params.id);
      res.status(200).json(result);
    } catch (error) {
      if (error.message.includes('não encontrado')) return res.status(404).json({ message: error.message });
      next(error);
    }
  },

  // <<< ADICIONADO: Controlador para listar TODO o histórico >>>
  async getAllHistory(req, res, next) {
    try {
      const result = await adminService.getAllHistory(req.query);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },

};


module.exports = adminController;