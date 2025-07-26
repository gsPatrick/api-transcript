const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN; // Ex: '1d', '8h'

if (!JWT_SECRET) {
  console.error('Erro: JWT_SECRET não definido nas variáveis de ambiente!');
  process.exit(1); // Encerra a aplicação se a chave secreta não estiver definida
}

const cryptoUtils = {
  /**
   * Gera um hash para a senha fornecida.
   * @param {string} password - A senha em texto puro.
   * @returns {Promise<string>} O hash da senha.
   */
  hashPassword: async (password) => {
    const salt = await bcrypt.genSalt(10); // Custo de 10 é um bom equilíbrio
    return bcrypt.hash(password, salt);
  },

  /**
   * Compara uma senha em texto puro com um hash.
   * @param {string} password - A senha em texto puro.
   * @param {string} hash - O hash da senha armazenado.
   * @returns {Promise<boolean>} True se as senhas coincidirem, false caso contrário.
   */
  comparePassword: async (password, hash) => {
    return bcrypt.compare(password, hash);
  },

  /**
   * Gera um JSON Web Token (JWT) para o payload fornecido.
   * @param {object} payload - Os dados a serem incluídos no token (ex: { userId: 'uuid', email: 'user@example.com' }).
   * @returns {string} O JWT assinado.
   */
  generateToken: (payload) => {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  },

  /**
   * Verifica e decodifica um JSON Web Token (JWT).
   * @param {string} token - O token JWT a ser verificado.
   * @returns {object|null} O payload decodificado se o token for válido, ou null caso contrário.
   */
  verifyToken: (token) => {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      console.error("Erro ao verificar token:", error.message);
      return null;
    }
  },
};

module.exports = cryptoUtils;