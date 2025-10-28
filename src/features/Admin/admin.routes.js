// src/features/Admin/admin.routes.js
const express = require('express');
const adminController = require('./admin.controller');
const authMiddleware = require('../../utils/authMiddleware');
const adminMiddleware = require('../../utils/adminMiddleware');

const router = express.Router();

// Aplica middlewares de autenticação e verificação de admin para todas as rotas
router.use(authMiddleware);
router.use(adminMiddleware);

// Rotas de Dashboard
router.get('/dashboard-stats', adminController.getDashboardStats);

// Rotas de Gerenciamento de Usuários
router.get('/users', adminController.getAllUsers);
router.put('/users/:id', adminController.updateUser);
// <<< NOVA ROTA PARA ATUALIZAR A SENHA DE UM USUÁRIO >>>
router.put('/users/:id/password', adminController.updateUserPassword);
// <<< FIM DA NOVA ROTA >>>
router.delete('/users/:id', adminController.deleteUser);
router.post('/users/assign-plan', adminController.assignPlanToUser);

// Rotas de Gerenciamento de Planos
router.get('/plans', adminController.getAllPlans);
router.post('/plans', adminController.createPlan);
router.put('/plans/:id', adminController.updatePlan);
router.delete('/plans/:id', adminController.deletePlan);

// Rotas de Gerenciamento de Configurações
router.get('/settings', adminController.getAllSettings);
router.put('/settings/:key', adminController.updateSetting);

// Rotas de Gerenciamento de Agentes (Legado)
router.get('/agents/system', adminController.getSystemAgents);
router.get('/agents/user-created', adminController.getUserCreatedAgents);
router.post('/agents/system', adminController.createSystemAgent);
router.put('/agents/system/:id', adminController.updateSystemAgent);
router.delete('/agents/system/:id', adminController.deleteSystemAgent);

// Rotas de Gerenciamento de Assistentes
router.get('/assistants/system', adminController.getSystemAssistants);
router.get('/assistants/user-created', adminController.getUserCreatedAssistants);
router.post('/assistants/system', adminController.createSystemAssistant);
router.put('/assistants/system/:id', adminController.updateSystemAssistant);
router.delete('/assistants/system/:id', adminController.deleteSystemAssistant);

// Rotas de Gerenciamento de Transcrições
router.get('/transcriptions', adminController.getAllTranscriptions);
router.put('/transcriptions/:id', adminController.updateTranscription);
router.delete('/transcriptions/:id', adminController.deleteTranscription);

// Rotas de Gerenciamento de Histórico
router.get('/history', adminController.getAllHistory);

module.exports = router;