// src/features/Subscription/subscription.service.js
const db = require('../../config/database');
const mercadopago = require('../../config/mercadoPago'); // Importa a configuração do MP
const { User, Plan, SubscriptionOrder } = db; // Importa os modelos necessários



const subscriptionService = {
 async createCheckoutForPlan(userId, planId) {
    if (!mercadopago.isConfigured) {
      console.error('[Checkout] Tentativa de criar checkout, mas o SDK do Mercado Pago não está configurado.');
      throw new Error('O serviço de pagamento não está disponível no momento. Por favor, contate o suporte.');
    }

    try {
      const user = await User.findByPk(userId);
      const plan = await Plan.findByPk(planId);

      if (!user) throw new Error('Usuário não encontrado.');
      if (!plan) throw new Error('Plano não encontrado.');

      const subscriptionOrder = await SubscriptionOrder.create({
        userId: user.id,
        planId: plan.id,
        totalAmount: plan.price,
        status: 'pending',
      });
      
      // --- LOGS DE DIAGNÓSTICO ---
      console.log('--- INÍCIO DO DIAGNÓSTICO DE PREÇO ---');
      console.log('[DIAGNÓSTICO] Valor bruto de plan.price vindo do DB:', plan.price);
      console.log('[DIAGNÓSTICO] Tipo de plan.price (typeof):', typeof plan.price);
      
      const priceAsFloat = parseFloat(plan.price);

      console.log('[DIAGNÓSTICO] Valor após parseFloat(plan.price):', priceAsFloat);
      console.log('[DIAGNÓSTICO] Tipo do valor após parseFloat (typeof):', typeof priceAsFloat);
      console.log('--- FIM DO DIAGNÓSTICO DE PREÇO ---');
      // --- FIM DOS LOGS DE DIAGNÓSTICO ---

      const preferencePayload = {
        items: [{
          title: `Assinatura Plano: ${plan.name}`,
          quantity: 1,
          currency_id: 'BRL',
          unit_price: priceAsFloat,
        }],
        payer: {
          email: user.email,
        },
        back_urls: {
          success: `${process.env.FRONTEND_URL}/dashboard?payment_status=success`,
          failure: `${process.env.FRONTEND_URL}/dashboard?payment_status=failure`,
          pending: `${process.env.FRONTEND_URL}/dashboard?payment_status=pending`,
        },
        auto_return: 'approved',
        external_reference: subscriptionOrder.id,
        notification_url: `${process.env.BACKEND_URL}/api/subscriptions/webhook`,
      };

      console.log("[MercadoPago] Enviando objeto de preferência:", JSON.stringify(preferencePayload, null, 2));

      const response = await mercadopago.preferences.create(preferencePayload);

      await subscriptionOrder.update({
        mercadopagoPreferenceId: response.id,
      });

      return {
        checkoutUrl: response.init_point,
        preferenceId: response.id,
        sandboxUrl: response.sandbox_init_point,
      };

    } catch (error) {
      console.error('Erro ao criar checkout para plano:', error.response?.data || error.message || error);
      throw new Error(error.response?.data?.message || 'Erro ao comunicar com o serviço de pagamento.');
    }
  },
  /**
   * Processa notificações de webhook do Mercado Pago.
   * @param {object} data - Dados recebidos do webhook.
   */
 async processWebhook(data) {
  try {
    const { type, data: webhookData } = data;

    if (type === 'payment') {
      const paymentId = webhookData.id;
      const paymentDetails = await mercadopago.payment.get({ id: paymentId });
      const paymentBody = paymentDetails;
      const subscriptionOrderId = paymentBody.external_reference;

      if (!subscriptionOrderId) {
        console.log('Webhook de pagamento sem external_reference. Ignorando.');
        return;
      }

      const subscriptionOrder = await SubscriptionOrder.findByPk(subscriptionOrderId, {
        include: [{ model: User, as: 'user' }, { model: Plan, as: 'plan' }],
      });

      if (!subscriptionOrder) {
        console.log(`Pedido de assinatura ${subscriptionOrderId} não encontrado. Ignorando webhook.`);
        return;
      }

      let newStatus = 'pending';
      switch (paymentBody.status) {
        case 'approved': newStatus = 'approved'; break;
        case 'rejected': newStatus = 'rejected'; break;
        case 'cancelled': newStatus = 'cancelled'; break;
        case 'in_process': newStatus = 'in_process'; break;
      }

      await subscriptionOrder.update({
        status: newStatus,
        mercadopagoPaymentId: paymentId,
        mercadopagoPaymentDetails: paymentBody,
      });

      if (newStatus === 'approved') {
        const user = subscriptionOrder.user;
        const plan = subscriptionOrder.plan;

        if (user && plan) {
          // --- LÓGICA DE ATIVAÇÃO CORRIGIDA ---
          let newExpirationDate = new Date();
          // Se o usuário já tem um plano ativo, estende a partir da data de expiração atual
          if (user.planExpiresAt && user.planExpiresAt > newExpirationDate) {
            newExpirationDate = new Date(user.planExpiresAt);
          }
          newExpirationDate.setDate(newExpirationDate.getDate() + plan.durationInDays);

          // Atualiza o usuário com o plano, a data de expiração e reseta os contadores
          await user.update({
            planId: plan.id,
            planExpiresAt: newExpirationDate,
            transcriptionsUsedCount: 0,
            transcriptionMinutesUsed: 0,
            agentUsesUsed: 0,
          });
          console.log(`Plano "${plan.name}" ativado para o usuário ${user.email} até ${newExpirationDate.toISOString()}`);
          // TODO: Enviar email de confirmação
        } else {
          console.error(`Erro: Usuário ou Plano não encontrados para ativar a assinatura do pedido ${subscriptionOrderId}.`);
        }
      } else {
        console.log(`Pagamento do pedido de assinatura ${subscriptionOrderId} foi ${newStatus}.`);
      }
    }
  } catch (error) {
    console.error('Erro ao processar webhook de assinatura:', error);
  }
},


  /**
   * Verifica o status de um pedido de assinatura.
   * Pode ser usado pelo frontend para polling.
   * @param {string} subscriptionOrderId - ID do pedido de assinatura.
   * @returns {object} O pedido de assinatura com status atualizado.
   */
  async checkSubscriptionOrderStatus(subscriptionOrderId) {
    try {
      const subscriptionOrder = await SubscriptionOrder.findByPk(subscriptionOrderId, {
        include: [{ model: User, as: 'user' }, { model: Plan, as: 'plan' }],
      });

      if (!subscriptionOrder) {
        throw new Error('Pedido de assinatura não encontrado.');
      }

      // Se já estiver aprovado, não precisa consultar o MP novamente
      if (subscriptionOrder.status === 'approved') {
        return subscriptionOrder;
      }

      // Se houver um ID de pagamento do MP, consulte o status mais recente
      if (subscriptionOrder.mercadopagoPaymentId) {
        try {
          const payment = await mercadopago.payment.findById(subscriptionOrder.mercadopagoPaymentId);
          const paymentData = payment.body;

          let statusAtualizado = subscriptionOrder.status;
          switch (paymentData.status) {
            case 'approved':
              statusAtualizado = 'approved';
              break;
            case 'rejected':
              statusAtualizado = 'rejected';
              break;
            case 'cancelled':
              statusAtualizado = 'cancelled';
              break;
            case 'pending':
            case 'in_process':
              statusAtualizado = 'in_process';
              break;
          }

          if (statusAtualizado !== subscriptionOrder.status) {
            await subscriptionOrder.update({
              status: statusAtualizado,
              mercadopagoPaymentDetails: paymentData,
            });

            // Se o status mudou para aprovado aqui (via polling), ativa o plano
            if (statusAtualizado === 'approved') {
              const user = subscriptionOrder.user;
              const plan = subscriptionOrder.plan;
              if (user && plan) {
                let newExpirationDate = new Date();
                if (user.planExpiresAt && user.planExpiresAt > newExpirationDate) {
                  newExpirationDate = new Date(user.planExpiresAt);
                }
                newExpirationDate.setDate(newExpirationDate.getDate() + plan.durationInDays);
                await user.update({
                  planId: plan.id,
                  planExpiresAt: newExpirationDate,
                });
                console.log(`Plano "${plan.name}" ativado/estendido para o usuário ${user.email} via verificação de status.`);
              }
            }
            // Recarrega o pedido para retornar o status mais recente
            return await SubscriptionOrder.findByPk(subscriptionOrderId);
          }
        } catch (mpError) {
          console.error('Erro ao verificar status no Mercado Pago:', mpError);
          // Não lançar erro, apenas logar e retornar o status atual do DB
        }
      }
      return subscriptionOrder;
    } catch (error) {
      console.error('Erro ao verificar status do pedido de assinatura:', error);
      throw error;
    }
  },

  /**
   * Lista os pedidos de assinatura de um usuário ou todos (para admin).
   * @param {string} userId - Opcional. ID do usuário.
   * @param {object} filters - Filtros como status, paginação.
   * @returns {object} Lista de pedidos de assinatura.
   */
  async listSubscriptionOrders(userId = null, filters = {}) {
    try {
      const { status, page = 1, limit = 10 } = filters;
      const where = {};

      if (userId) where.userId = userId;
      if (status) where.status = status;

      const offset = (page - 1) * limit;

      const { count, rows } = await SubscriptionOrder.findAndCountAll({
        where,
        include: [
          { model: User, as: 'user', attributes: ['id', 'name', 'email'] },
          { model: Plan, as: 'plan', attributes: ['id', 'name', 'price', 'durationInDays'] }
        ],
        limit: Number.parseInt(limit),
        offset,
        order: [['createdAt', 'DESC']],
      });

      return {
        orders: rows,
        total: count,
        totalPages: Math.ceil(count / limit),
        currentPage: Number.parseInt(page),
      };
    } catch (error) {
      console.error('Erro ao listar pedidos de assinatura:', error);
      throw error;
    }
  },

  /**
   * Retorna o plano ativo de um usuário.
   * @param {string} userId - ID do usuário.
   * @returns {object|null} O plano ativo do usuário ou null.
   */
  async getUserActivePlan(userId) {
    try {
      const user = await User.findByPk(userId, {
        include: [{ model: Plan, as: 'currentPlan' }],
      });

      if (!user) {
        throw new Error('Usuário não encontrado.');
      }

      // Verifica se o plano ainda está ativo com base na data de expiração
      if (user.currentPlan && user.planExpiresAt && user.planExpiresAt > new Date()) {
        return {
          plan: user.currentPlan,
          expiresAt: user.planExpiresAt,
          remainingDays: Math.ceil((user.planExpiresAt.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
        };
      }

      // Se o plano expirou ou não há plano, limpa o planId e planExpiresAt do usuário
      if (user.planId) {
          await user.update({ planId: null, planExpiresAt: null });
      }

      return null;

    } catch (error) {
      console.error('Erro ao obter plano ativo do usuário:', error);
      throw error;
    }
  }
};

module.exports = subscriptionService;