// src/features/Subscription/subscription.service.js
const db = require('../../config/database');
const mercadopago = require('../../config/mercadoPago'); // Importa a configuração do MP
const { User, Plan, SubscriptionOrder } = db; // Importa os modelos necessários

// Função auxiliar para formatar a data para o padrão exigido pelo Mercado Pago
function formatMercadoPagoDate(date) {
    const pad = (n) => String(n).padStart(2, '0');
    const padMs = (n) => String(n).padStart(3, '0');
    
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    const ms = padMs(date.getMilliseconds());
    
    const offset = -date.getTimezoneOffset();
    const offsetHours = Math.floor(Math.abs(offset) / 60);
    const offsetMinutes = Math.abs(offset) % 60;
    const sign = offset >= 0 ? '+' : '-';
    const offsetFormatted = `${sign}${pad(offsetHours)}:${pad(offsetMinutes)}`;
    
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}${offsetFormatted}`;
}

const subscriptionService = {
  /**
   * <<< MÉTODO REESCRITO PARA CRIAR UMA ASSINATURA RECORRENTE >>>
   * Cria um checkout de assinatura recorrente no Mercado Pago.
   * @param {string} userId - ID do usuário.
   * @param {string} planId - ID do plano.
   * @returns {object} Detalhes do checkout.
   */
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

      // Cria um registro de pedido para rastreamento interno
      const subscriptionOrder = await SubscriptionOrder.create({
        userId: user.id,
        planId: plan.id,
        totalAmount: plan.price,
        status: 'pending',
      });
      
      const priceAsFloat = parseFloat(plan.price);
      // Data de término da assinatura (ex: 1 ano a partir de agora)
      const endDate = new Date();
      endDate.setFullYear(endDate.getFullYear() + 1);

      // Payload para a API de Assinaturas (Preapproval) do Mercado Pago
      const subscriptionPayload = {
        reason: `Assinatura Mensal - Plano ${plan.name}`,
        external_reference: subscriptionOrder.id, // Usamos o ID do nosso pedido como referência externa
        payer_email: user.email,
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: priceAsFloat,
          currency_id: "BRL",
          start_date: formatMercadoPagoDate(new Date()), // Início imediato
          end_date: formatMercadoPagoDate(endDate), // Define até quando o MP pode tentar cobrar
        },
        back_url: `${process.env.FRONTEND_URL}/dashboard?subscription_status=success`,
        notification_url: `${process.env.BACKEND_URL}/api/subscriptions/webhook`,
        status: 'pending', // A assinatura começa pendente até o primeiro pagamento
      };

      console.log("[MercadoPago] Enviando objeto de assinatura (preapproval):", JSON.stringify(subscriptionPayload, null, 2));

      // Chama a API de criação de assinatura do SDK
      const response = await mercadopago.preapproval.create(subscriptionPayload);
      const responseBody = response;

      // Atualiza nosso registro de pedido com o ID da assinatura do Mercado Pago
      await subscriptionOrder.update({
        mercadopagoPreferenceId: responseBody.id, // Armazenamos o ID da pré-aprovação
      });

      return {
        checkoutUrl: responseBody.init_point,
        preapprovalId: responseBody.id,
      };

    } catch (error) {
      console.error('Erro ao criar checkout de assinatura:', error.response?.data || error.message || error);
      throw new Error(error.response?.data?.message || 'Erro ao comunicar com o serviço de pagamento.');
    }
  },

  /**
   * <<< MÉTODO ATUALIZADO PARA LIDAR COM WEBHOOKS DE ASSINATURA >>>
   * Processa notificações de webhook do Mercado Pago para assinaturas.
   * @param {object} data - Dados recebidos do webhook.
   */
  async processWebhook(data) {
    try {
      const { type, data: webhookData } = data;

      // O tópico para assinaturas é 'preapproval'
      if (type === 'preapproval') {
        const preapprovalId = webhookData.id;
        const preapprovalDetails = await mercadopago.preapproval.get(preapprovalId);
        const preapprovalBody = preapprovalDetails;
        
        const subscriptionOrderId = preapprovalBody.external_reference;

        if (!subscriptionOrderId) {
          console.log(`Webhook de assinatura ${preapprovalId} sem external_reference. Ignorando.`);
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
        // Status possíveis: pending, authorized, paused, cancelled
        if (preapprovalBody.status === 'authorized') {
            newStatus = 'approved';
        } else if (preapprovalBody.status === 'cancelled' || preapprovalBody.status === 'paused') {
            newStatus = 'cancelled';
        }

        // Atualiza o status do nosso pedido interno
        await subscriptionOrder.update({
          status: newStatus,
          mercadopagoPaymentId: preapprovalId, // Reutilizamos este campo para o ID da assinatura
          mercadopagoPaymentDetails: preapprovalBody,
        });

        const user = subscriptionOrder.user;
        const plan = subscriptionOrder.plan;

        if (newStatus === 'approved' && user && plan) {
          // Lógica de ativação/extensão do plano
          let newExpirationDate = new Date();
          // Se o usuário já tem um plano ativo, estende a partir da data de expiração atual
          if (user.planExpiresAt && user.planExpiresAt > newExpirationDate) {
            newExpirationDate = new Date(user.planExpiresAt);
          }
          // Adiciona a duração do plano (ex: 30 dias)
          newExpirationDate.setDate(newExpirationDate.getDate() + plan.durationInDays);

          await user.update({
            planId: plan.id,
            planExpiresAt: newExpirationDate,
            transcriptionsUsedCount: 0,
            transcriptionMinutesUsed: 0,
            agentUsesUsed: 0,
            assistantUsesUsed: 0,
          });
          console.log(`Plano "${plan.name}" ativado/renovado para o usuário ${user.email} até ${newExpirationDate.toISOString()}`);
        
        } else if (newStatus === 'cancelled' && user) {
            // Se a assinatura for cancelada, removemos o plano do usuário
            await user.update({
                planId: null,
                planExpiresAt: new Date() // Expira imediatamente
            });
            console.log(`Assinatura do usuário ${user.email} foi cancelada. Plano removido.`);
        } else {
          console.log(`Status da assinatura ${subscriptionOrderId} atualizado para ${preapprovalBody.status}.`);
        }
      }
    } catch (error) {
      console.error('Erro ao processar webhook de assinatura:', error);
    }
  },

  /**
   * Verifica o status de um pedido de assinatura.
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

      if (subscriptionOrder.status === 'approved') {
        return subscriptionOrder;
      }

      // O ID da assinatura está em 'mercadopagoPreferenceId'
      if (subscriptionOrder.mercadopagoPreferenceId) {
        try {
          const preapproval = await mercadopago.preapproval.get(subscriptionOrder.mercadopagoPreferenceId);
          const preapprovalData = preapproval;

          let statusAtualizado = subscriptionOrder.status;
          if (preapprovalData.status === 'authorized') statusAtualizado = 'approved';
          if (preapprovalData.status === 'cancelled' || preapprovalData.status === 'paused') statusAtualizado = 'cancelled';

          if (statusAtualizado !== subscriptionOrder.status) {
            await subscriptionOrder.update({
              status: statusAtualizado,
              mercadopagoPaymentDetails: preapprovalData,
            });

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
            return await SubscriptionOrder.findByPk(subscriptionOrderId);
          }
        } catch (mpError) {
          console.error('Erro ao verificar status no Mercado Pago:', mpError);
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