// src/features/HistoryActions/historyActions.service.js
const db = require('../../config/database');
const pdfGenerator = require('../../utils/pdfGenerator');
const emailService = require('../../utils/emailService');
const fs = require('fs/promises');
const path = require('path');

const { AssistantHistory, User } = db;
const TEMP_DIR = path.join(__dirname, '..', '..', '..', 'uploads', 'temp');

// Garante que o diretório temporário exista
const ensureTempDir = async () => {
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true });
  } catch (error) {
    console.error("Erro ao criar diretório temporário:", error);
  }
};
ensureTempDir();


const historyActionsService = {

  /**
   * Processa uma ação (download ou e-mail) para um registro de histórico.
   * @param {string} userId - ID do usuário que faz a requisição.
   * @param {string} historyId - ID do registro de histórico.
   * @param {string} action - Ação a ser executada ('download_txt', 'download_pdf', 'email_txt', 'email_pdf').
   * @returns {object} Um objeto contendo os dados para a resposta do controller.
   */
  async processHistoryAction(userId, historyId, action) {
    const user = await User.findByPk(userId);
    if (!user) throw new Error('Usuário não encontrado.');

    const history = await AssistantHistory.findOne({
      where: { id: historyId, userId },
    });

    if (!history) {
      throw { status: 404, message: 'Registro de histórico não encontrado ou você não tem permissão para acessá-lo.' };
    }

    if (history.status !== 'completed') {
      throw { status: 400, message: 'A ação só pode ser executada em um registro com status "completed".' };
    }

    const { outputText } = history;
    const baseFileName = `resultado_assistente_${historyId.substring(0, 8)}`;

    switch (action) {
      case 'download_txt':
        return {
          type: 'download',
          fileName: `${baseFileName}.txt`,
          mimeType: 'text/plain',
          content: Buffer.from(outputText, 'utf-8'),
        };

      case 'download_pdf': {
        const tempPdfPath = await pdfGenerator.generateTextPdf(outputText, `temp_${baseFileName}`, TEMP_DIR);
        return {
          type: 'download',
          fileName: `${baseFileName}.pdf`,
          mimeType: 'application/pdf',
          filePath: tempPdfPath, // Caminho para o arquivo a ser transmitido e depois deletado
        };
      }

      case 'email_txt': {
        const attachment = {
          filename: `${baseFileName}.txt`,
          content: Buffer.from(outputText, 'utf-8'),
        };
        await emailService.sendEmailWithAttachment(
          user.email,
          'Seu Resultado do Assistente',
          'Olá! Segue em anexo o resultado da sua solicitação ao assistente.',
          attachment
        );
        return { type: 'email_sent', message: `E-mail com o resultado em TXT enviado para ${user.email}.` };
      }
        
      case 'email_pdf': {
        const tempPdfPath = await pdfGenerator.generateTextPdf(outputText, `temp_${baseFileName}`, TEMP_DIR);
        const pdfBuffer = await fs.readFile(tempPdfPath);
        const attachment = {
          filename: `${baseFileName}.pdf`,
          content: pdfBuffer,
        };
        await emailService.sendEmailWithAttachment(
          user.email,
          'Seu Resultado do Assistente',
          'Olá! Segue em anexo o resultado da sua solicitação ao assistente.',
          attachment
        );
        await fs.unlink(tempPdfPath); // Limpa o arquivo temporário
        return { type: 'email_sent', message: `E-mail com o resultado em PDF enviado para ${user.email}.` };
      }

      default:
        throw { status: 400, message: 'Ação inválida ou não suportada.' };
    }
  },
};

module.exports = historyActionsService;