module.exports = (sequelize, DataTypes) => {
  const Agent = sequelize.define('Agent', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    promptTemplate: { type: DataTypes.TEXT, allowNull: false },
    outputFormat: { type: DataTypes.ENUM('text', 'pdf'), defaultValue: 'text', allowNull: false },
    modelUsed: { type: DataTypes.STRING, defaultValue: 'gpt-3.5-turbo', allowNull: false },
    isSystemAgent: { type: DataTypes.BOOLEAN, defaultValue: true, allowNull: false },
    // CORREÇÃO: Referência a 'users' em minúsculas
    createdByUserId: { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
    requiresUserOpenAiToken: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
    planSpecific: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
    allowedPlanIds: { type: DataTypes.JSONB, defaultValue: [], allowNull: false }
  }, {
    tableName: 'agents',
    timestamps: true,
  });

  Agent.associate = (models) => {
    Agent.belongsTo(models.User, {
      foreignKey: 'createdByUserId',
      as: 'creator',
    });
    Agent.hasMany(models.AgentAction, {
      foreignKey: 'agentId',
      as: 'agentActions'
    });
    Agent.belongsToMany(models.Plan, {
      through: 'AgentPlans',
      foreignKey: 'agentId',
      as: 'allowedPlans'
    });
  };

  return Agent;
};