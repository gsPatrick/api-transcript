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
      /*
        Estrutura para 'features' relacionada a agentes:
        {
          "maxAgentUses": 50,                 // Quantidade máxima de usos de agentes de IA (-1 para ilimitado)
          "allowUserAgentCreation": false,    // O usuário pode criar seus próprios agentes de IA?
          "maxUserAgents": 5,                 // NOVO: Quantidade máxima de agentes que o usuário pode criar (-1 para ilimitado)
          "userAgentCreationResetPeriod": "monthly", // NOVO: 'monthly', 'yearly', 'never' (para limite total)
          "allowUserProvideOwnAgentToken": false,
          "useSystemTokenForSystemAgents": true,
          "allowedSystemAgentIds": [],
        }
      */
    },
  }, {
    tableName: 'plans',
    timestamps: true,
  });

  Plan.associate = (models) => {
    Plan.hasMany(models.User, { foreignKey: 'planId', as: 'users' });
  };

  return Plan;
};