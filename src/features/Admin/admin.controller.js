const adminService = require('./admin.service');

const adminController = {
  // --- Controladores de Planos ---
  async createPlan(req, res) {
    try {
      const newPlan = await adminService.createPlan(req.body);
      return res.status(201).json(newPlan);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  },

  async getAllPlans(req, res) {
    try {
      const plans = await adminService.getAllPlans();
      return res.status(200).json(plans);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  },

  async getPlanById(req, res) {
    try {
      const plan = await adminService.getPlanById(req.params.id);
      return res.status(200).json(plan);
    } catch (error) {
      if (error.message.includes('Plano não encontrado')) {
        return res.status(404).json({ message: error.message });
      }
      return res.status(500).json({ message: error.message });
    }
  },

  async updatePlan(req, res) {
    try {
      const updatedPlan = await adminService.updatePlan(req.params.id, req.body);
      return res.status(200).json(updatedPlan);
    } catch (error) {
      if (error.message.includes('Plano não encontrado')) {
        return res.status(404).json({ message: error.message });
      }
      return res.status(400).json({ message: error.message });
    }
  },

  async deletePlan(req, res) {
    try {
      const result = await adminService.deletePlan(req.params.id);
      return res.status(200).json(result);
    } catch (error) {
      if (error.message.includes('Plano não encontrado')) {
        return res.status(404).json({ message: error.message });
      }
      return res.status(500).json({ message: error.message });
    }
  },

  // --- Controladores de Agentes (Sistema) ---
 async createSystemAgent(req, res) {
    try {
      const newAgent = await adminService.createSystemAgent(req.body);
      return res.status(201).json(newAgent);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  },

  async updateSystemAgent(req, res) {
    try {
      const updatedAgent = await adminService.updateSystemAgent(req.params.id, req.body);
      return res.status(200).json(updatedAgent);
    } catch (error) {
      if (error.message.includes('Agente do sistema não encontrado')) {
        return res.status(404).json({ message: error.message });
      }
      return res.status(400).json({ message: error.message });
    }
  },
  async getAllSystemAgents(req, res) {
    try {
      const agents = await adminService.getAllSystemAgents();
      return res.status(200).json(agents);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  },

  async getSystemAgentById(req, res) {
    try {
      const agent = await adminService.getSystemAgentById(req.params.id);
      return res.status(200).json(agent);
    } catch (error) {
      if (error.message.includes('Agente do sistema não encontrado')) {
        return res.status(404).json({ message: error.message });
      }
      return res.status(500).json({ message: error.message });
    }
  },


  async deleteSystemAgent(req, res) {
    try {
      const result = await adminService.deleteSystemAgent(req.params.id);
      return res.status(200).json(result);
    } catch (error) {
      if (error.message.includes('Agente do sistema não encontrado')) {
        return res.status(404).json({ message: error.message });
      }
      return res.status(500).json({ message: error.message });
    }
  },

  // --- Controladores de Usuários (Admin) ---
  async assignPlanToUser(req, res) {
    const { userId, planId } = req.body;
    if (!userId || !planId) {
      return res.status(400).json({ message: 'ID do usuário e ID do plano são obrigatórios.' });
    }
    try {
      const result = await adminService.assignPlanToUser(userId, planId);
      return res.status(200).json(result);
    } catch (error) {
      if (error.message.includes('Usuário não encontrado') || error.message.includes('Plano não encontrado')) {
        return res.status(404).json({ message: error.message });
      }
      return res.status(500).json({ message: error.message });
    }
  },

  async setAdminRole(req, res) {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ message: 'ID do usuário é obrigatório.' });
    }
    try {
      const result = await adminService.setAdminRole(userId);
      return res.status(200).json(result);
    } catch (error) {
      if (error.message.includes('Usuário não encontrado')) {
        return res.status(404).json({ message: error.message });
      }
      return res.status(500).json({ message: error.message });
    }
  },
   async updateSetting(req, res, next) {
    try {
      const { key } = req.params;
      const { value, description, isSensitive } = req.body;

      if (!value) {
        return res.status(400).json({ message: 'O valor da configuração é obrigatório.' });
      }

      const updatedSetting = await adminService.updateGlobalSetting(key, value, description, isSensitive);
      return res.status(200).json({ message: 'Configuração atualizada com sucesso.', setting: updatedSetting });
    } catch (error) {
      console.error('Erro no controller updateSetting:', error);
      next(error);
    }
  },

  async getSetting(req, res, next) {
    try {
      const { key } = req.params;
      const setting = await adminService.getGlobalSetting(key);
      return res.status(200).json(setting);
    } catch (error) {
      console.error('Erro no controller getSetting:', error);
      if (error.message.includes('não encontrada')) {
        return res.status(404).json({ message: error.message });
      }
      next(error);
    }
  },

  async listSettings(req, res, next) {
    try {
      const settingsList = await adminService.listGlobalSettings();
      return res.status(200).json(settingsList);
    } catch (error) {
      console.error('Erro no controller listSettings:', error);
      next(error);
    }
  },
};

module.exports = adminController;