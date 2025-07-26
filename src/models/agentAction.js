// src/models/agentAction.js
module.exports = (sequelize, DataTypes) => {
  const AgentAction = sequelize.define('AgentAction', {
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
      onDelete: 'CASCADE',
    },
    agentId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'Agents',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT', // Não permite deletar um agente se ele foi usado
    },
    transcriptionId: { // Opcional: se o input for de uma transcrição existente
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'Transcriptions',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL', // Se a transcrição for deletada, o link vira null
    },
    inputText: { // O texto que foi passado para o agente (pode vir da transcrição ou de outro lugar)
      type: DataTypes.TEXT,
      allowNull: false,
    },
    outputText: { // O resultado da ação do agente
      type: DataTypes.TEXT,
      allowNull: true,
    },
    outputFormat: { // O formato de saída solicitado (text, pdf)
      type: DataTypes.ENUM('text', 'pdf'),
      allowNull: false,
    },
    outputFilePath: { // Caminho do arquivo gerado (se outputFormat for pdf)
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
    usedSystemToken: { // Indica se usou o token do sistema ou do usuário
      type: DataTypes.BOOLEAN,
      allowNull: false,
    },
    cost: { // Custo estimado da chamada à API (opcional, para controle financeiro)
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