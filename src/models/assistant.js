// src/models/assistant.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Assistant = sequelize.define('Assistant', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    
    // Aba: Personalidade
    name: { type: DataTypes.STRING, allowNull: false },
    instructions: { type: DataTypes.TEXT, allowNull: false }, // O "PROMPT" da UI
    model: { type: DataTypes.STRING, allowNull: false },

    // <<< NOVO: Para a "Estratégia do modelo" >>>
    executionMode: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'FIXO', // 'FIXO' ou 'DINAMICO'
    },

    // <<< MODIFICADO: knowledgeBase agora armazena IDs de arquivos e Vector Store >>>
    knowledgeBase: {
      type: DataTypes.JSONB,
      defaultValue: {
        openaiFileIds: [], // Array para armazenar IDs de File Objects da OpenAI
      },
      allowNull: false,
    },
    
    // <<< NOVO: ID do Vector Store da OpenAI associado a este Assistente >>>
    openaiVectorStoreId: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true, // Garante que cada Vector Store é único por Assistente
    },

    // <<< MODIFICADO: Campo já existia, mas agora é preenchido pela UI e usado para Runs >>>
    // Aba: Configurações - parâmetros para o Run object da OpenAI
    runConfiguration: {
      type: DataTypes.JSONB,
      defaultValue: {
        temperature: 1,
        top_p: 1,
        max_completion_tokens: 2048,
        // (Futuro) Outros parâmetros como max_prompt_tokens, truncation_strategy
      },
      allowNull: false,
    },

    // --- Campos de Controle e Permissão ---
    outputFormat: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'text', // 'text' ou 'pdf' - usado como default para o usuário
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

    // Campo legado da API de Assistentes, agora será o ID real da OpenAI
    openaiAssistantId: { type: DataTypes.STRING, allowNull: true, unique: true },

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
    Assistant.hasMany(models.AssistantHistory, { foreignKey: 'assistantId', as: 'history' });
  };

  return Assistant;
};