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
  async processHistoryAction(userId, historyId, action, options = {}) { // Adicionado 'options' para email
    const user = await User.findByPk(userId);
    if (!user) throw { status: 404, message: 'Usuário não encontrado.' };

    const history = await AssistantHistory.findOne({
      where: { id: historyId, userId },
      include: [
          // Incluímos os modelos associados para ter mais informações para os nomes dos arquivos
          { association: 'assistant', attributes: ['name'] },
          { association: 'transcription', attributes: ['originalFileName'] }
      ]
    });

    if (!history) {
      throw { status: 404, message: 'Registro de histórico não encontrado ou você não tem permissão para acessá-lo.' };
    }

    if (history.status !== 'completed') {
      throw { status: 400, message: 'A ação só pode ser executada em um registro com status "completed".' };
    }

    const { outputText } = history;
    // Nomes de arquivo mais descritivos
    const transcriptionName = history.transcription?.originalFileName?.replace(/\.[^/.]+$/, "") || 'transcricao';
    const assistantName = history.assistant?.name?.replace(/\s+/g, '_') || 'assistente';
    const baseFileName = `${transcriptionName}-${assistantName}`;

    switch (action) {
      case 'download_txt':
        return {
          type: 'download',
          fileName: `${baseFileName}.txt`,
          mimeType: 'text/plain',
          content: Buffer.from(outputText, 'utf-8'),
        };

      // <<< NOVO CASE PARA DOWNLOAD DE PDF >>>
      case 'download_pdf': {
        // Gera um PDF em um diretório temporário
        const tempPdfPath = await pdfGenerator.generateTextPdf(outputText, `temp_${baseFileName}_${Date.now()}`, TEMP_DIR);
        return {
          type: 'download',
          fileName: `${baseFileName}.pdf`,
          mimeType: 'application/pdf',
          filePath: tempPdfPath, // Retorna o caminho do arquivo para o controller
        };
      }

      // Cases de email (modificados para usar o 'options' e nomes de arquivo melhores)
      case 'email_txt': {
        if (!options.recipientEmail) throw { status: 400, message: 'Email do destinatário é obrigatório.'};
        const attachment = {
          filename: `${baseFileName}.txt`,
          content: Buffer.from(outputText, 'utf-8'),
        };
        await emailService.sendEmailWithAttachment(
          options.recipientEmail,
          `Seu Conteúdo Gerado: ${history.assistant.name}`,
          `<p>Olá!</p><p>Segue em anexo o conteúdo gerado pelo assistente <strong>${history.assistant.name}</strong> a partir da transcrição <strong>${history.transcription.originalFileName}</strong>.</p>`,
          attachment
        );
        return { type: 'email_sent', message: `E-mail com o resultado em TXT enviado para ${options.recipientEmail}.` };
      }
        
      case 'email_pdf': {
        if (!options.recipientEmail) throw { status: 400, message: 'Email do destinatário é obrigatório.'};
        const tempPdfPath = await pdfGenerator.generateTextPdf(outputText, `temp_${baseFileName}_${Date.now()}`, TEMP_DIR);
        const pdfBuffer = await fs.readFile(tempPdfPath);
        const attachment = {
          filename: `${baseFileName}.pdf`,
          content: pdfBuffer,
        };
        await emailService.sendEmailWithAttachment(
          options.recipientEmail,
          `Seu Conteúdo Gerado: ${history.assistant.name}`,
          `<p>Olá!</p><p>Segue em anexo o conteúdo gerado pelo assistente <strong>${history.assistant.name}</strong> a partir da transcrição <strong>${history.transcription.originalFileName}</strong>.</p>`,
          attachment
        );
        await fs.unlink(tempPdfPath); // Limpa o arquivo temporário
        return { type: 'email_sent', message: `E-mail com o resultado em PDF enviado para ${options.recipientEmail}.` };
      }

      default:
        throw { status: 400, message: 'Ação inválida ou não suportada.' };
    }
  },
};

module.exports = historyActionsService;
