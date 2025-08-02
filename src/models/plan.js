// src/models/plan.js

module.exports = (sequelize, DataTypes) => {
  const Plan = sequelize.define('Plan', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    durationInDays: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    features: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
  }, {
    tableName: 'plans',
    timestamps: true,
  });

  Plan.associate = (models) => {
    Plan.hasMany(models.User, { foreignKey: 'planId', as: 'users' });

    Plan.belongsToMany(models.Agent, {
      through: 'AgentPlans',
      foreignKey: 'planId',
      as: 'allowedAgents'
    });

    // <<< MUDANÇA AQUI: Nova associação com Assistentes >>>
    Plan.belongsToMany(models.Assistant, {
      through: 'AssistantPlans', // Tabela de junção
      foreignKey: 'planId',
      as: 'allowedAssistants'
    });
  };

  return Plan;
};