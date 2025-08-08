// src/features/Admin/admin.service.js

const db = require('../../config/database');
const { Op } = require('sequelize');
const { Plan, User, SubscriptionOrder, Setting, Assistant } = db;
const settings = require('../../config/settings');
const mercadopago = require('../../config/mercadoPago');
const assistantService = require('../Assistant/assistant.service'); // Importa o serviço central de Assistente

const adminService = {

  // --- Funções de gerenciamento de Usuários ---
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

      if (planName && planName !== 'Todos' && planName !== 'Nenhum') {
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
      console.error('[AdminService] Erro ao buscar todos os usuários:', error);
      throw new Error('Não foi possível buscar os usuários.');
    }
  },

  async getUserById(userId) {
    const user = await User.findByPk(userId, {
      attributes: { exclude: ['password'] },
      include: [{ model: Plan, as: 'currentPlan' }]
    });
    if (!user) {
      throw new Error('Usuário não encontrado.');
    }
    return user;
  },

  async updateUser(userId, updateData) {
    // Impede a atualização de campos sensíveis por esta rota
    delete updateData.password;
    delete updateData.role;

    const [updatedRows] = await User.update(updateData, { where: { id: userId }});
    if (updatedRows === 0) throw new Error('Usuário não encontrado ou nenhum dado para atualizar.');
    return this.getUserById(userId);
  },
  
  async deleteUser(userId) {
    const deletedRows = await User.destroy({ where: { id: userId } });
    if (deletedRows === 0) {
      throw new Error('Usuário não encontrado.');
    }
    return { message: 'Usuário excluído com sucesso.' };
  },

  async assignPlanToUser(userId, planId) {
    const user = await User.findByPk(userId);
    if (!user) throw new Error('Usuário não encontrado.');

    if (!planId || planId === "null") {
      await user.update({ planId: null, planExpiresAt: null });
      return { message: `Plano removido do usuário ${user.email} com sucesso.` };
    }

    const plan = await Plan.findByPk(planId);
    if (!plan) throw new Error('Plano não encontrado.');

    const newExpirationDate = new Date();
    newExpirationDate.setDate(newExpirationDate.getDate() + plan.durationInDays);

    await user.update({
      planId: planId,
      planExpiresAt: newExpirationDate,
      transcriptionsUsedCount: 0,
      transcriptionMinutesUsed: 0,
      assistantUsesUsed: 0, 
      assistantsCreatedCount: 0,
    });
    
    return { message: `Plano ${plan.name} atribuído ao usuário ${user.email}. Expira em ${newExpirationDate.toLocaleDateString('pt-BR')}.` };
  },

  // --- Funções de gerenciamento de Planos ---
  async createPlan(planData) {
    return Plan.create(planData);
  },

  async getAllPlans() {
    return Plan.findAll({ order: [['name', 'ASC']] });
  },

  // --- Funções de gerenciamento de Configurações Globais ---
  async listGlobalSettings() {
    return settings.listAll();
  },

  async updateGlobalSetting(key, value) {
    const updatedSetting = await settings.update(key, value);
    if (key === 'MERCADO_PAGO_ACCESS_TOKEN') mercadopago.configure();
    return updatedSetting;
  },

  // --- Funções de Gerenciamento de Assistentes (Sistema) ---
  async createSystemAssistant(assistantData, files) {
    const adminUser = { role: 'admin' }; // Simula um usuário admin para passar nas verificações de permissão do service
    
    const enrichedData = {
      ...assistantData,
      isSystemAssistant: true,
      createdByUserId: null,
    };
    
    const newAssistant = await assistantService.createAssistant(null, enrichedData, files);
    
    if (assistantData.planSpecific && Array.isArray(assistantData.allowedPlanIds)) {
      const plans = await Plan.findAll({ where: { id: assistantData.allowedPlanIds } });
      await newAssistant.setAllowedPlans(plans);
    }
    
    return Assistant.findByPk(newAssistant.id, {
      include: [{ model: Plan, as: 'allowedPlans', attributes: ['id', 'name'] }]
    });
  },

  async getAllSystemAssistants() {
    return Assistant.findAll({
      where: { isSystemAssistant: true },
      include: [{ model: Plan, as: 'allowedPlans', attributes: ['id', 'name'], through: { attributes: [] } }],
      order: [['name', 'ASC']]
    });
  },

  async getSystemAssistantById(assistantId) {
    const assistant = await Assistant.findOne({
      where: { id: assistantId, isSystemAssistant: true },
      include: [{ model: Plan, as: 'allowedPlans', attributes: ['id', 'name'], through: { attributes: [] } }],
    });
    if (!assistant) throw new Error('Assistente do sistema não encontrado.');
    return assistant;
  },

  async updateSystemAssistant(assistantId, updateData, newFiles, filesToRemoveIds) {
    const assistant = await Assistant.findByPk(assistantId);
    if (!assistant || !assistant.isSystemAssistant) throw new Error('Assistente do sistema não encontrado.');

    const updatedAssistant = await assistantService.updateAssistant(assistantId, null, updateData, newFiles, filesToRemoveIds);

    if (updateData.planSpecific !== undefined) {
        const plans = (updateData.planSpecific === 'true' || updateData.planSpecific === true) && Array.isArray(updateData.allowedPlanIds) 
            ? await Plan.findAll({ where: { id: updateData.allowedPlanIds } }) 
            : [];
        await updatedAssistant.setAllowedPlans(plans);
    }
    
    return Assistant.findByPk(updatedAssistant.id, {
      include: [{ model: Plan, as: 'allowedPlans', attributes: ['id', 'name'] }]
    });
  },

  async deleteSystemAssistant(assistantId) {
    const assistant = await Assistant.findByPk(assistantId);
    if (!assistant || !assistant.isSystemAssistant) throw new Error('Assistente do sistema não encontrado.');
    
    await assistantService.deleteAssistant(null, assistantId);
    
    return { message: 'Assistente do sistema excluído com sucesso.' };
  },

  async getAllUserCreatedAssistants() {
    return Assistant.findAll({
      where: { isSystemAssistant: false },
      include: [{ model: User, as: 'creator', attributes: ['id', 'name', 'email'] }],
      order: [['createdAt', 'DESC']],
    });
  },

  // --- Funções de Dashboard ---
  async getDashboardStats() {
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const totalRevenueResult = await SubscriptionOrder.sum('totalAmount', { where: { status: 'approved' }});
    const monthlyRevenueResult = await SubscriptionOrder.sum('totalAmount', {
      where: { status: 'approved', createdAt: { [Op.gte]: firstDayOfMonth } },
    });
    const activeSubscriptions = await User.count({ where: { planId: { [Op.ne]: null }, planExpiresAt: { [Op.gt]: now } } });
    const newUsersThisMonth = await User.count({ where: { createdAt: { [Op.gte]: firstDayOfMonth } } });

    return {
      totalRevenue: totalRevenueResult || 0,
      monthlyRevenue: monthlyRevenueResult || 0,
      activeSubscriptions: activeSubscriptions || 0,
      newUsersThisMonth: newUsersThisMonth || 0,
    };
  },
};

module.exports = adminService;