// src/models/transcription.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Transcription = sequelize.define('Transcription', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
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
    
    // Relação legada (mantida por enquanto)
    Transcription.hasMany(models.AgentAction, { foreignKey: 'transcriptionId', as: 'agentActions' });
    
    // <<< CORREÇÃO APLICADA AQUI >>>
    // A nova relação com AssistantHistory agora tem seu próprio alias exclusivo.
    Transcription.hasMany(models.AssistantHistory, { foreignKey: 'transcriptionId', as: 'assistantHistory' });
  };

  return Transcription;
};