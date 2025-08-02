// src/config/database.js

// O arquivo 'models/index.js' é o ponto central que o Sequelize usa
// para carregar a conexão (sequelize), a classe (Sequelize) e todos os modelos.
// Ele exporta um objeto que contém tudo isso.
const db = require('../models');

// Apenas para garantir que a conexão foi estabelecida ao carregar este módulo.
// Isso não é estritamente necessário se o app.js já faz a autenticação,
// mas pode ajudar a capturar erros de conexão mais cedo.
db.sequelize.authenticate()
  .then(() => {
    console.log('Database.js: Autenticação com o banco de dados bem-sucedida.');
  })
  .catch(err => {
    console.error('Database.js: Erro ao autenticar com o banco de dados:', err);
  });

// Exporta o objeto 'db' completo, que contém a instância sequelize,
// a classe Sequelize e todos os modelos (User, Plan, etc.).
module.exports = db;