// src/features/User/user.service.js
const db = require('../../config/database');
const cryptoUtils = require('../../utils/crypto'); // Para hashing de senha
const transcriptionService = require('../Transcription/transcription.service'); // Para obter uso do plano
const { User, Plan } = db;

const userService = {
  /**
   * Obtém o perfil de um usuário.
   * @param {string} userId - ID do usuário.
   * @returns {object} Dados do usuário (sem senha).
   */
  async getUserProfile(userId) {
    try {
      const user = await User.findByPk(userId, {
        attributes: { exclude: ['password'] }, // Nunca retornar a senha
      });
      if (!user) {
        throw new Error('Usuário não encontrado.');
      }
      return user;
    } catch (error) {
      console.error('Erro ao obter perfil do usuário:', error);
      throw error;
    }
  },

  /**
   * Atualiza o perfil de um usuário.
   * @param {string} userId - ID do usuário.
   * @param {object} updateData - Dados para atualização (name, email, password).
   * @returns {object} Dados do usuário atualizados (sem senha).
   */
  async updateUserProfile(userId, updateData) {
    try {
      const user = await User.findByPk(userId);
      if (!user) {
        throw new Error('Usuário não encontrado.');
      }

      // Atualiza nome e e-mail se fornecidos
      if (updateData.name) {
        user.name = updateData.name;
      }
      if (updateData.email && updateData.email !== user.email) {
        // Verifica se o novo e-mail já existe
        const existingUserWithEmail = await User.findOne({ where: { email: updateData.email } });
        if (existingUserWithEmail) {
          throw new Error('Este e-mail já está em uso por outro usuário.');
        }
        user.email = updateData.email;
      }

      // Atualiza a senha se fornecida
      if (updateData.password) {
        user.password = await cryptoUtils.hashPassword(updateData.password);
      }

      await user.save();

      // Retorna o usuário sem a senha
      const updatedUser = user.toJSON();
      delete updatedUser.password;
      return updatedUser;
    } catch (error) {
      console.error('Erro ao atualizar perfil do usuário:', error);
      throw error;
    }
  },

  /**
   * Permite ao usuário atualizar sua chave da OpenAI.
   * @param {string} userId - ID do usuário.
   * @param {string} apiKey - A nova chave da OpenAI.
   */
  async updateUserOpenAiApiKey(userId, apiKey) {
    try {
      const user = await User.findByPk(userId);
      if (!user) throw new Error('Usuário não encontrado.');

      await user.update({ openAiApiKey: apiKey });
      return { message: 'Chave da OpenAI atualizada com sucesso.' };
    } catch (error) {
      console.error('Erro ao atualizar chave da OpenAI do usuário:', error);
      throw error;
    }
  },

  /**
   * Permite ao usuário remover sua chave da OpenAI.
   * @param {string} userId - ID do usuário.
   */
  async removeUserOpenAiApiKey(userId) {
    try {
      const user = await User.findByPk(userId);
      if (!user) throw new Error('Usuário não encontrado.');

      await user.update({ openAiApiKey: null });
      return { message: 'Chave da OpenAI removida com sucesso.' };
    } catch (error) {
      console.error('Erro ao remover chave da OpenAI do usuário:', error);
      throw error;
    }
  },

  /**
   * Lista todos os planos disponíveis para visualização.
   * @returns {Array<object>} Lista de planos.
   */
  async getAvailablePlans() {
    try {
      const plans = await Plan.findAll({
        attributes: { exclude: ['createdAt', 'updatedAt'] }, // Excluir metadados se não forem relevantes para o cliente
        order: [['price', 'ASC']], // Ordenar por preço, por exemplo
      });
      return plans;
    } catch (error) {
      console.error('Erro ao listar planos disponíveis:', error);
      throw error;
    }
  },

  /**
   * Obtém o plano ativo do usuário e suas estatísticas de uso.
   * Reutiliza a função do serviço de transcrição, pois ela já faz esse cálculo.
   * @param {string} userId - ID do usuário.
   * @returns {object} Informações do plano e uso atual.
   */
  async getUserPlanAndUsage(userId) {
    try {
      // Delega para o transcriptionService que já tem a lógica de consumo
      const usageData = await transcriptionService.getUserPlanUsage(userId);
      return usageData;
    } catch (error) {
      console.error('Erro ao obter plano e uso do usuário:', error);
      throw error;
    }
  },
};

module.exports = userService;