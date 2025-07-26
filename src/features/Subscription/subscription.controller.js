// src/features/Subscription/subscription.controller.js
const subscriptionService = require('./subscription.service');

const subscriptionController = {
  /**
   * Inicia o processo de checkout para um plano.
   * Requer authentication (req.user.id) e o planId no body.
   */
  async createCheckout(req, res, next) {
    try {
      const { planId } = req.body;
      const userId = req.user.userId; // Obtido do token JWT

      if (!planId) {
        return res.status(400).json({ message: 'ID do plano é obrigatório.' });
      }

      const checkoutDetails = await subscriptionService.createCheckoutForPlan(userId, planId);
      return res.status(200).json(checkoutDetails);
    } catch (error) {
      console.error('Erro no controller createCheckout:', error);
      if (error.message.includes('não encontrado')) {
        return res.status(404).json({ message: error.message });
      }
      next(error); // Passa para o middleware de tratamento de erros
    }
  },

  /**
   * Endpoint para receber webhooks do Mercado Pago.
   * Não requer autenticação, pois o MP envia diretamente.
   */
  async webhook(req, res) {
    // O Mercado Pago espera um status 200 OK para considerar o webhook entregue.
    // Mesmo em caso de erro interno, devemos retornar 200 para evitar reenvios desnecessários.
    try {
      await subscriptionService.processWebhook(req.body);
      return res.status(200).json({ message: 'Webhook de assinatura processado com sucesso.' });
    } catch (error) {
      console.error('Erro no controller webhook de assinatura:', error);
      return res.status(200).json({ message: 'Erro ao processar webhook de assinatura, mas recebido.' });
    }
  },

  /**
   * Verifica o status de um pedido de assinatura.
   * Pode ser usado pelo frontend para verificar o status pós-pagamento.
   */
  async checkStatus(req, res, next) {
    try {
      const { orderId } = req.params;
      const userId = req.user.userId;

      const order = await subscriptionService.checkSubscriptionOrderStatus(orderId);

      // Garante que o usuário só pode ver seus próprios pedidos, a menos que seja admin
      if (order.userId !== userId && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Acesso negado. Você não tem permissão para visualizar este pedido.' });
      }

      return res.status(200).json(order);
    } catch (error) {
      console.error('Erro no controller checkStatus:', error);
      if (error.message.includes('não encontrado')) {
        return res.status(404).json({ message: error.message });
      }
      next(error);
    }
  },

  /**
   * Lista os pedidos de assinatura (para o usuário logado ou todos para admin).
   */
  async listOrders(req, res, next) {
    try {
      const userId = req.user.role === 'admin' ? null : req.user.userId; // Se for admin, lista todos
      const filters = req.query; // status, page, limit

      const orders = await subscriptionService.listSubscriptionOrders(userId, filters);
      return res.status(200).json(orders);
    } catch (error) {
      console.error('Erro no controller listOrders:', error);
      next(error);
    }
  },

  /**
   * Obtém o plano ativo do usuário logado.
   */
  async getMyActivePlan(req, res, next) {
    try {
      const userId = req.user.userId;
      const activePlan = await subscriptionService.getUserActivePlan(userId);
      if (!activePlan) {
        return res.status(200).json({ message: 'Nenhum plano ativo encontrado para este usuário.' });
      }
      return res.status(200).json(activePlan);
    } catch (error) {
      console.error('Erro no controller getMyActivePlan:', error);
      next(error);
    }
  }
};

module.exports = subscriptionController;