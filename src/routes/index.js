// src/routes/index.js
const express = require('express');
const authRoutes = require('../features/Auth/auth.routes');
const adminRoutes = require('../features/Admin/admin.routes');
const subscriptionRoutes = require('../features/Subscription/subscription.routes');
const transcriptionRoutes = require('../features/Transcription/transcription.routes');
const agentRoutes = require('../features/Agent/agent.routes');
const userRoutes = require('../features/User/user.routes'); // Importa as rotas de usuário

const router = express.Router();

// Rotas de autenticação sob /api/auth
router.use('/auth', authRoutes);

// Rotas de administração sob /api/admin
router.use('/admin', adminRoutes);

// Rotas de assinatura/planos sob /api/subscriptions
router.use('/subscriptions', subscriptionRoutes);

// Rotas de transcrição sob /api/transcriptions
router.use('/transcriptions', transcriptionRoutes);

// Rotas de agente sob /api/agents
router.use('/agents', agentRoutes);

// Rotas de perfil e informações do usuário sob /api/users
router.use('/users', userRoutes);

module.exports = router;