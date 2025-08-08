// src/features/HistoryActions/historyActions.controller.js
const historyActionsService = require('./historyActions.service');
const fs = require('fs');

const historyActionsController = {

  /**
   * Lida com as requisições de ação para o histórico.
   */
  async handleAction(req, res, next) {
    const { historyId } = req.params;
    const { action } = req.body; // 'download_txt', 'download_pdf', 'email_txt', 'email_pdf'
    const userId = req.user.userId;
    let tempFilePath = null;

    try {
      if (!action) {
        return res.status(400).json({ message: 'O campo "action" é obrigatório no corpo da requisição.' });
      }

      const result = await historyActionsService.processHistoryAction(userId, historyId, action);
      
      if (result.type === 'download') {
        res.setHeader('Content-Disposition', `attachment; filename=${result.fileName}`);
        res.setHeader('Content-Type', result.mimeType);

        if (result.filePath) {
          // Se for um arquivo no disco (PDF temporário)
          tempFilePath = result.filePath;
          const fileStream = fs.createReadStream(tempFilePath);
          fileStream.pipe(res);
        } else {
          // Se for conteúdo em buffer (TXT)
          res.send(result.content);
        }

      } else if (result.type === 'email_sent') {
        res.status(200).json({ message: result.message });
      } else {
        // Caso inesperado
        throw new Error('Tipo de resultado de serviço desconhecido.');
      }
    } catch (error) {
      const status = error.status || 500;
      const message = error.message || 'Ocorreu um erro interno no servidor.';
      res.status(status).json({ message });
    } finally {
      // Garante a limpeza do arquivo temporário de PDF após o download
      if (tempFilePath) {
        fs.unlink(tempFilePath, (err) => {
          if (err) console.error(`Erro ao deletar arquivo temporário ${tempFilePath}:`, err);
        });
      }
    }
  },
};

module.exports = historyActionsController;