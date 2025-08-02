// src/routes/index.js
const express = require('express');
const authRoutes = require('../features/Auth/auth.routes');
const adminRoutes = require('../features/Admin/admin.routes');
const subscriptionRoutes = require('../features/Subscription/subscription.routes');
const transcriptionRoutes = require('../features/Transcription/transcription.routes');
// const agentRoutes = require('../features/Agent/agent.routes'); // REMOVER OU COMENTAR
const assistantRoutes = require('../features/Assistant/assistant.routes'); // <<< ADICIONAR
const userRoutes = require('../features/User/user.routes');
const publicRoutes = require('../features/Public/public.routes');

const router = express.Router();

router.use('/public', publicRoutes);

router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/subscriptions', subscriptionRoutes);
router.use('/transcriptions', transcriptionRoutes);
// router.use('/agents', agentRoutes); // REMOVER OU COMENTAR
router.use('/assistants', assistantRoutes); // <<< ADICIONAR
router.use('/users', userRoutes);

module.exports = router;