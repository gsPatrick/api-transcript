// src/features/Admin/admin.routes.js

const express = require('express');
const adminController = require('./admin.controller');
const authMiddleware = require('../../utils/authMiddleware');
const adminMiddleware = require('../../utils/adminMiddleware');

// Configuração do Multer para upload de arquivos
const multer = require('multer');
const upload = multer({ dest: 'uploads/temp/' });
const uploadKnowledgeFiles = upload.array('knowledgeFiles', 10);

const router = express.Router();

// Aplica middlewares de autenticação e autorização de admin a TODAS as rotas deste arquivo
router.use(authMiddleware, adminMiddleware);

// --- Rota de Estatísticas do Dashboard ---
router.get('/dashboard-stats', adminController.getDashboardStats);

// --- Rotas de Gerenciamento de Usuários ---
router.get('/users', adminController.getAllUsers);
router.get('/users/:id', adminController.getUserById);
router.put('/users/:id', adminController.updateUser);
router.delete('/users/:id', adminController.deleteUser);
router.post('/users/assign-plan', adminController.assignPlanToUser);

// --- Rotas de Gerenciamento de Planos ---
router.post('/plans', adminController.createPlan);
router.get('/plans', adminController.getAllPlans);
// (Futuras rotas de Planos como GET by ID, PUT, DELETE podem ser adicionadas aqui)

// --- Rotas de Gerenciamento de Configurações Globais ---
router.get('/settings', adminController.listSettings);
router.put('/settings/:key', adminController.updateSetting);

// --- Rotas de Gerenciamento de Assistentes ---
router.get('/assistants/system', adminController.getAllSystemAssistants);
router.get('/assistants/user-created', adminController.getAllUserCreatedAssistants);
router.get('/assistants/system/:id', adminController.getSystemAssistantById);
router.delete('/assistants/system/:id', adminController.deleteSystemAssistant);

// Rotas de CRUD que envolvem upload de arquivos
router.post('/assistants/system', uploadKnowledgeFiles, adminController.createSystemAssistant);
router.put('/assistants/system/:id', uploadKnowledgeFiles, adminController.updateSystemAssistant);

module.exports = router;