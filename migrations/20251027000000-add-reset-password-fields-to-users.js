'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Ação a ser executada quando a migration rodar (adicionar as colunas)
    await queryInterface.addColumn('users', 'resetPasswordToken', {
      type: Sequelize.STRING,
      allowNull: true,
      after: 'lastAssistantCreationResetDate' // Opcional: posiciona a coluna no banco
    });

    await queryInterface.addColumn('users', 'resetPasswordExpires', {
      type: Sequelize.DATE,
      allowNull: true,
      after: 'resetPasswordToken' // Opcional: posiciona a coluna no banco
    });
  },

  async down (queryInterface, Sequelize) {
    // Ação a ser executada se precisarmos reverter a migration (remover as colunas)
    await queryInterface.removeColumn('users', 'resetPasswordToken');
    await queryInterface.removeColumn('users', 'resetPasswordExpires');
  }
};