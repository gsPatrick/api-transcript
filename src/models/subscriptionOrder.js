module.exports = (sequelize, DataTypes) => {
  const SubscriptionOrder = sequelize.define('SubscriptionOrder', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    // CORREÇÃO: Referência a 'users' em minúsculas
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    // CORREÇÃO: Referência a 'plans' em minúsculas
    planId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'plans',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
    totalAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'rejected', 'cancelled', 'in_process'),
      defaultValue: 'pending',
      allowNull: false,
    },
    mercadopagoPreferenceId: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
    },
    mercadopagoPaymentId: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
    },
    mercadopagoPaymentDetails: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  }, {
    tableName: 'subscription_orders',
    timestamps: true,
  });

  SubscriptionOrder.associate = (models) => {
    SubscriptionOrder.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    SubscriptionOrder.belongsTo(models.Plan, { foreignKey: 'planId', as: 'plan' });
  };

  return SubscriptionOrder;
};