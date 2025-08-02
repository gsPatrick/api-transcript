// src/models/assistantAction.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AssistantAction = sequelize.define('AssistantAction', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'pending' }, // pending, processing, completed, failed
    inputText: { type: DataTypes.TEXT },
    outputText: { type: DataTypes.TEXT },
    outputFilePath: { type: DataTypes.STRING, allowNull: true }, // Caminho relativo para o PDF
    outputFormat: { type: DataTypes.STRING, allowNull: false, defaultValue: 'text' }, // 'text' ou 'pdf'
    errorMessage: { type: DataTypes.TEXT, allowNull: true },
    usedSystemToken: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    cost: { type: DataTypes.DECIMAL(10, 6), allowNull: true },
  }, {
    tableName: 'assistant_actions',
    timestamps: true,
  });

  AssistantAction.associate = (models) => {
    AssistantAction.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    AssistantAction.belongsTo(models.Assistant, { foreignKey: 'assistantId', as: 'assistant' });
    AssistantAction.belongsTo(models.Transcription, { foreignKey: 'transcriptionId', as: 'transcription' });
  };

  return AssistantAction;
};