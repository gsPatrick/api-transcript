const express = require('express');
const adminController = require('./admin.controller');
const authMiddleware = require('../../utils/authMiddleware');
const adminMiddleware = require('../../utils/adminMiddleware');

const router = express.Router();

// Todas as rotas de admin devem ser protegidas por authMiddleware e adminMiddleware
router.use(authMiddleware);
router.use(adminMiddleware);

// Rotas para Planos
router.post('/plans', adminController.createPlan);
router.get('/plans', adminController.getAllPlans);
router.get('/plans/:id', adminController.getPlanById);
router.put('/plans/:id', adminController.updatePlan);
router.delete('/plans/:id', adminController.deletePlan);

// Rotas para Agentes do Sistema
router.post('/agents/system', adminController.createSystemAgent);
router.get('/agents/system', adminController.getAllSystemAgents);
router.get('/agents/system/:id', adminController.getSystemAgentById);
router.put('/agents/system/:id', adminController.updateSystemAgent);
router.delete('/agents/system/:id', adminController.deleteSystemAgent);

// Rotas para Gerenciamento de Usuários (Admin)
router.post('/users/assign-plan', adminController.assignPlanToUser);
router.post('/users/set-admin-role', adminController.setAdminRole);


// --- NOVAS ROTAS PARA GERENCIAMENTO DE CONFIGURAÇÕES GLOBAIS ---
router.get('/settings', adminController.listSettings);
router.get('/settings/:key', adminController.getSetting);
router.put('/settings/:key', adminController.updateSetting); // Para atualizar uma setting específica

module.exports = router;