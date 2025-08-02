// src/features/Public/public.routes.js

const express = require('express');
// Vamos reutilizar o controller de usuário, pois a função getPlans já existe e é simples
const userController = require('../User/user.controller');

const router = express.Router();

// Esta rota é para qualquer um acessar a lista de planos
router.get('/plans', userController.getPlans);

module.exports = router;