// src/features/HistoryActions/historyActions.routes.js
const express = require('express');
const authMiddleware = require('../../utils/authMiddleware');
const historyActionsController = require('./historyActions.controller');

const router = express.Router();

// Todas as rotas aqui são protegidas e requerem autenticação
router.use(authMiddleware);

/**
 * @swagger
 * /api/history/{historyId}/actions:
 *   post:
 *     summary: Executa uma ação em um registro de histórico (download ou e-mail).
 *     description: Permite baixar o resultado como TXT/PDF ou enviar por e-mail para o usuário logado.
 *     tags: [History Actions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: historyId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: O ID do registro de histórico.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - action
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [download_txt, download_pdf, email_txt, email_pdf]
 *                 description: A ação a ser executada.
 *     responses:
 *       '200':
 *         description: Ação executada com sucesso. Para downloads, o arquivo é retornado. Para e-mails, uma mensagem de sucesso é retornada.
 *       '400':
 *         description: Requisição inválida (ação faltando ou inválida, ou status do histórico não é 'completed').
 *       '401':
 *         description: Não autorizado (token inválido ou ausente).
 *       '404':
 *         description: Registro de histórico não encontrado.
 *       '500':
 *         description: Erro interno do servidor.
 */
router.post('/:historyId/actions', historyActionsController.handleAction);

module.exports = router;