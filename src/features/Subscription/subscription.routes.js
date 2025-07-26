// src/features/Subscription/subscription.routes.js
const express = require('express');
const subscriptionController = require('./subscription.controller');
const authMiddleware = require('../../utils/authMiddleware'); // Middleware de autenticação
const adminMiddleware = require('../../utils/adminMiddleware'); // Middleware de admin

const router = express.Router();

// Rota para o webhook do Mercado Pago (NÃO requer autenticação)
router.post('/webhook', subscriptionController.webhook);

// Todas as rotas abaixo requerem autenticação
router.use(authMiddleware);

// Rota para iniciar o checkout de um plano
router.post('/checkout', subscriptionController.createCheckout);

// Rota para verificar o status de um pedido de assinatura
router.get('/status/:orderId', subscriptionController.checkStatus);

// Rota para listar os próprios pedidos de assinatura
router.get('/my-orders', subscriptionController.listOrders);

// Rota para obter o plano ativo do usuário logado
router.get('/my-active-plan', subscriptionController.getMyActivePlan);

// Rotas de administração (listagem de todos os pedidos de assinatura)
router.get('/admin/orders', adminMiddleware, subscriptionController.listOrders);

module.exports = router;