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

    // <<< NOVO: Para a "Base de conhecimento" >>>
    knowledgeBase: {
      type: DataTypes.JSONB,
      defaultValue: {
        files: [], // Array para armazenar o CONTEÚDO de texto dos arquivos
        websites: [], // (Futuro)
        text: '', // (Futuro)
      },
      allowNull: false,
    },
    
    // <<< MODIFICADO: Campo já existia, mas agora é preenchido pela UI >>>
    // Aba: Configurações
    runConfiguration: {
      type: DataTypes.JSONB,
      defaultValue: {
        temperature: 1,
        top_p: 1,
        max_completion_tokens: 2048,
      },
      allowNull: false,
    },

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

    // Campo legado da API de Assistentes, pode ser mantido ou removido.
    // Manter por enquanto pode ser útil se a estratégia 'DINAMICO' for ativada.
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