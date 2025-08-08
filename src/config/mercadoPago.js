// src/config/mercadoPago.js

const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');

const mercadopagoServices = {
  client: null,
  preferences: null,
  payment: null,
  isConfigured: false,

  configure: () => {
    // CORREÇÃO: Lê o token da variável de ambiente
    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    
    if (!accessToken) {
      console.error('[MercadoPago] ERRO CRÍTICO: MERCADO_PAGO_ACCESS_TOKEN não foi encontrada nas variáveis de ambiente. O serviço de pagamento estará desativado.');
      mercadopagoServices.isConfigured = false;
      return;
    }

    console.log(`[MercadoPago] Configurando o SDK com o Access Token...`);

    try {
      const client = new MercadoPagoConfig({ 
        accessToken: accessToken,
        options: { timeout: 5000 }
      });

      mercadopagoServices.client = client;
      mercadopagoServices.preferences = new Preference(client);
      mercadopagoServices.payment = new Payment(client);
      mercadopagoServices.isConfigured = true;

      console.log('✅ [MercadoPago] SDK configurado com sucesso.');

    } catch (error) {
      console.error('[MercadoPago] ERRO CRÍTICO ao instanciar os serviços do SDK:', error);
      mercadopagoServices.isConfigured = false;
    }
  }
};

module.exports = mercadopagoServices;