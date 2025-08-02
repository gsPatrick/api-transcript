// src/config/mercadoPago.js

const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const settings = require('./settings');

const mercadopagoServices = {
  client: null, // <<< ADICIONADO: Armazena o cliente
  preferences: null,
  payment: null,
  isConfigured: false,

  configure: () => {
    const accessToken = 'TEST-543842517815393-052409-2b6e0c6eaa8b7efc9885a56cb8f22377-230029956'
    
    // Log para depuração
    if (!accessToken) {
      console.error('[MercadoPago] ERRO CRÍTICO: MERCADO_PAGO_ACCESS_TOKEN não foi encontrado nas configurações ou .env. O serviço de pagamento estará desativado.');
      mercadopagoServices.isConfigured = false;
      return;
    }

    console.log(`[MercadoPago] Configurando o SDK com o Access Token...`);

    try {
      // Cria o cliente de configuração com o token
      const client = new MercadoPagoConfig({ 
        accessToken: accessToken,
        options: { timeout: 5000 }
      });

      // Armazena as instâncias
      mercadopagoServices.client = client; // <<< ADICIONADO
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