// src/features/Admin/admin.service.js

const db = require('../../config/database');
const { Op } = require('sequelize');
// <<< MODIFICADO: Adicionado Assistant ao import >>>
const { Plan, Agent, User, SubscriptionOrder, Setting, Assistant } = db;
const settings = require('../../config/settings');
const mercadopago = require('../../config/mercadoPago');

const adminService = {
  // --- Funções de gerenciamento de Planos ---

   async getUserById(userId) {
    try {
      const user = await User.findByPk(userId, {
        attributes: { exclude: ['password'] },
        include: [{ model: Plan, as: 'currentPlan' }]
      });
      if (!user) {
        throw new Error('Usuário não encontrado.');
      }
      return user;
    } catch (error) {
      console.error(`Erro ao buscar usuário ${userId}:`, error);
      throw error;
    }
  },
  
    async deleteUser(userId) {
    try {
      const deletedRows = await User.destroy({ where: { id: userId } });
      if (deletedRows === 0) {
        throw new Error('Usuário não encontrado.');
      }
      return { message: 'Usuário excluído com sucesso.' };
    } catch (error) {
      console.error(`Erro ao deletar usuário ${userId}:`, error);
      throw error;
    }
    },
  

  async createPlan(planData) {
    try {
      const newPlan = await Plan.create(planData);
      return newPlan;
    } catch (error) {
      console.error('Erro ao criar plano:', error);
      throw new Error('Não foi possível criar o plano. Verifique os dados e tente novamente.');
    }
  },

   async getAllUserCreatedAgents() {
    try {
      const agents = await Agent.findAll({
        where: { isSystemAgent: false },
        include: [{
          model: User,
          as: 'creator',
          attributes: ['id', 'name', 'email']
        }],
        order: [['createdAt', 'DESC']],
      });
      return agents;
    } catch (error) {
      console.error('Erro ao buscar agentes de usuários:', error);
      throw new Error('Não foi possível buscar os agentes criados por usuários.');
    }
  },

async getDashboardStats() {
    try {
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const totalRevenueResult = await SubscriptionOrder.findOne({
        attributes: [[db.sequelize.fn('SUM', db.sequelize.col('totalAmount')), 'total']],
        where: { status: 'approved' },
        raw: true,
      });
      const totalRevenue = totalRevenueResult?.total || 0;

      const monthlyRevenueResult = await SubscriptionOrder.findOne({
        attributes: [[db.sequelize.fn('SUM', db.sequelize.col('totalAmount')), 'total']],
        where: {
          status: 'approved',
          createdAt: { [Op.gte]: firstDayOfMonth },
        },
        raw: true,
      });
      const monthlyRevenue = monthlyRevenueResult?.total || 0;

      const activeSubscriptions = await User.count({
        where: {
          planId: { [Op.ne]: null },
          planExpiresAt: { [Op.gt]: now },
        },
      });

      const newUsersThisMonth = await User.count({
        where: {
          createdAt: { [Op.gte]: firstDayOfMonth },
        },
      });

      return {
        totalRevenue: parseFloat(totalRevenue),
        monthlyRevenue: parseFloat(monthlyRevenue),
        activeSubscriptions,
        newUsersThisMonth,
      };
    } catch (error) {
      console.error('Erro ao calcular estatísticas do dashboard:', error);
      throw new Error('Não foi possível obter as estatísticas do dashboard.');
    }
  },

  async getAllUsers(filters = {}) {
    try {
      const { page = 1, limit = 10, searchTerm = '', planName = '' } = filters;
      const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
      
      let whereCondition = {};
      if (searchTerm) {
        whereCondition = {
          [Op.or]: [
            { name: { [Op.iLike]: `%${searchTerm}%` } },
            { email: { [Op.iLike]: `%${searchTerm}%` } }
          ]
        };
      }

      let includeCondition = [{
        model: Plan,
        as: 'currentPlan',
        attributes: ['id', 'name'],
        required: false
      }];

      if (planName && planName !== 'Todos') {
        includeCondition[0].where = { name: planName };
        includeCondition[0].required = true;
      } else if (planName === 'Nenhum') {
        whereCondition.planId = { [Op.is]: null };
      }

      const { count, rows } = await User.findAndCountAll({
        where: whereCondition,
        include: includeCondition,
        limit: parseInt(limit, 10),
        offset,
        order: [['createdAt', 'DESC']],
        attributes: { exclude: ['password', 'openAiApiKey'] }
      });

      return {
        users: rows,
        total: count,
        totalPages: Math.ceil(count / parseInt(limit, 10)),
        currentPage: parseInt(page, 10)
      };
    } catch (error) {
      console.error('Erro ao buscar todos os usuários:', error);
      throw new Error('Não foi possível buscar os usuários.');
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
      agentData.createdByUserId = null;

      if (agentData.planSpecific && (!Array.isArray(agentData.allowedPlanIds) || agentData.allowedPlanIds.length === 0)) {
        throw new Error('Se o agente for específico por plano, a lista de IDs de planos permitidos não pode ser vazia.');
      }
      if (!agentData.planSpecific) {
        agentData.allowedPlanIds = [];
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
        include: [{ model: Plan, as: 'allowedPlans', attributes: ['id', 'name'], through: { attributes: [] }, required: false }],
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
      delete updateData.isSystemAgent;
      delete updateData.createdByUserId;

      if (updateData.planSpecific && (!Array.isArray(updateData.allowedPlanIds) || updateData.allowedPlanIds.length === 0)) {
        throw new Error('Se o agente for específico por plano, a lista de IDs de planos permitidos não pode ser vazia.');
      }
      if (updateData.planSpecific === false) {
        updateData.allowedPlanIds = [];
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

  async assignPlanToUser(userId, planId) {
    try {
      const user = await User.findByPk(userId);
      if (!user) {
        throw new Error('Usuário não encontrado.');
      }

      if (!planId) {
        await user.update({
          planId: null,
          planExpiresAt: null,
          transcriptionsUsedCount: 0,
          transcriptionMinutesUsed: 0,
          agentUsesUsed: 0,
          assistantUsesUsed: 0, // <<< ADICIONADO
        });
        return { message: `Plano removido do usuário ${user.email} com sucesso.` };
      }

      const plan = await Plan.findByPk(planId);
      if (!plan) {
        throw new Error('Plano não encontrado.');
      }

      const newExpirationDate = new Date();
      newExpirationDate.setDate(newExpirationDate.getDate() + plan.durationInDays);

      await user.update({
        planId: planId,
        planExpiresAt: newExpirationDate,
        transcriptionsUsedCount: 0,
        transcriptionMinutesUsed: 0,
        agentUsesUsed: 0,
        assistantUsesUsed: 0, // <<< ADICIONADO
        userAgentsCreatedCount: 0,
        assistantsCreatedCount: 0, // <<< ADICIONADO
        lastAgentCreationResetDate: new Date(),
        lastAssistantCreationResetDate: new Date(), // <<< ADICIONADO
      });
      
      return { message: `Plano ${plan.name} atribuído ao usuário ${user.email} com sucesso. Expira em ${newExpirationDate.toLocaleDateString('pt-BR')}.` };
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

      if (key === 'MERCADO_PAGO_ACCESS_TOKEN') {
        mercadopago.configure();
      }
      if (key === 'OPENAI_API_KEY') {
        console.log('Chave OpenAI atualizada no DB. O sistema usará a nova chave nas próximas chamadas.');
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

  async createSystemAssistant(assistantData) {
    try {
      assistantData.isSystemAssistant = true;
      assistantData.createdByUserId = null;

      if (assistantData.planSpecific && (!Array.isArray(assistantData.allowedPlanIds) || assistantData.allowedPlanIds.length === 0)) {
        throw new Error('Se o assistente for específico por plano, a lista de IDs de planos permitidos não pode ser vazia.');
      }
      if (!assistantData.planSpecific) {
        assistantData.allowedPlanIds = [];
      }

      const newAssistant = await Assistant.create(assistantData);
      return newAssistant;
    } catch (error) {
      console.error('Erro ao criar assistente do sistema:', error);
      throw new Error('Não foi possível criar o assistente do sistema. Verifique os dados: ' + error.message);
    }
  },

  async getAllSystemAssistants() {
    try {
      const assistants = await Assistant.findAll({
        where: { isSystemAssistant: true },
        include: [{ model: Plan, as: 'allowedPlans', attributes: ['id', 'name'], through: { attributes: [] }, required: false }],
      });
      return assistants;
    } catch (error) {
      console.error('Erro ao buscar assistentes do sistema:', error);
      throw new Error('Não foi possível buscar os assistentes do sistema.');
    }
  },

  async getSystemAssistantById(assistantId) {
    try {
      const assistant = await Assistant.findOne({
        where: { id: assistantId, isSystemAssistant: true },
        include: [{ model: Plan, as: 'allowedPlans', attributes: ['id', 'name'], through: { attributes: [] }, required: false }],
      });
      if (!assistant) {
        throw new Error('Assistente do sistema não encontrado.');
      }
      return assistant;
    } catch (error) {
      console.error('Erro ao buscar assistente do sistema por ID:', error);
      throw error;
    }
  },

  async updateSystemAssistant(assistantId, updateData) {
    try {
      delete updateData.isSystemAssistant;
      delete updateData.createdByUserId;
      delete updateData.openaiAssistantId;

      if (updateData.planSpecific && (!Array.isArray(updateData.allowedPlanIds) || updateData.allowedPlanIds.length === 0)) {
        throw new Error('Se o assistente for específico por plano, a lista de IDs de planos permitidos não pode ser vazia.');
      }
      if (updateData.planSpecific === false) {
        updateData.allowedPlanIds = [];
      }

      const [updatedRows] = await Assistant.update(updateData, {
        where: { id: assistantId, isSystemAssistant: true },
      });

      if (updatedRows === 0) {
        throw new Error('Assistente do sistema não encontrado ou nenhum dado para atualizar.');
      }
      return await Assistant.findByPk(assistantId);
    } catch (error) {
      console.error('Erro ao atualizar assistente do sistema:', error);
      throw error;
    }
  },

  async deleteSystemAssistant(assistantId) {
    try {
      const deletedRows = await Assistant.destroy({
        where: { id: assistantId, isSystemAssistant: true },
      });
      if (deletedRows === 0) {
        throw new Error('Assistente do sistema não encontrado.');
      }
      return { message: 'Assistente do sistema excluído com sucesso.' };
    } catch (error) {
      console.error('Erro ao deletar assistente do sistema:', error);
      throw error;
    }
  },
};

module.exports = adminService;