// src/features/Agent/agent.routes.js
const express = require('express');
const agentController = require('./agent.controller');
const authMiddleware = require('../../utils/authMiddleware');

const router = express.Router();

// Todas as rotas de agente requerem autenticação
router.use(authMiddleware);

// Rotas para o usuário interagir com agentes
router.post('/run', agentController.runAgent);
router.get('/my-actions', agentController.listMyAgentActions);
router.get('/my-actions/:id', agentController.getAgentAction);
router.get('/my-actions/:id/download', agentController.downloadAgentActionOutput); // Para baixar PDFs
router.get('/available', agentController.listAvailableAgents);

// Rotas para o usuário gerenciar seus próprios agentes (se o plano permitir)
router.post('/my-agents', agentController.createUserAgent);
router.put('/my-agents/:id', agentController.updateUserAgent);
router.delete('/my-agents/:id', agentController.deleteUserAgent);



module.exports = router;