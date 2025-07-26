// src/features/Transcription/transcription.routes.js
const express = require('express');
const transcriptionController = require('./transcription.controller');
const authMiddleware = require('../../utils/authMiddleware'); // Middleware de autenticação
const upload = require('../../utils/upload'); // Middleware de upload de arquivos

const router = express.Router();

// Todas as rotas de transcrição requerem autenticação
router.use(authMiddleware);

// Rota para upload e transcrição de áudio
// 'audioFile' deve ser o nome do campo no formulário multipart/form-data
router.post('/upload', upload.single('audioFile'), transcriptionController.uploadAndTranscribe);

// Rota para listar as transcrições do usuário
router.get('/my-transcriptions', transcriptionController.listMyTranscriptions);

// Rota para buscar uma transcrição específica
router.get('/my-transcriptions/:id', transcriptionController.getTranscription);

// Rota para obter o uso atual do plano do usuário
router.get('/my-usage', transcriptionController.getMyPlanUsage);

module.exports = router;