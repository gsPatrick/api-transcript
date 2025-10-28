// src/config/mercadoPago.js

const { MercadoPagoConfig, Preference, Payment, PreApproval } = require('mercadopago'); // <<< ADICIONADO PreApproval

const mercadopagoServices = {
  client: null,
  preferences: null,
  payment: null,
  preapproval: null, // <<< ADICIONADO
  isConfigured: false,

  configure: () => {
    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    
    if (!accessToken) {
      console.error('[MercadoPago] ERRO CRÍTICO: MERCADO_PAGO_ACCESS_TOKEN não foi encontrada. O serviço de pagamento estará desativado.');
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
      mercadopagoServices.preapproval = new PreApproval(client); // <<< ADICIONADO
      mercadopagoServices.isConfigured = true;

      console.log('✅ [MercadoPago] SDK configurado com sucesso.');

    } catch (error) {
      console.error('[MercadoPago] ERRO CRÍTICO ao instanciar os serviços do SDK:', error);
      mercadopagoServices.isConfigured = false;
    }
  }
};

module.exports = mercadopagoServices;