require('dotenv').config();

const { Sequelize } = require('sequelize');
const path = require('path');

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: process.env.DB_DIALECT,
    port: process.env.DB_PORT,
    logging: false,
  }
);

const db = {};

db.Sequelize = Sequelize;
db.sequelize = sequelize;

// Importa todos os modelos via src/models/index.js (padrão do Sequelize)
// Isso garante que as associações sejam configuradas corretamente
const models = require(path.join(__dirname, '..', 'models'));
Object.keys(models).forEach(modelName => {
  if (modelName !== 'sequelize' && modelName !== 'Sequelize') { // Evita sobreescrever as instâncias
    db[modelName] = models[modelName];
  }
});

// Garante que as associações sejam chamadas, caso não sejam no index.js
Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

module.exports = db;