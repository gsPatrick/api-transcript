// src/models/user.js
module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    role: {
      type: DataTypes.ENUM('user', 'admin'),
      defaultValue: 'user',
      allowNull: false,
    },
    planId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'Plans',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    planExpiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    transcriptionsUsedCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },
    transcriptionMinutesUsed: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.00,
      allowNull: false,
    },
    agentUsesUsed: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },
    // --- NOVOS CAMPOS PARA AGENTES DO USUÁRIO ---
    userAgentsCreatedCount: { // Quantidade de agentes criados pelo usuário no período atual
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },
    lastAgentCreationResetDate: { // Data do último reset da contagem de agentes criados
      type: DataTypes.DATE,
      allowNull: true, // Será setado na primeira criação ou no primeiro reset
    },
    // --- FIM NOVOS CAMPOS ---
    openAiApiKey: {
      type: DataTypes.STRING,
      allowNull: true,
    }
  }, {
    tableName: 'users',
    timestamps: true,
  });

  User.associate = (models) => {
    User.belongsTo(models.Plan, { foreignKey: 'planId', as: 'currentPlan' });
    User.hasMany(models.Agent, { foreignKey: 'createdByUserId', as: 'createdAgents' });
    User.hasMany(models.SubscriptionOrder, { foreignKey: 'userId', as: 'subscriptionOrders' });
    User.hasMany(models.Transcription, { foreignKey: 'userId', as: 'transcriptions' });
    User.hasMany(models.AgentAction, { foreignKey: 'userId', as: 'agentActions' });
  };

  return User;
};