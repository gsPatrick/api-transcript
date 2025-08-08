// src/features/User/user.controller.js
const userService = require('./user.service');

const userController = {
  /**
   * Obtém o perfil do usuário logado.
   */
  async getMe(req, res, next) {
    try {
      const userId = req.user.userId;
      const userProfile = await userService.getUserProfile(userId);
      return res.status(200).json(userProfile);
    } catch (error) {
      console.error('Erro no controller getMe:', error);
      if (error.message.includes('não encontrado')) {
        return res.status(404).json({ message: error.message });
      }
      next(error);
    }
  },

  /**
   * Atualiza o perfil do usuário logado.
   */
  async updateMe(req, res, next) {
    try {
      const userId = req.user.userId;
      const updateData = req.body; // Pode conter name, email, password

      // Previne que o usuário tente mudar o role ou planId diretamente
      delete updateData.role;
      delete updateData.planId;
      delete updateData.planExpiresAt;
      delete updateData.transcriptionsUsedCount;
      delete updateData.transcriptionMinutesUsed;
      delete updateData.agentUsesUsed;
      delete updateData.userAgentsCreatedCount;
      delete updateData.lastAgentCreationResetDate;
      // openAiApiKey será tratado em outro endpoint para maior clareza

      const updatedUser = await userService.updateUserProfile(userId, updateData);
      return res.status(200).json({ message: 'Perfil atualizado com sucesso!', user: updatedUser });
    } catch (error) {
      console.error('Erro no controller updateMe:', error);
      if (error.message.includes('já está em uso')) {
        return res.status(409).json({ message: error.message });
      }
      if (error.message.includes('não encontrado')) {
        return res.status(404).json({ message: error.message });
      }
      next(error);
    }
  },

  /**
   * Permite ao usuário atualizar sua chave da OpenAI.
   */
  async updateMyOpenAiApiKey(req, res, next) {
    try {
      const userId = req.user.userId;
      const { apiKey } = req.body;

      if (!apiKey) {
        return res.status(400).json({ message: 'A chave da OpenAI é obrigatória.' });
      }

      const result = await userService.updateUserOpenAiApiKey(userId, apiKey);
      return res.status(200).json(result);
    } catch (error) {
      console.error('Erro no controller updateMyOpenAiApiKey:', error);
      next(error);
    }
  },

  /**
   * Permite ao usuário remover sua chave da OpenAI.
   */
  async removeMyOpenAiApiKey(req, res, next) {
    try {
      const userId = req.user.userId;
      const result = await userService.removeUserOpenAiApiKey(userId);
      return res.status(200).json(result);
    } catch (error) {
      console.error('Erro no controller removeMyOpenAiApiKey:', error);
      next(error);
    }
  },

  /**
   * Lista todos os planos disponíveis para visualização.
   * Esta rota pode ser acessada por usuários autenticados e não autenticados.
   * Por enquanto, vamos mantê-la sob autenticação para simplificar o roteamento inicial.
   */
  async getPlans(req, res, next) {
    try {
      const plans = await userService.getAvailablePlans();
      return res.status(200).json(plans);
    } catch (error) {
      console.error('Erro no controller getPlans:', error);
      next(error);
    }
  },

  /**
   * Obtém o plano ativo do usuário logado e suas estatísticas de uso.
   */
  async getMyPlanAndUsage(req, res, next) {
    try {
      const userId = req.user.userId;
      const planAndUsage = await userService.getUserPlanAndUsage(userId);
      return res.status(200).json(planAndUsage);
    } catch (error) {
      console.error('Erro no controller getMyPlanAndUsage:', error);
      next(error);
    }
  },
/**
   * NOVO: Obtém os dados consolidados para a página do dashboard do usuário.
   */
  async getMyDashboardData(req, res, next) {
    try {
      const userId = req.user.userId;
      const dashboardData = await userService.getUserDashboardData(userId);
      return res.status(200).json(dashboardData);
    } catch (error) {
      console.error('Erro no controller getMyDashboardData:', error);
      if (error.message.includes('não encontrado')) {
        return res.status(404).json({ message: error.message });
      }
      next(error);
    }
  },
};

module.exports = userController;