// src/models/assistant.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Assistant = sequelize.define('Assistant', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    
    // --- Configurações do Assistente (UI) ---
    name: { type: DataTypes.STRING, allowNull: false },
    instructions: { type: DataTypes.TEXT, allowNull: false }, // O "PROMPT FIXO"
    model: { type: DataTypes.STRING, allowNull: false, defaultValue: 'gpt-4o' },

    // Estratégia de execução (preparando para o futuro)
    executionMode: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'FIXO', // 'FIXO' ou 'DINAMICO'
    },

    // Armazena IDs de arquivos para associar ao Vector Store
    knowledgeBase: {
      type: DataTypes.JSONB,
      defaultValue: {
        openaiFileIds: [], // Array para armazenar IDs de File Objects da OpenAI
      },
      allowNull: false,
    },
    
    // Parâmetros para a execução (Run) da OpenAI
    runConfiguration: {
      type: DataTypes.JSONB,
      defaultValue: {
        temperature: 1,
        top_p: 1,
        // max_completion_tokens é um parâmetro do Run, não da criação do assistente
      },
      allowNull: false,
    },

    // --- IDs da OpenAI ---
    openaiAssistantId: { type: DataTypes.STRING, allowNull: true, unique: true },
    openaiVectorStoreId: { type: DataTypes.STRING, allowNull: true, unique: true },

    // --- Campos de Controle e Permissão ---
    outputFormat: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'text', // 'text' ou 'pdf'
    },
    isSystemAssistant: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    planSpecific: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    allowedPlanIds: {
      type: DataTypes.JSONB,
      defaultValue: [],
      allowNull: false
    },
    requiresUserOpenAiToken: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    createdByUserId: {
      type: DataTypes.UUID,
      allowNull: true, 
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL'
    },
  }, {
    tableName: 'assistants',
    timestamps: true,
  });

  Assistant.associate = (models) => {
    Assistant.belongsTo(models.User, { foreignKey: 'createdByUserId', as: 'creator' });
    Assistant.belongsToMany(models.Plan, {
      through: 'AssistantPlans',
      foreignKey: 'assistantId',
      as: 'allowedPlans'
    });
    // A relação com o histórico de execuções
    Assistant.hasMany(models.AssistantHistory, { foreignKey: 'assistantId', as: 'history' });
  };

  return Assistant;
};