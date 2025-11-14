// src/features/Admin/admin.service.js
const { Op } = require('sequelize');
const db = require('../../config/database');
const cryptoUtils = require('../../utils/crypto');
const assistantService = require('../Assistant/assistant.service');

const { User, Plan, SubscriptionOrder, Agent, Assistant, Transcription, AgentAction, AssistantHistory, Setting } = db;

const adminService = {
  
  /* Métodos de Dashboard */
  async getDashboardStats() {
    const totalRevenue = await SubscriptionOrder.sum('totalAmount', { where: { status: 'approved' } });
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const monthlyRevenue = await SubscriptionOrder.sum('totalAmount', { where: { status: 'approved', createdAt: { [Op.gte]: startOfMonth } } });
    const activeSubscriptions = await User.count({ where: { planId: { [Op.ne]: null }, planExpiresAt: { [Op.gt]: new Date() } } });
    const newUsersThisMonth = await User.count({ where: { createdAt: { [Op.gte]: startOfMonth } } });
    return { totalRevenue: totalRevenue || 0, monthlyRevenue: monthlyRevenue || 0, activeSubscriptions, newUsersThisMonth };
  },

  /* Métodos de Gerenciamento de Usuários */
async getAllUsers(filters) {
    // <<< MUDANÇA AQUI: Extraímos o 'limit' para tratá-lo >>>
    const { page = 1, limit = 10, searchTerm, planName } = filters;
    const where = {};

    if (searchTerm) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${searchTerm}%` } },
        { email: { [Op.iLike]: `%${searchTerm}%` } }
      ];
    }
    const includePlan = { model: Plan, as: 'currentPlan', where: {} };
    if (planName && planName !== 'Todos') {
      if (planName === 'Nenhum') {
        where.planId = null;
      } else {
        includePlan.where.name = planName;
      }
    }
    
    // <<< MUDANÇA AQUI: Criamos um objeto de opções para a query >>>
    const queryOptions = {
      where,
      include: [includePlan],
      order: [['createdAt', 'DESC']],
      attributes: { exclude: ['password', 'openAiApiKey', 'resetPasswordToken', 'resetPasswordExpires'] }
    };

    // <<< MUDANÇA PRINCIPAL AQUI: Se o limit não for 'all', aplicamos paginação >>>
    // Isso nos dá flexibilidade para reativar a paginação no futuro se precisarmos.
    if (limit !== 'all') {
      const numericLimit = parseInt(limit, 10);
      const numericPage = parseInt(page, 10);
      queryOptions.limit = numericLimit;
      queryOptions.offset = (numericPage - 1) * numericLimit;
    }

    const { count, rows } = await User.findAndCountAll(queryOptions);

    // Se a paginação foi desativada, a resposta não precisa ter informações de página.
    if (limit === 'all') {
      return {
        users: rows,
        total: count,
        totalPages: 1,
        currentPage: 1
      };
    }

    // A lógica original é mantida para quando a paginação estiver ativa.
    return { 
        users: rows, 
        total: count, 
        totalPages: Math.ceil(count / parseInt(limit)), 
        currentPage: parseInt(page) 
    };
  },

  async updateUser(userId, data) {
    const user = await User.findByPk(userId);
    if (!user) throw new Error('Usuário não encontrado.');
    // Impede a atualização direta da senha por esta rota para segurança
    delete data.password;
    await user.update(data);
    return user;
  },

  async deleteUser(userId) {
    const user = await User.findByPk(userId);
    if (!user) throw new Error('Usuário não encontrado.');
    await user.destroy();
    return { message: 'Usuário deletado com sucesso.' };
  },

  async assignPlanToUser(userId, planId) {
    const user = await User.findByPk(userId);
    if (!user) throw new Error('Usuário não encontrado.');
    if (!planId) {
      await user.update({ planId: null, planExpiresAt: null });
      return { message: 'Plano removido com sucesso.' };
    }
    const plan = await Plan.findByPk(planId);
    if (!plan) throw new Error('Plano não encontrado.');
    let newExpirationDate = new Date();
    // Se o usuário já tem o mesmo plano e ele ainda é válido, estende a partir da data de expiração
    if (user.planId === planId && user.planExpiresAt > newExpirationDate) {
      newExpirationDate = new Date(user.planExpiresAt);
    }
    newExpirationDate.setDate(newExpirationDate.getDate() + plan.durationInDays);
    await user.update({
      planId,
      planExpiresAt: newExpirationDate,
      // Reseta os contadores de uso
      transcriptionsUsedCount: 0,
      transcriptionMinutesUsed: 0,
      agentUsesUsed: 0,
      assistantUsesUsed: 0
    });
    return { message: `Plano ${plan.name} atribuído ao usuário ${user.email} até ${newExpirationDate.toLocaleDateString()}.` };
  },
  
  async updateUserPassword(userId, newPassword) {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('Usuário não encontrado.');
    }

    const hashedPassword = await cryptoUtils.hashPassword(newPassword);

    await user.update({
      password: hashedPassword,
      resetPasswordToken: null,
      resetPasswordExpires: null,
    });

    console.log(`Admin atualizou a senha do usuário ${user.email}.`);
    return { message: `Senha do usuário ${user.name} atualizada com sucesso.` };
  },

  /* Métodos de Planos */
  async getAllPlans() { return Plan.findAll({ order: [['price', 'ASC']] }); },
  async createPlan(data) { return Plan.create(data); },
  async updatePlan(planId, data) {
    const plan = await Plan.findByPk(planId);
    if (!plan) throw new Error('Plano não encontrado.');
    await plan.update(data);
    return plan;
  },
  async deletePlan(planId) {
    const plan = await Plan.findByPk(planId);
    if (!plan) throw new Error('Plano não encontrado.');
    await plan.destroy();
    return { message: 'Plano deletado com sucesso.' };
  },

  /* Métodos de Configurações */
  async getAllSettings() {
    const settings = await Setting.findAll({ order: [['key', 'ASC']] });
    return settings.map(s => ({
      ...s.toJSON(),
      value: s.isSensitive ? '********' : s.value
    }));
  },
  async updateSetting(key, value) {
    const setting = await Setting.findByPk(key);
    if (!setting) throw new Error('Configuração não encontrada.');
    await setting.update({ value });
    // Retorna o valor atualizado (mascarado se for sensível)
    return { ...setting.toJSON(), value: setting.isSensitive ? '********' : value };
  },

  /* Métodos de Agentes Legados */
  async getSystemAgents() { return Agent.findAll({ where: { isSystemAgent: true } }); },
  async getUserCreatedAgents() { return Agent.findAll({ where: { isSystemAgent: false }, include: [{ model: User, as: 'creator', attributes: ['name', 'email'] }] }); },
  async createSystemAgent(data) { return Agent.create({ ...data, isSystemAgent: true }); },
  async updateSystemAgent(id, data) {
    const agent = await Agent.findOne({ where: { id, isSystemAgent: true } });
    if (!agent) throw new Error('Agente do sistema não encontrado.');
    await agent.update(data);
    return agent;
  },
  async deleteSystemAgent(id) {
    const agent = await Agent.findOne({ where: { id, isSystemAgent: true } });
    if (!agent) throw new Error('Agente do sistema não encontrado.');
    await agent.destroy();
    return { message: 'Agente do sistema deletado.' };
  },

  /* Métodos de Assistentes */
  async getSystemAssistants() { return Assistant.findAll({ where: { isSystemAssistant: true } }); },
  async getUserCreatedAssistants() { return Assistant.findAll({ where: { isSystemAssistant: false }, include: [{ model: User, as: 'creator', attributes: ['name', 'email'] }] }); },
  async createSystemAssistant(data, files) {
    // Chama o serviço de assistente, passando null como userId para indicar que é uma criação de admin
    return assistantService.createAssistant(null, data, files);
  },
  async updateSystemAssistant(id, data, files) {
    // Para atualizar, precisamos de um objeto de usuário simulado com a role de admin
    const adminUser = { role: 'admin' };
    const assistant = await Assistant.findByPk(id);
    if (!assistant) throw new Error('Assistente não encontrado.');
    return assistantService.updateAssistant(id, adminUser, data, files);
  },
  async deleteSystemAssistant(id) {
    const adminUser = { role: 'admin' };
    const assistant = await Assistant.findByPk(id);
    if (!assistant) throw new Error('Assistente não encontrado.');
    return assistantService.deleteAssistant(adminUser, id);
  },

  /* Métodos de Transcrições */
  async getAllTranscriptions(filters) {
    const { page = 1, limit = 10, searchTerm } = filters;
    const where = {};
    // Inclui o usuário associado para permitir a busca por nome/email
    const includeUser = { model: User, as: 'user', attributes: ['name', 'email'], where: {} };
    if (searchTerm) {
      const searchPattern = { [Op.iLike]: `%${searchTerm}%` };
      where[Op.or] = [
        { title: searchPattern },
        { originalFileName: searchPattern },
        // A busca em campos de tabelas associadas requer a sintaxe '$association.field$'
        { '$user.name$': searchPattern },
        { '$user.email$': searchPattern },
      ];
    }
    const { count, rows } = await Transcription.findAndCountAll({
      where,
      include: [includeUser],
      subQuery: false, // Necessário para buscas em associações com limit/offset
      limit: parseInt(limit),
      offset: (page - 1) * limit,
      order: [['createdAt', 'DESC']],
    });
    return { transcriptions: rows, total: count, totalPages: Math.ceil(count / limit), currentPage: parseInt(page) };
  },
  async updateTranscription(id, data) {
    const transcription = await Transcription.findByPk(id);
    if (!transcription) throw new Error('Transcrição não encontrada.');
    await transcription.update(data);
    return transcription;
  },
  async deleteTranscription(id) {
    const transcription = await Transcription.findByPk(id);
    if (!transcription) throw new Error('Transcrição não encontrada.');
    await transcription.destroy();
    return { message: 'Transcrição deletada com sucesso.' };
  },

  /* Métodos de Histórico */
  async getAllHistory(filters) {
    const { page = 1, limit = 10, searchTerm } = filters;
    const where = {};
    const includeUser = { model: User, as: 'user', attributes: ['name', 'email'], where: {} };
    if (searchTerm) {
      const searchPattern = { [Op.iLike]: `%${searchTerm}%` };
      includeUser.where[Op.or] = [
        { name: searchPattern },
        { email: searchPattern },
      ];
    }
    const { count, rows } = await AssistantHistory.findAndCountAll({
      where,
      include: [
        includeUser,
        { model: Assistant, as: 'assistant', attributes: ['name'] },
        { model: Transcription, as: 'transcription', attributes: ['originalFileName'] }
      ],
      subQuery: false,
      limit: parseInt(limit),
      offset: (page - 1) * limit,
      order: [['createdAt', 'DESC']],
    });
    return { history: rows, total: count, totalPages: Math.ceil(count / limit), currentPage: parseInt(page) };
  }
};

module.exports = adminService;
