// src/features/User/user.routes.js
const express = require('express');
const userController = require('./user.controller');
const authMiddleware = require('../../utils/authMiddleware'); // Middleware de autenticação

const router = express.Router();

// Rotas públicas (se houver, mas por enquanto, todas exigem autenticação)
// router.get('/plans', userController.getPlans); // Se quiser que usuários não logados vejam os planos

// Todas as rotas abaixo requerem autenticação
router.use(authMiddleware);

// Rotas de perfil do usuário
router.get('/me', userController.getMe);
router.put('/me', userController.updateMe);

// Rotas para gerenciar a chave da OpenAI do usuário
router.post('/me/openai-key', userController.updateMyOpenAiApiKey);
router.delete('/me/openai-key', userController.removeMyOpenAiApiKey);


// Rota para obter o plano ativo e uso de recursos do usuário
router.get('/me/plan-usage', userController.getMyPlanAndUsage);

module.exports = router;