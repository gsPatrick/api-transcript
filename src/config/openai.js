// src/config/openai.js
const { OpenAI } = require('openai');
const settings = require('./settings');

let openaiInstance = null;

const getOpenAIInstance = () => {
  // Se a instância já foi criada, retorne-a (padrão Singleton)
  if (openaiInstance) {
    return openaiInstance;
  }

  // Busca a chave de API do gerenciador de configurações centralizado
  const apiKey = settings.get('OPENAI_API_KEY');

  if (!apiKey) {
    console.error('CRÍTICO: OPENAI_API_KEY NÃO ENCONTRADA no DB ou .env. O serviço OpenAI estará desativado.');
    // Retorna null para que as chamadas falhem de forma explícita
    return null; 
  }

  try {
    // --- CORREÇÃO APLICADA ---
    // A inicialização correta na v4+ do SDK não requer mais passar "beta" no construtor.
    // O acesso é feito diretamente na instância: openai.beta.assistants, etc.
    openaiInstance = new OpenAI({
      apiKey: apiKey,
    });
    
    console.log('✅ [OpenAI] SDK configurado com sucesso.');
    
    // Verificação de diagnóstico para garantir que o acesso beta está disponível
    if (openaiInstance && openaiInstance.beta && openaiInstance.beta.assistants) {
        console.log('✅ [OpenAI] Acesso à API de Assistentes (v2) está disponível.');
    } else {
        console.warn('[OpenAI] AVISO: Acesso à API de Assistentes não parece estar disponível na instância do SDK.');
    }

    return openaiInstance;

  } catch (error) {
    console.error('[OpenAI Config] ERRO CRÍTICO ao instanciar o SDK da OpenAI:', error);
    return null; 
  }
};

// Exporta o resultado da função, que é a instância do SDK ou null
module.exports = getOpenAIInstance();