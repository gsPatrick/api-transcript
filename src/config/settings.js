// src/config/settings.js
const db = require('./database'); // Importa a instância do DB
const { Setting } = db; // Importa o modelo Setting

const configCache = {}; // Cache em memória para as configurações
let settingsLoaded = false;

const settingsManager = {
  /**
   * Carrega as configurações do banco de dados para o cache.
   * Deve ser chamado uma vez na inicialização da aplicação.
   */
  async loadSettingsFromDb() {
    if (settingsLoaded) return; // Carrega apenas uma vez na inicialização
    try {
      const settings = await Setting.findAll();
      settings.forEach(setting => {
        configCache[setting.key] = setting.value;
      });
      settingsLoaded = true;
      console.log('Configurações carregadas do banco de dados.');
    } catch (error) {
      console.error('Erro ao carregar configurações do banco de dados:', error);
      // Em caso de erro, a aplicação pode tentar continuar usando .env
    }
  },

  /**
   * Obtém o valor de uma configuração. Prioriza .env, depois cache, depois DB.
   * @param {string} key - A chave da configuração.
   * @returns {string|null} O valor da configuração.
   */
  get(key) {
    // Prioriza variáveis de ambiente (útil para desenvolvimento ou chaves críticas)
    if (process.env[key]) {
      return process.env[key];
    }
    // Retorna do cache se existir
    if (configCache[key] !== undefined) {
      return configCache[key];
    }
    // Se não estiver no cache e já tentamos carregar do DB, retorna null
    if (settingsLoaded) {
      return null;
    }
    // Se ainda não carregamos do DB, isso é um problema de timing.
    // Em produção, loadSettingsFromDb deve ser chamado antes de qualquer get().
    console.warn(`Configuração "${key}" não encontrada no cache e settings ainda não foram carregadas completamente.`);
    return null;
  },

  /**
   * Atualiza uma configuração no banco de dados e no cache.
   * @param {string} key - A chave da configuração.
   * @param {string} value - O novo valor da configuração.
   * @param {string} [description] - Descrição opcional.
   * @param {boolean} [isSensitive] - Se o valor é sensível.
   */
  async update(key, value, description = null, isSensitive = false) {
    try {
      const [setting, created] = await Setting.findOrCreate({
        where: { key },
        defaults: { value, description, isSensitive },
      });

      if (!created) {
        setting.value = value;
        if (description !== null) setting.description = description;
        setting.isSensitive = isSensitive;
        await setting.save();
      }

      configCache[key] = value; // Atualiza o cache
      console.log(`Configuração "${key}" atualizada.`);
      return setting;
    } catch (error) {
      console.error(`Erro ao atualizar configuração "${key}":`, error);
      throw error;
    }
  },

  /**
   * Lista todas as configurações (para admin).
   * @returns {Array<object>} Lista de configurações.
   */
  async listAll() {
    try {
      const settings = await Setting.findAll();
      // Oculta valores sensíveis para a exibição (apenas mostra se é sensível)
      return settings.map(s => ({
        key: s.key,
        value: s.isSensitive ? '********' : s.value,
        description: s.description,
        isSensitive: s.isSensitive,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }));
    } catch (error) {
      console.error('Erro ao listar configurações:', error);
      throw error;
    }
  },

  /**
   * Inicializa as configurações padrão se não existirem no DB.
   * @param {Array<object>} defaultSettings - Array de objetos { key, value, description, isSensitive }.
   */
  async initializeDefaultSettings(defaultSettings) {
    for (const setting of defaultSettings) {
      const existingSetting = await Setting.findByPk(setting.key);
      if (!existingSetting) {
        await Setting.create(setting);
        configCache[setting.key] = setting.value; // Adiciona ao cache
        console.log(`Configuração padrão "${setting.key}" inicializada.`);
      } else {
        configCache[setting.key] = existingSetting.value; // Garante que o cache tem o valor do DB
      }
    }
  },
};

module.exports = settingsManager;