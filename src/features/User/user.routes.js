// src/features/User/user.routes.js
const express = require('express');
const userController = require('./user.controller');
const authMiddleware = require('../../utils/authMiddleware');

const router = express.Router();

router.use(authMiddleware);

// Rota para o dashboard
router.get('/me/dashboard', userController.getMyDashboardData);

// Rotas de perfil
router.get('/me', userController.getMe);
router.put('/me', userController.updateMe);

// Rotas da chave OpenAI
router.post('/me/openai-key', userController.updateMyOpenAiApiKey);
router.delete('/me/openai-key', userController.removeMyOpenAiApiKey);

// Rota de plano e uso (pode ser usada em outras páginas, como a de perfil)
router.get('/me/plan-usage', userController.getMyPlanAndUsage);

module.exports = router;