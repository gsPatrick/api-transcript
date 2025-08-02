module.exports = (sequelize, DataTypes) => {
  const AgentAction = sequelize.define('AgentAction', {
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
    // CORREÇÃO: Referência a 'agents' em minúsculas
    agentId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'agents',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
    // CORREÇÃO: Referência a 'transcriptions' em minúsculas
    transcriptionId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'transcriptions',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    inputText: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    outputText: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    outputFormat: {
      type: DataTypes.ENUM('text', 'pdf'),
      allowNull: false,
    },
    outputFilePath: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed'),
      defaultValue: 'pending',
      allowNull: false,
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    usedSystemToken: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
    },
    cost: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: true,
    }
  }, {
    tableName: 'agent_actions',
    timestamps: true,
  });

  AgentAction.associate = (models) => {
    AgentAction.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    AgentAction.belongsTo(models.Agent, { foreignKey: 'agentId', as: 'agent' });
    AgentAction.belongsTo(models.Transcription, { foreignKey: 'transcriptionId', as: 'transcription' });
  };

  return AgentAction;
};