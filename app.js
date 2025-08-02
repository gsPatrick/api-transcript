// app.js - Ponto de entrada principal da API
console.log("Iniciando app.js...");

// 1. Carrega as variáveis de ambiente PRIMEIRO de tudo.
require('dotenv').config();

// 2. Importa as dependências
const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const mainRouter = require('./src/routes'); // Roteador principal da API

// 3. Importa os módulos de configuração e serviços internos
const db = require('./src/config/database');
const settings = require('./src/config/settings');
const mercadopago = require('./src/config/mercadoPago');
const transcriptionService = require('./src/features/Transcription/transcription.service'); // Para o cron job

console.log("Dependências carregadas. Configurando o servidor Express...");

// 4. Inicializa a aplicação Express
const app = express();
const PORT = process.env.PORT || 5000;

// 5. Configura os Middlewares essenciais
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'src', 'uploads')));

// 6. Configura as Rotas da API
app.use('/api', mainRouter);
app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'API da Transcrimex está no ar!' });
});

console.log("Configuração do servidor concluída. Iniciando a conexão com o banco...");

// 7. Inicia o servidor DEPOIS de configurar tudo
db.sequelize.authenticate()
  .then(() => {
    console.log('✅ Conexão com o banco de dados estabelecida.');
    // Sincroniza os modelos
    return db.sequelize.sync({ alter: true }); // Usar 'false' em produção é mais seguro
  })
  .then(async () => {
    console.log('✅ Sincronização com o banco de dados bem-sucedida.');
    
    // --- LÓGICA DE INICIALIZAÇÃO ESSENCIAL REINTRODUZIDA ---
    console.log('Iniciando configurações da aplicação...');
    
    // a. Garante que as configurações padrão existam no banco de dados
    await settings.initializeDefaultSettings([
      { key: 'MERCADO_PAGO_ACCESS_TOKEN', value: process.env.MERCADO_PAGO_ACCESS_TOKEN || '', description: 'Token de acesso do Mercado Pago', isSensitive: true },
      { key: 'OPENAI_API_KEY', value: process.env.OPENAI_API_KEY || '', description: 'Chave de API da OpenAI (para uso do sistema)', isSensitive: true },
      // Adicione outras configurações padrão aqui se necessário
    ]);

    // b. Carrega todas as configurações do banco para o cache em memória
    await settings.loadSettingsFromDb();
    
    // c. Configura os SDKs externos (como Mercado Pago) usando as configurações carregadas
    mercadopago.configure();
    
    // d. Configura tarefas agendadas (cron jobs)
    cron.schedule('0 0 * * *', async () => {
      console.log('Executando tarefa agendada: reset de uso de usuários e expiração de planos...');
      await transcriptionService.resetUserUsageAndPlanExpiration();
    });
    console.log('✅ Tarefas agendadas configuradas.');
    
    console.log('✅ Configurações da aplicação finalizadas.');
    // --- FIM DA LÓGICA DE INICIALIZAÇÃO ---

    // Inicia o servidor Express para ouvir por requisições
    app.listen(PORT, () => {
      console.log(`🚀 Servidor rodando na porta ${PORT}`);
      console.log(`🔗 Acesse: http://localhost:${PORT}/`);
    });
  })
  .catch((error) => {
    console.error('❌ Falha crítica ao iniciar a aplicação:', error);
    process.exit(1);
  });