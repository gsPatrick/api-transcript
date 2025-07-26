// src/config/openai.js
const OpenAI = require('openai');
const settings = require('./settings'); // Importa o novo gerenciador de configurações

let openaiInstance = null;

// Função para obter ou criar a instância da OpenAI
const getOpenAIInstance = () => {
  if (openaiInstance) {
    return openaiInstance;
  }

  const apiKey = settings.get('OPENAI_API_KEY');

  if (!apiKey) {
    console.warn('AVISO: OPENAI_API_KEY não configurada no DB ou .env. Funções da OpenAI podem falhar.');
    // Pode ser útil lançar um erro ou lidar com isso de forma mais robusta em produção
  }

  openaiInstance = new OpenAI({
    apiKey: apiKey || 'YOUR_FALLBACK_API_KEY_IF_NEEDED', // Fallback opcional
  });
  console.log('OpenAI configurada.');
  return openaiInstance;
};

// Exporta a função que retorna a instância (lazy loading)
module.exports = getOpenAIInstance(); // Chama a função para exportar a instância configurada