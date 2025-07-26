// src/models/subscriptionOrder.js
module.exports = (sequelize, DataTypes) => {
  const SubscriptionOrder = sequelize.define('SubscriptionOrder', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE', // Se o usuário for deletado, seus pedidos de assinatura também
    },
    planId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'Plans',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT', // Não permite deletar um plano se houver pedidos de assinatura relacionados
    },
    totalAmount: { // Valor do plano no momento da compra
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    status: { // pending, approved, rejected, cancelled, in_process
      type: DataTypes.ENUM('pending', 'approved', 'rejected', 'cancelled', 'in_process'),
      defaultValue: 'pending',
      allowNull: false,
    },
    mercadopagoPreferenceId: { // ID da preferência gerada no Mercado Pago
      type: DataTypes.STRING,
      allowNull: true,
      unique: true, // Cada pedido de assinatura gera uma preferência única
    },
    mercadopagoPaymentId: { // ID do pagamento efetivado no Mercado Pago (vem do webhook)
      type: DataTypes.STRING,
      allowNull: true,
      unique: true, // Cada pagamento tem um ID único
    },
    mercadopagoPaymentDetails: { // Detalhes completos do pagamento do MP (JSONB para flexibilidade)
      type: DataTypes.JSONB,
      allowNull: true,
    },
  }, {
    tableName: 'subscription_orders', // Nome da tabela no banco de dados
    timestamps: true,
  });

  SubscriptionOrder.associate = (models) => {
    SubscriptionOrder.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    SubscriptionOrder.belongsTo(models.Plan, { foreignKey: 'planId', as: 'plan' });
  };

  return SubscriptionOrder;
};