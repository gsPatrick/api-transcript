const express = require('express');
const adminController = require('./admin.controller');
const authMiddleware = require('../../utils/authMiddleware');
const adminMiddleware = require('../../utils/adminMiddleware');

const router = express.Router();

// Todas as rotas de admin devem ser protegidas por authMiddleware e adminMiddleware
router.use(authMiddleware);
router.use(adminMiddleware);


router.get('/users/:id', adminController.getUserById);
router.put('/users/:id', adminController.updateUser);
router.delete('/users/:id', adminController.deleteUser);

// Rotas para Planos
router.post('/plans', adminController.createPlan);
router.get('/plans', adminController.getAllPlans);
router.get('/plans/:id', adminController.getPlanById);
router.put('/plans/:id', adminController.updatePlan);
router.delete('/plans/:id', adminController.deletePlan);

router.get('/dashboard-stats', adminController.getDashboardStats);
router.get('/agents/user-created', adminController.getAllUserCreatedAgents);


// Rotas para Agentes do Sistema (legado)
router.post('/agents/system', adminController.createSystemAgent);
router.get('/agents/system', adminController.getAllSystemAgents);
router.get('/agents/system/:id', adminController.getSystemAgentById);
router.put('/agents/system/:id', adminController.updateSystemAgent);
router.delete('/agents/system/:id', adminController.deleteSystemAgent);

// Rotas para Gerenciamento de Usuários (Admin)
router.get('/users', adminController.getAllUsers);
router.post('/users/assign-plan', adminController.assignPlanToUser);
router.post('/users/set-admin-role', adminController.setAdminRole);


// --- ROTAS PARA GERENCIAMENTO DE CONFIGURAÇÕES GLOBAIS ---
router.get('/settings', adminController.listSettings);
router.get('/settings/:key', adminController.getSetting);
router.put('/settings/:key', adminController.updateSetting);

// <<< NOVO BLOCO: Rotas para Assistentes do Sistema >>>
router.post('/assistants/system', adminController.createSystemAssistant);
router.get('/assistants/system', adminController.getAllSystemAssistants);
router.get('/assistants/system/:id', adminController.getSystemAssistantById);
router.put('/assistants/system/:id', adminController.updateSystemAssistant);
router.delete('/assistants/system/:id', adminController.deleteSystemAssistant);

// <<< NOVO: Rota para listar Assistentes Criados por Usuários (para replicação) >>>
router.get('/assistants/user-created', adminController.getAllUserCreatedAssistants);


module.exports = router;