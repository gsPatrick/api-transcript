// src/models/agent.js
module.exports = (sequelize, DataTypes) => {
  const Agent = sequelize.define('Agent', {
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
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    promptTemplate: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    outputFormat: {
      type: DataTypes.ENUM('text', 'pdf'),
      defaultValue: 'text',
      allowNull: false,
    },
    modelUsed: {
      type: DataTypes.STRING,
      defaultValue: 'gpt-3.5-turbo',
      allowNull: false,
    },
    isSystemAgent: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false,
    },
    createdByUserId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'Users',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    requiresUserOpenAiToken: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    // --- NOVOS CAMPOS PARA RESTRICÃO POR PLANO ---
    planSpecific: { // Se TRUE, este agente só estará disponível para os planos listados em allowedPlanIds
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    allowedPlanIds: { // Array de UUIDs de planos (JSONB para flexibilidade)
      type: DataTypes.JSONB,
      defaultValue: [],
      allowNull: false,
    },
    // --- FIM NOVOS CAMPOS ---
  }, {
    tableName: 'agents',
    timestamps: true,
  });

  Agent.associate = (models) => {
    Agent.belongsTo(models.User, { foreignKey: 'createdByUserId', as: 'creator' });
    Agent.hasMany(models.AgentAction, { foreignKey: 'agentId', as: 'agentActions' });
  };

  return Agent;
};