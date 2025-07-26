const express = require('express');
const authController = require('./auth.controller');
const authMiddleware = require('../../utils/authMiddleware'); // Importa o middleware

const router = express.Router();

// Rota de registro de usuário
router.post('/register', authController.register);

// Rota de login de usuário
router.post('/login', authController.login);

// Exemplo de rota protegida (requer token JWT válido)
router.get('/protected', authMiddleware, authController.protectedRoute);

module.exports = router;