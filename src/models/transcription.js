// src/models/transcription.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Transcription = sequelize.define('Transcription', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // <<< ADICIONADO: Novo campo para o título editável >>>
    title: { type: DataTypes.STRING, allowNull: true },
    status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'pending' },
    audioPath: { type: DataTypes.STRING, allowNull: true },
    originalFileName: { type: DataTypes.STRING },
    fileSizeKB: { type: DataTypes.INTEGER },
    durationSeconds: { type: DataTypes.INTEGER, allowNull: true },
    transcriptionText: { type: DataTypes.TEXT, allowNull: true },
    errorMessage: { type: DataTypes.TEXT, allowNull: true },
  }, {
    tableName: 'transcriptions',
    timestamps: true,
  });

  Transcription.associate = (models) => {
    Transcription.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    Transcription.hasMany(models.AgentAction, { foreignKey: 'transcriptionId', as: 'agentActions' });
    
    // <<< ALTERADO: Adicionado 'onDelete: CASCADE' para limpar o histórico ao excluir a transcrição >>>
    Transcription.hasMany(models.AssistantHistory, { 
      foreignKey: 'transcriptionId', 
      as: 'assistantHistory',
      onDelete: 'CASCADE',
      hooks: true 
    });
  };

  return Transcription;
};