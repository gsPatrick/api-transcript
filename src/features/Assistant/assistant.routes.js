// src/features/Assistant/assistant.routes.js
const express = require('express');
const assistantController = require('./assistant.controller');
const authMiddleware = require('../../utils/authMiddleware');

// IMPORTANTE: Você precisará de um middleware multer configurado para múltiplos arquivos.
// Exemplo: const uploadKnowledgeFiles = require('../../utils/uploadKnowledgeFiles');
// Por enquanto, usaremos um placeholder.
const multer = require('multer');
const upload = multer({ dest: 'uploads/temp/' }); // Configuração básica de multer
const uploadKnowledgeFiles = upload.array('knowledgeFiles', 10); // Aceita até 10 arquivos no campo 'knowledgeFiles'


const router = express.Router();
router.use(authMiddleware);

// --- Rotas Principais de Execução e Visualização ---
router.post('/run', assistantController.runOnTranscription);
router.get('/available', assistantController.listAvailable);


// --- Rotas para o Usuário Gerenciar Seus Próprios Assistentes (CRUD) ---

// <<< MODIFICADO: Adicionado middleware de upload >>>
// POST /api/assistants/my-assistants -> Criar um novo assistente pessoal
router.post('/my-assistants', uploadKnowledgeFiles, assistantController.createMyAssistant);

// <<< MODIFICADO: Adicionado middleware de upload >>>
// PUT /api/assistants/my-assistants/:id -> Atualizar um assistente pessoal
router.put('/my-assistants/:id', uploadKnowledgeFiles, assistantController.updateMyAssistant);

// DELETE /api/assistants/my-assistants/:id -> Deletar um assistente pessoal
router.delete('/my-assistants/:id', assistantController.deleteMyAssistant);


// --- Rotas para o Usuário Acessar Seu Histórico de Ações ---
router.get('/my-history', assistantController.listMyHistory);
router.get('/my-history/:id', assistantController.getMyHistory);
router.get('/my-history/:id/download', assistantController.downloadHistoryOutput);


module.exports = router;