const db = require('../../config/database');
const cryptoUtils = require('../../utils/crypto');
const User = db.User;

const authService = {
  async registerUser(name, email, password) {
    try {
      // 1. Verificar se o usuário já existe
      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        throw new Error('Usuário com este e-mail já existe.');
      }

      // 2. Hash da senha
      const hashedPassword = await cryptoUtils.hashPassword(password);

      // 3. Criar o usuário no banco de dados
      const newUser = await User.create({
        name,
        email,
        password: hashedPassword,
      });

      // 4. Gerar token de autenticação
      const token = cryptoUtils.generateToken({
        userId: newUser.id,
        email: newUser.email,
      });

      // Retorna o usuário criado e o token
      return { user: { id: newUser.id, name: newUser.name, email: newUser.email }, token };

    } catch (error) {
      console.error('Erro no serviço de registro:', error.message);
      throw error; // Propaga o erro para o controller
    }
  },

  async loginUser(email, password) {
    try {
      // 1. Encontrar o usuário pelo e-mail
      const user = await User.findOne({ where: { email } });
      if (!user) {
        throw new Error('Credenciais inválidas. E-mail não encontrado.');
      }

      // 2. Comparar a senha fornecida com o hash armazenado
      const isMatch = await cryptoUtils.comparePassword(password, user.password);
      if (!isMatch) {
        throw new Error('Credenciais inválidas. Senha incorreta.');
      }

      // 3. Gerar token de autenticação
      const token = cryptoUtils.generateToken({
        userId: user.id,
        email: user.email,
      });

      // Retorna o usuário logado e o token
      return { user: { id: user.id, name: user.name, email: user.email }, token };

    } catch (error) {
      console.error('Erro no serviço de login:', error.message);
      throw error; // Propaga o erro para o controller
    }
  },
};

module.exports = authService;