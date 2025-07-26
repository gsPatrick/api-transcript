// app.js
require('dotenv').config();

const express = require('express');
const db = require('./src/config/database');
const apiRoutes = require('./src/routes/index');
const cron = require('node-cron');
const transcriptionService = require('./src/features/Transcription/transcription.service');
const path = require('path');

const settings = require('./src/config/settings'); // Importa o gerenciador de configurações
const mercadopago = require('./src/config/mercadoPago'); // Importa para configurar
// const openai = require('./src/config/openai'); // Não precisa importar diretamente aqui para configurar

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'src', 'uploads')));
app.use('/api', apiRoutes);

app.get('/', (req, res) => {
  res.send('Bem-vindo à API de Transcrição de Áudio e IA!');
});

db.sequelize.sync({ alter: true })
  .then(async () => {
    console.log('Banco de dados sincronizado.');

    // Inicializa configurações padrão no DB (se não existirem)
    // Isso é importante para que as chaves de API tenham um valor inicial
    await settings.initializeDefaultSettings([
      { key: 'MERCADO_PAGO_ACCESS_TOKEN', value: process.env.MERCADO_PAGO_ACCESS_TOKEN || '', description: 'Token de acesso do Mercado Pago', isSensitive: true },
      { key: 'OPENAI_API_KEY', value: process.env.OPENAI_API_KEY || '', description: 'Chave de API da OpenAI (para uso do sistema)', isSensitive: true },
      // Adicione outras configurações padrão aqui
    ]);

    // Carrega todas as configurações do DB para o cache
    await settings.loadSettingsFromDb();

    // Configura os SDKs externos com as chaves carregadas
    mercadopago.configure();
    // A instância da OpenAI é configurada no próprio openai.js usando settings.get()

    // Opcional: Criar um usuário admin inicial se não existir
    const User = db.User;
    const cryptoUtils = require('./src/utils/crypto');
    const existingAdmin = await User.findOne({ where: { email: 'admin@example.com' } });
    if (!existingAdmin) {
      console.log('Criando usuário admin inicial...');
      const hashedPassword = await cryptoUtils.hashPassword('admin123');
      await User.create({
        name: 'Admin User',
        email: 'admin@example.com',
        password: hashedPassword,
        role: 'admin',
      });
      console.log('Usuário admin criado: admin@example.com / admin123');
    }

    cron.schedule('0 0 * * *', async () => {
      console.log('Executando tarefa agendada: reset de uso de usuários e expiração de planos...');
      await transcriptionService.resetUserUsageAndPlanExpiration();
    });

    app.listen(PORT, () => {
      console.log(`Servidor rodando na porta ${PORT}`);
      console.log(`Acesse: http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Erro ao sincronizar o banco de dados:', err);
    process.exit(1);
  });