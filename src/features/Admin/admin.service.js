const db = require('../../config/database');
const Plan = db.Plan;
const Agent = db.Agent;
const User = db.User; // Para poder criar um admin inicial

const adminService = {
  // --- Funções de gerenciamento de Planos ---

  async createPlan(planData) {
    try {
      const newPlan = await Plan.create(planData);
      return newPlan;
    } catch (error) {
      console.error('Erro ao criar plano:', error);
      throw new Error('Não foi possível criar o plano. Verifique os dados e tente novamente.');
    }
  },

  async getAllPlans() {
    try {
      const plans = await Plan.findAll();
      return plans;
    } catch (error) {
      console.error('Erro ao buscar planos:', error);
      throw new Error('Não foi possível buscar os planos.');
    }
  },

  async getPlanById(planId) {
    try {
      const plan = await Plan.findByPk(planId);
      if (!plan) {
        throw new Error('Plano não encontrado.');
      }
      return plan;
    } catch (error) {
      console.error('Erro ao buscar plano por ID:', error);
      throw error;
    }
  },

  async updatePlan(planId, updateData) {
    try {
      const [updatedRows] = await Plan.update(updateData, {
        where: { id: planId },
      });
      if (updatedRows === 0) {
        throw new Error('Plano não encontrado ou nenhum dado para atualizar.');
      }
      const updatedPlan = await Plan.findByPk(planId);
      return updatedPlan;
    } catch (error) {
      console.error('Erro ao atualizar plano:', error);
      throw error;
    }
  },

  async deletePlan(planId) {
    try {
      const deletedRows = await Plan.destroy({ where: { id: planId } });
      if (deletedRows === 0) {
        throw new Error('Plano não encontrado.');
      }
      return { message: 'Plano excluído com sucesso.' };
    } catch (error) {
      console.error('Erro ao deletar plano:', error);
      throw error;
    }
  },

  // --- Funções de gerenciamento de Agentes (Sistema) ---

  async createSystemAgent(agentData) {
    try {
      agentData.isSystemAgent = true;
      agentData.createdByUserId = null; // Agentes do sistema não têm criador específico

      // Validar allowedPlanIds se planSpecific for true
      if (agentData.planSpecific && (!Array.isArray(agentData.allowedPlanIds) || agentData.allowedPlanIds.length === 0)) {
        throw new Error('Se o agente for específico por plano, a lista de IDs de planos permitidos não pode ser vazia.');
      }
      if (!agentData.planSpecific) {
        agentData.allowedPlanIds = []; // Garante que é um array vazio se não for planSpecific
      }

      const newAgent = await Agent.create(agentData);
      return newAgent;
    } catch (error) {
      console.error('Erro ao criar agente do sistema:', error);
      throw new Error('Não foi possível criar o agente do sistema. Verifique os dados: ' + error.message);
    }
  },

  async getAllSystemAgents() {
    try {
      const agents = await Agent.findAll({
        where: { isSystemAgent: true },
        include: [{ model: Plan, as: 'allowedPlans', attributes: ['id', 'name'], through: { attributes: [] }, required: false }], // Inclui os planos associados
      });
      return agents;
    } catch (error) {
      console.error('Erro ao buscar agentes do sistema:', error);
      throw new Error('Não foi possível buscar os agentes do sistema.');
    }
  },

  async getSystemAgentById(agentId) {
    try {
      const agent = await Agent.findOne({
        where: { id: agentId, isSystemAgent: true },
        include: [{ model: Plan, as: 'allowedPlans', attributes: ['id', 'name'], through: { attributes: [] }, required: false }],
      });
      if (!agent) {
        throw new Error('Agente do sistema não encontrado.');
      }
      return agent;
    } catch (error) {
      console.error('Erro ao buscar agente do sistema por ID:', error);
      throw error;
    }
  },

  async updateSystemAgent(agentId, updateData) {
    try {
      // Garante que não se pode mudar para não ser um agente do sistema ou definir criador
      delete updateData.isSystemAgent;
      delete updateData.createdByUserId;

      // Validar allowedPlanIds se planSpecific for true na atualização
      if (updateData.planSpecific && (!Array.isArray(updateData.allowedPlanIds) || updateData.allowedPlanIds.length === 0)) {
        throw new Error('Se o agente for específico por plano, a lista de IDs de planos permitidos não pode ser vazia.');
      }
      if (updateData.planSpecific === false) { // Se o admin desmarcar planSpecific
        updateData.allowedPlanIds = []; // Limpa a lista de planos permitidos
      }

      const [updatedRows] = await Agent.update(updateData, {
        where: { id: agentId, isSystemAgent: true },
      });
      if (updatedRows === 0) {
        throw new Error('Agente do sistema não encontrado ou nenhum dado para atualizar.');
      }
      const updatedAgent = await Agent.findByPk(agentId);
      return updatedAgent;
    } catch (error) {
      console.error('Erro ao atualizar agente do sistema:', error);
      throw error;
    }
  },

  async updateSystemAgent(agentId, updateData) {
    try {
      // Garante que não se pode mudar para não ser um agente do sistema ou definir criador
      delete updateData.isSystemAgent;
      delete updateData.createdByUserId;

      const [updatedRows] = await Agent.update(updateData, {
        where: { id: agentId, isSystemAgent: true },
      });
      if (updatedRows === 0) {
        throw new Error('Agente do sistema não encontrado ou nenhum dado para atualizar.');
      }
      const updatedAgent = await Agent.findByPk(agentId);
      return updatedAgent;
    } catch (error) {
      console.error('Erro ao atualizar agente do sistema:', error);
      throw error;
    }
  },

  async deleteSystemAgent(agentId) {
    try {
      const deletedRows = await Agent.destroy({
        where: { id: agentId, isSystemAgent: true },
      });
      if (deletedRows === 0) {
        throw new Error('Agente do sistema não encontrado.');
      }
      return { message: 'Agente do sistema excluído com sucesso.' };
    } catch (error) {
      console.error('Erro ao deletar agente do sistema:', error);
      throw error;
    }
  },

  // --- Funções para gerenciar usuários (ex: definir admin, atribuir plano) ---
  async assignPlanToUser(userId, planId) {
    try {
      const user = await User.findByPk(userId);
      if (!user) {
        throw new Error('Usuário não encontrado.');
      }
      const plan = await Plan.findByPk(planId);
      if (!plan) {
        throw new Error('Plano não encontrado.');
      }

      user.planId = planId;
      await user.save();
      return { message: `Plano ${plan.name} atribuído ao usuário ${user.email} com sucesso.` };
    } catch (error) {
      console.error('Erro ao atribuir plano ao usuário:', error);
      throw error;
    }
  },

  async setAdminRole(userId) {
    try {
      const user = await User.findByPk(userId);
      if (!user) {
        throw new Error('Usuário não encontrado.');
      }
      user.role = 'admin';
      await user.save();
      return { message: `Usuário ${user.email} definido como administrador.` };
    } catch (error) {
      console.error('Erro ao definir papel de admin:', error);
      throw error;
    }
  },
    async updateGlobalSetting(key, value, description = null, isSensitive = false) {
    try {
      const updatedSetting = await settings.update(key, value, description, isSensitive);

      // Se as chaves de API forem atualizadas, reconfigure os SDKs
      if (key === 'MERCADO_PAGO_ACCESS_TOKEN') {
        mercadopago.configure(); // Reconfigura o Mercado Pago
      }
      if (key === 'OPENAI_API_KEY') {
        // Para OpenAI, a forma mais simples é redefinir a instância
        // No entanto, a forma como openai.js está configurado, ele já busca do settings.get()
        // Se você exportar a instância diretamente, precisaria de algo como:
        // openai.apiKey = value; // Se a propriedade for acessível diretamente
        // Ou forçar a recriação da instância se o módulo `openai.js` permitir
        console.log('Chave OpenAI atualizada no DB. Pode ser necessário reiniciar a aplicação ou implementar recarregamento dinâmico da instância OpenAI.');
        // Para um ambiente de produção, considere um mecanismo de recarregamento sem reiniciar o app.
        // Por enquanto, o `settings.get` já deve pegar o valor atualizado do cache.
      }

      return updatedSetting;
    } catch (error) {
      console.error(`Erro ao atualizar configuração global ${key}:`, error);
      throw error;
    }
  },

  async getGlobalSetting(key) {
    try {
      const setting = await db.Setting.findByPk(key);
      if (!setting) {
        throw new Error(`Configuração "${key}" não encontrada.`);
      }
      // Oculta o valor se for sensível para a API
      return {
        key: setting.key,
        value: setting.isSensitive ? '********' : setting.value,
        description: setting.description,
        isSensitive: setting.isSensitive,
      };
    } catch (error) {
      console.error(`Erro ao obter configuração global ${key}:`, error);
      throw error;
    }
  },

  async listGlobalSettings() {
    try {
      return await settings.listAll();
    } catch (error) {
      console.error('Erro ao listar configurações globais:', error);
      throw error;
    }
  },
};

module.exports = adminService;