// src/models/user.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const User = sequelize.define('User', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, unique: true, validate: { isEmail: true } },
    password: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.STRING, defaultValue: 'user', allowNull: false },
    openAiApiKey: { type: DataTypes.STRING, allowNull: true },
    planId: { type: DataTypes.UUID, allowNull: true, references: { model: 'plans', key: 'id' }, onDelete: 'SET NULL' },
    planExpiresAt: { type: DataTypes.DATE, allowNull: true },
    transcriptionsUsedCount: { type: DataTypes.INTEGER, defaultValue: 0, allowNull: false },
    transcriptionMinutesUsed: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.00, allowNull: false },
    agentUsesUsed: { type: DataTypes.INTEGER, defaultValue: 0, allowNull: false },
    userAgentsCreatedCount: { type: DataTypes.INTEGER, defaultValue: 0, allowNull: false },
    lastAgentCreationResetDate: { type: DataTypes.DATE, allowNull: true },
    assistantUsesUsed: { type: DataTypes.INTEGER, defaultValue: 0, allowNull: false },
    assistantsCreatedCount: { type: DataTypes.INTEGER, defaultValue: 0, allowNull: false },
    lastAssistantCreationResetDate: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'users',
    timestamps: true,
  });

  User.associate = (models) => {
    User.belongsTo(models.Plan, { foreignKey: 'planId', as: 'currentPlan' });
    User.hasMany(models.Transcription, { foreignKey: 'userId', as: 'transcriptions' });
    User.hasMany(models.AgentAction, { foreignKey: 'userId', as: 'agentActions' });
    User.hasMany(models.SubscriptionOrder, { foreignKey: 'userId', as: 'subscriptionOrders' });
    
    // Relação com os assistentes que o usuário CRIA
    User.hasMany(models.Assistant, { foreignKey: 'createdByUserId', as: 'createdAssistants' });
    
    // <<< CORREÇÃO APLICADA AQUI >>>
    // Relação com o histórico de ações que o usuário EXECUTA
    User.hasMany(models.AssistantHistory, { foreignKey: 'userId', as: 'assistantHistory' });
  };

  return User;
};