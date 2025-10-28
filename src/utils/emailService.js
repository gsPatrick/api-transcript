const { Resend } = require('resend');
const settings = require('../config/settings');

// A instância do Resend é configurada a partir do lib/resend.js, mas para garantir
// que o serviço de email funcione de forma independente, vamos buscar a chave aqui também.
const RESEND_API_KEY = settings.get('RESEND_API_KEY');

if (!RESEND_API_KEY) {
  console.warn('Aviso: RESEND_API_KEY não definida no DB ou .env. A funcionalidade de envio de e-mail estará desabilitada.');
}

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

const emailService = {
  /**
   * NOVO: Envia um e-mail de redefinição de senha.
   * @param {string} to - O e-mail do destinatário.
   * @param {string} token - O token de redefinição (não hasheado).
   * @returns {Promise<void>}
   */
  sendPasswordResetEmail: async (to, token) => {
    if (!resend) {
      throw new Error('O serviço de e-mail não está configurado. Verifique a RESEND_API_KEY.');
    }

    // Constrói a URL que o usuário usará para redefinir a senha no frontend
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    const subject = 'Redefinição de Senha - CondutaMedX';
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
        <h2>Redefinição de Senha</h2>
        <p>Você solicitou a redefinição da sua senha para sua conta na CondutaMedX. Clique no botão abaixo para criar uma nova senha:</p>
        <a href="${resetUrl}" style="background-color: #0c66d4; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
          Redefinir Senha
        </a>
        <p>Se você não solicitou esta alteração, por favor, ignore este e-mail. Sua senha permanecerá a mesma.</p>
        <p style="font-size: 0.9em;">Este link é válido por 1 hora.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="font-size: 0.8em; color: #777;">Se o botão não funcionar, copie e cole a seguinte URL no seu navegador: <br> <a href="${resetUrl}">${resetUrl}</a></p>
      </div>
    `;

    try {
      await resend.emails.send({
        from: 'CondutaMedX <onboarding@resend.dev>', // Em produção, use um domínio verificado no Resend.
        to: [to],
        subject: subject,
        html: htmlBody,
      });
      console.log(`E-mail de redefinição de senha enviado para ${to}`);
    } catch (error) {
      console.error(`Falha ao enviar e-mail de redefinição para ${to}:`, error);
      throw new Error('Falha no serviço de envio de e-mail.');
    }
  },

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