// src/models/transcription.js
module.exports = (sequelize, DataTypes) => {
  const Transcription = sequelize.define('Transcription', {
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
    audioPath: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    originalFileName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    fileSizeKB: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    durationSeconds: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    transcriptionText: {
      type: DataTypes.TEXT,
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
  }, {
    tableName: 'transcriptions',
    timestamps: true,
  });

  Transcription.associate = (models) => {
    Transcription.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    Transcription.hasMany(models.AgentAction, { foreignKey: 'transcriptionId', as: 'agentActions' }); // Nova associação
  };

  return Transcription;
};