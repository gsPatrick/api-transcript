// src/models/setting.js
module.exports = (sequelize, DataTypes) => {
  const Setting = sequelize.define('Setting', {
    key: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
      unique: true,
    },
    value: {
      type: DataTypes.TEXT, // Usar TEXT para valores longos como chaves de API
      allowNull: true,
    },
    description: { // Para documentar o que cada setting faz
      type: DataTypes.STRING,
      allowNull: true,
    },
    isSensitive: { // Indica se o valor deve ser ocultado em listagens (ex: chaves de API)
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
  }, {
    tableName: 'settings',
    timestamps: true,
  });

  // Não há associações para este modelo simples de chave-valor

  return Setting;
};