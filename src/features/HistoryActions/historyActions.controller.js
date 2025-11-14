// src/features/HistoryActions/historyActions.controller.js
const historyActionsService = require('./historyActions.service');
const fs = require('fs');

const historyActionsController = {

  /**
   * Lida com as requisições de ação para o histórico.
   */
 async handleAction(req, res, next) {
    const { historyId } = req.params;
    // <<< MUDANÇA: Agora passamos todo o 'body' para o serviço >>>
    const { action, ...options } = req.body; 
    const userId = req.user.userId;
    let tempFilePath = null;

    try {
      if (!action) {
        return res.status(400).json({ message: 'O campo "action" é obrigatório.' });
      }

      const result = await historyActionsService.processHistoryAction(userId, historyId, action, options);
      
      if (result.type === 'download') {
        res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`); // Aspas no nome do arquivo
        res.setHeader('Content-Type', result.mimeType);

        // <<< MUDANÇA: Lógica para diferenciar conteúdo em buffer de arquivo em disco >>>
        if (result.filePath) {
          // Se for um arquivo no disco (PDF temporário)
          tempFilePath = result.filePath;
          const fileStream = fs.createReadStream(tempFilePath);
          fileStream.pipe(res);
          
          // O finally block cuidará da limpeza
          fileStream.on('close', () => {
              fs.unlink(tempFilePath, (err) => {
                  if (err) console.error(`Erro ao deletar arquivo temporário ${tempFilePath}:`, err);
              });
          });

        } else {
          // Se for conteúdo em buffer (TXT)
          res.send(result.content);
        }

      } else if (result.type === 'email_sent') {
        res.status(200).json({ message: result.message });
      } else {
        throw new Error('Tipo de resultado de serviço desconhecido.');
      }
    } catch (error) {
        // Limpa o arquivo temporário em caso de erro também
        if (tempFilePath) {
            fs.unlink(tempFilePath, (err) => {
                if (err) console.error(`Erro ao deletar arquivo temporário ${tempFilePath} após falha:`, err);
            });
        }
        const status = error.status || 500;
        const message = error.message || 'Ocorreu um erro interno no servidor.';
        res.status(status).json({ message });
    } 
    // O 'finally' foi removido para usar o callback 'close' do stream, que é mais seguro.
  },
};
module.exports = historyActionsController;
