// src/features/Assistant/assistant.routes.js
const express = require('express');
const assistantController = require('./assistant.controller');
const authMiddleware = require('../../utils/authMiddleware');

const router = express.Router();
router.use(authMiddleware);

// --- Rotas Principais de Execução e Visualização ---

// Rota principal para executar a ação do assistente sobre uma transcrição
router.post('/run', assistantController.runOnTranscription);

// Rota para listar os assistentes disponíveis para a ação (do sistema e do usuário)
router.get('/available', assistantController.listAvailable);


// --- Rotas para o Usuário Gerenciar Seus Próprios Assistentes (CRUD) ---

// POST /api/assistants/my-assistants -> Criar um novo assistente pessoal
router.post('/my-assistants', assistantController.createMyAssistant);

// PUT /api/assistants/my-assistants/:id -> Atualizar um assistente pessoal
router.put('/my-assistants/:id', assistantController.updateMyAssistant);

// DELETE /api/assistants/my-assistants/:id -> Deletar um assistente pessoal
router.delete('/my-assistants/:id', assistantController.deleteMyAssistant);


// --- Rotas para o Usuário Acessar Seu Histórico de Ações ---

// GET /api/assistants/my-history -> Listar todo o histórico de execuções
router.get('/my-history', assistantController.listMyHistory);

// GET /api/assistants/my-history/:id -> Ver detalhes de uma execução específica
router.get('/my-history/:id', assistantController.getMyHistory);

// GET /api/assistants/my-history/:id/download -> Baixar o resultado em PDF (se aplicável)
router.get('/my-history/:id/download', assistantController.downloadHistoryOutput);


module.exports = router;