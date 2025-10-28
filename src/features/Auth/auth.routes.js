// src/features/Auth/auth.routes.js
const express = require('express');
const authController = require('./auth.controller');
const authMiddleware = require('../../utils/authMiddleware'); // Importa o middleware

const router = express.Router();

// Rota de registro de usuário
router.post('/register', authController.register);

// Rota de login de usuário
router.post('/login', authController.login);

// <<< NOVAS ROTAS PARA REDEFINIÇÃO DE SENHA >>>
// Rota para solicitar o e-mail de redefinição de senha
router.post('/forgot-password', authController.forgotPassword);

// Rota para efetivamente redefinir a senha com o token
router.post('/reset-password', authController.resetPassword);
// <<< FIM DAS NOVAS ROTAS >>>

// Exemplo de rota protegida (requer token JWT válido)
router.get('/protected', authMiddleware, authController.protectedRoute);

module.exports = router;