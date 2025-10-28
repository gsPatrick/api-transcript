// src/lib/email.service.js
const resend = require('./resend'); // Importa a instância configurada do Resend

// Verifica se o serviço de e-mail está habilitado (se a chave de API foi fornecida)
if (!resend) {
  console.warn('AVISO: O serviço de e-mail está desativado. Nenhuma mensagem será enviada. Verifique a RESEND_API_KEY.');
}

const emailService = {
  /**
   * Envia um e-mail de redefinição de senha.
   * @param {string} to - O e-mail do destinatário.
   * @param {string} token - O token de redefinição (não hasheado).
   */
  async sendPasswordResetEmail(to, token) {
    if (!resend) {
      throw new Error('O serviço de e-mail não está configurado.');
    }

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    const subject = 'Redefinição de Senha - CondutaMedX';
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; color: #333;">
        <h2>Redefinição de Senha</h2>
        <p>Você solicitou a redefinição da sua senha. Clique no botão abaixo para criar uma nova senha:</p>
        <a href="${resetUrl}" style="background-color: #0c66d4; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
          Redefinir Senha
        </a>
        <p>Se você não solicitou isso, por favor, ignore este e-mail.</p>
        <p>Este link expirará em 1 hora.</p>
        <hr>
        <p style="font-size: 0.8em; color: #777;">Se o botão não funcionar, copie e cole a seguinte URL no seu navegador: <br> ${resetUrl}</p>
      </div>
    `;

    try {
      await resend.emails.send({
        from: 'CondutaMedX <onboarding@resend.dev>', // Em produção, usar um domínio verificado.
        to: [to],
        subject: subject,
        html: htmlBody,
      });
      console.log(`E-mail de redefinição de senha enviado para ${to}`);
    } catch (error) {
      console.error(`Falha ao enviar e-mail de redefinição para ${to}:`, error);
      // Lançar o erro para que o serviço que chamou possa tratá-lo se necessário
      throw new Error('Falha no serviço de envio de e-mail.');
    }
  },

  /**
   * Envia um e-mail com um conteúdo gerado como anexo.
   * @param {string} to - O e-mail do destinatário.
   * @param {string} subject - O assunto do e-mail.
   * @param {string} htmlBody - O corpo do e-mail em HTML.
   * @param {object} attachment - O anexo.
   * @param {string} attachment.filename - O nome do arquivo.
   * @param {Buffer} attachment.content - O conteúdo do arquivo como Buffer.
   */
  async sendContentByEmail(to, subject, htmlBody, attachment) {
    if (!resend) {
      throw new Error('O serviço de e-mail não está configurado.');
    }

    try {
      await resend.emails.send({
        from: 'CondutaMedX <onboarding@resend.dev>',
        to: [to],
        subject: subject,
        html: htmlBody,
        attachments: [attachment],
      });
      console.log(`E-mail de conteúdo enviado com sucesso para ${to}`);
    } catch (error) {
      console.error(`Falha ao enviar e-mail de conteúdo para ${to}:`, error);
      throw new Error('Falha no serviço de envio de e-mail.');
    }
  },
};

module.exports = emailService;