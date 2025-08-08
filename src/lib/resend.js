// src/lib/resend.js
const { Resend } = require('resend');
const settings = require('../config/settings'); // Para buscar a chave se estiver no DB ou .env

let resendInstance = null;

const getResendInstance = () => {
  // Se a instância já foi criada, retorne-a.
  if (resendInstance) {
    return resendInstance;
  }

  // Tenta obter a chave de API do Resend das configurações globais.
  const apiKey = settings.get('RESEND_API_KEY'); 

  if (!apiKey) {
    console.warn('AVISO: RESEND_API_KEY não está configurada. O serviço de envio de e-mails estará desativado.');
    return null; // Retorna null se a chave não for encontrada.
  }

  // Cria a instância e a armazena.
  resendInstance = new Resend(apiKey);
  console.log('✅ [Resend] SDK de e-mail configurado com sucesso.');
  return resendInstance;
};

// Exporta o resultado da função para que outros módulos possam usar a instância.
module.exports = getResendInstance();