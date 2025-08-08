const { Resend } = require('resend');

const RESEND_API_KEY = process.env.RESEND_API_KEY;

if (!RESEND_API_KEY) {
  console.warn('Aviso: RESEND_API_KEY não definida. A funcionalidade de envio de e-mail estará desabilitada.');
}

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

const emailService = {
  /**
   * Envia um e-mail com um anexo.
   * @param {string} to - O e-mail do destinatário.
   * @param {string} subject - O assunto do e-mail.
   * @param {string} htmlBody - O corpo do e-mail em HTML.
   * @param {object} attachment - O anexo.
   * @param {string} attachment.filename - O nome do arquivo em anexo.
   * @param {Buffer} attachment.content - O conteúdo do arquivo como um Buffer.
   * @returns {Promise<void>}
   */
  sendEmailWithAttachment: async (to, subject, htmlBody, attachment) => {
    if (!resend) {
      throw new Error('O serviço de e-mail não está configurado. Verifique a RESEND_API_KEY.');
    }

    try {
      await resend.emails.send({
        from: 'Onboarding <onboarding@resend.dev>', // Use um domínio verificado no Resend em produção
        to: [to],
        subject: subject,
        html: htmlBody,
        attachments: [attachment],
      });
      console.log(`E-mail enviado com sucesso para ${to}`);
    } catch (error) {
      console.error(`Falha ao enviar e-mail para ${to}:`, error);
      throw new Error('Falha no serviço de envio de e-mail.');
    }
  },
};

module.exports = emailService;