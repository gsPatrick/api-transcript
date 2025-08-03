// src/models/assistantHistory.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AssistantHistory = sequelize.define('AssistantHistory', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'pending' }, // pending, processing, completed, failed
    inputText: { type: DataTypes.TEXT }, // Manter para visualização no histórico
    outputText: { type: DataTypes.TEXT },
    outputFilePath: { type: DataTypes.STRING, allowNull: true }, // Caminho relativo para o PDF
    outputFormat: { type: DataTypes.STRING, allowNull: false, defaultValue: 'text' }, // 'text' ou 'pdf'
    errorMessage: { type: DataTypes.TEXT, allowNull: true },
    usedSystemToken: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // Adicionar custo (DECIMAL) se for calcular. Por enquanto, mantendo simples.
    // cost: { type: DataTypes.DECIMAL(10, 6), allowNull: true },

    // <<< NOVO: IDs da OpenAI para rastreamento >>>
    openaiThreadId: { type: DataTypes.STRING, allowNull: true }, // Para modo DINAMICO
    openaiRunId: { type: DataTypes.STRING, allowNull: true },   // Para rastrear a execução
  }, {
    tableName: 'assistant_history',
    timestamps: true,
  });

  AssistantHistory.associate = (models) => {
    AssistantHistory.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    AssistantHistory.belongsTo(models.Assistant, { foreignKey: 'assistantId', as: 'assistant' });
    AssistantHistory.belongsTo(models.Transcription, { foreignKey: 'transcriptionId', as: 'transcription' });
  };

  return AssistantHistory;
};