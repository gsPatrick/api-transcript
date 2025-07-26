// src/config/mercadoPago.js
const mercadopago = require('mercadopago');
const settings = require('./settings'); // Importa o novo gerenciador de configurações

// Função para configurar o Mercado Pago
const configureMercadoPago = () => {
  const accessToken = settings.get('MERCADO_PAGO_ACCESS_TOKEN');

  if (!accessToken) {
    console.warn('AVISO: MERCADO_PAGO_ACCESS_TOKEN não configurado no DB ou .env. Funções do Mercado Pago podem falhar.');
    // Pode ser útil lançar um erro ou lidar com isso de forma mais robusta em produção
  }

  mercadopago.configure({
    access_token: accessToken || 'YOUR_FALLBACK_TOKEN_IF_NEEDED', // Fallback opcional
  });
  console.log('Mercado Pago configurado.');
};

// Exporta a instância e a função de configuração
module.exports = {
  ...mercadopago, // Exporta todas as propriedades da instância do mercadopago
  configure: configureMercadoPago, // Exporta a função para reconfigurar
};