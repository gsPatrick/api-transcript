// src/features/Subscription/subscription.service.js
const db = require('../../config/database');
const mercadopago = require('../../config/mercadoPago'); // Importa a configuração do MP
const { User, Plan, SubscriptionOrder } = db; // Importa os modelos necessários

// Helper para formatar datas em ISO com offset para MercadoPago
// (Reutilizado do seu exemplo de pagamentoService)
function formatDateToPreference(date) {
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
  const offsetSign = offset >= 0 ? '-' : '+';
  const offsetFormatted = `${offsetSign}${pad(offsetHours)}:${pad(offsetMinutes)}`;

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}${offsetFormatted}`;
}

const subscriptionService = {
  /**
   * Inicia o processo de checkout para a compra de um plano.
   * @param {string} userId - ID do usuário que está comprando.
   * @param {string} planId - ID do plano a ser comprado.
   * @returns {object} Objeto com URLs de checkout e ID da preferência.
   */
  async createCheckoutForPlan(userId, planId) {
    try {
      const user = await User.findByPk(userId);
      const plan = await Plan.findByPk(planId);

      if (!user) throw new Error('Usuário não encontrado.');
      if (!plan) throw new Error('Plano não encontrado.');

      // 1. Criar um registro de SubscriptionOrder pendente
      const subscriptionOrder = await SubscriptionOrder.create({
        userId: user.id,
        planId: plan.id,
        totalAmount: plan.price, // O valor do pedido é o preço do plano
        status: 'pending',
      });

      // 2. Preparar itens para a preferência do Mercado Pago
      const items = [{
        id: plan.id,
        title: `Assinatura do Plano: ${plan.name}`,
        unit_price: Number.parseFloat(plan.price),
        quantity: 1,
        category_id: 'subscriptions', // Categoria específica para assinaturas
        description: plan.description,
      }];

      // 3. Criar a preferência de pagamento no Mercado Pago
      const preference = {
        items,
        payer: {
          name: user.name,
          email: user.email,
        },
        back_urls: {
          success: `${process.env.FRONTEND_URL}/pagamento/sucesso?order=${subscriptionOrder.id}`,
          failure: `${process.env.FRONTEND_URL}/pagamento/erro?order=${subscriptionOrder.id}`,
          pending: `${process.env.FRONTEND_URL}/pagamento/pendente?order=${subscriptionOrder.id}`,
        },
        auto_return: 'approved',
        external_reference: subscriptionOrder.id, // Usamos o ID do SubscriptionOrder como referência externa
        notification_url: `${process.env.BACKEND_URL}/api/subscriptions/webhook`, // URL para o webhook do MP
        statement_descriptor: "AUDIOIAAPP", // Nome que aparece na fatura do cliente
        expires: true,
        expiration_date_from: formatDateToPreference(new Date()),
        expiration_date_to: formatDateToPreference(new Date(Date.now() + 24 * 60 * 60 * 1000)), // Expira em 24h
      };

      const response = await mercadopago.preferences.create(preference);

      // 4. Atualizar o SubscriptionOrder com o ID da preferência do Mercado Pago
      await subscriptionOrder.update({
        mercadopagoPreferenceId: response.body.id,
        mercadopagoPaymentDetails: response.body, // Salva os detalhes da preferência
      });

      return {
        checkoutUrl: response.body.init_point,
        preferenceId: response.body.id,
        sandboxUrl: response.body.sandbox_init_point, // URL para testes em sandbox
      };

    } catch (error) {
      console.error('Erro ao criar checkout para plano:', error);
      throw error;
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

        // Busca os detalhes completos do pagamento no Mercado Pago
        const paymentDetails = await mercadopago.payment.findById(paymentId);
        const paymentBody = paymentDetails.body;

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
          case 'approved':
            newStatus = 'approved';
            break;
          case 'rejected':
            newStatus = 'rejected';
            break;
          case 'cancelled':
            newStatus = 'cancelled';
            break;
          case 'pending':
          case 'in_process':
            newStatus = 'in_process';
            break;
          default:
            newStatus = 'pending'; // Fallback
        }

        // Atualiza o status e os detalhes do pagamento no SubscriptionOrder
        await subscriptionOrder.update({
          status: newStatus,
          mercadopagoPaymentId: paymentId,
          mercadopagoPaymentDetails: paymentBody,
        });

        if (newStatus === 'approved') {
          // Ativa o plano para o usuário
          const user = subscriptionOrder.user;
          const plan = subscriptionOrder.plan;

          if (user && plan) {
            // Calcula a nova data de expiração
            let newExpirationDate = new Date();
            if (user.planExpiresAt && user.planExpiresAt > newExpirationDate) {
              // Se o usuário já tem um plano ativo que expira no futuro, adiciona a duração a partir dessa data
              newExpirationDate = new Date(user.planExpiresAt);
            }
            newExpirationDate.setDate(newExpirationDate.getDate() + plan.durationInDays);

            await user.update({
              planId: plan.id,
              planExpiresAt: newExpirationDate,
            });
            console.log(`Plano "${plan.name}" ativado para o usuário ${user.email} até ${newExpirationDate.toISOString()}`);

            // TODO: Enviar email de confirmação de ativação do plano
          } else {
            console.error(`Erro: Usuário ou Plano não encontrados para ativar a assinatura do pedido ${subscriptionOrderId}.`);
          }
        } else if (newStatus === 'rejected' || newStatus === 'cancelled') {
          // TODO: Lógica para pagamentos rejeitados/cancelados (ex: notificar usuário)
          console.log(`Pagamento do pedido de assinatura ${subscriptionOrderId} foi ${newStatus}.`);
        }
      } else if (type === 'preapproval') {
        // Se você for implementar assinaturas recorrentes com preapproval, a lógica viria aqui.
        // Por enquanto, estamos focando no Checkout Pro para compra única de plano.
        console.log('Webhook de preapproval recebido (não implementado para este caso).');
      } else {
        console.log(`Webhook de tipo desconhecido recebido: ${type}`);
      }
    } catch (error) {
      console.error('Erro ao processar webhook de assinatura:', error);
      // É importante não lançar erro aqui para o Mercado Pago, sempre retornar 200.
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