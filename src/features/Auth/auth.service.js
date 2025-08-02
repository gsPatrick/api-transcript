// src/features/Auth/auth.service.js

const db = require('../../config/database');
const cryptoUtils = require('../../utils/crypto');
const User = db.User;

const authService = {
async registerUser(name, email, password, role) { 
    try {
      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        throw new Error('Usuário com este e-mail já existe.');
      }

      const hashedPassword = await cryptoUtils.hashPassword(password);

      const newUser = await User.create({
        name,
        email,
        password: hashedPassword,
        // Adicione a role aqui. Se 'role' for undefined, o Sequelize usará o default 'user'.
        // Se 'role' for 'admin', ele usará 'admin'.
        role: role || 'user', // Garante que a role seja 'user' se não for fornecida
      });

      // ... (restante do código permanece inalterado, pois o tokenPayload já inclui newUser.role)
      const tokenPayload = {
        userId: newUser.id,
        email: newUser.email,
        role: newUser.role, 
      };
      const token = cryptoUtils.generateToken(tokenPayload);

      const userResponse = {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
      };

      return { user: userResponse, token };

    } catch (error) {
      console.error('Erro no serviço de registro:', error.message);
      throw error;
    }
  },

  async loginUser(email, password) {
    try {
      const user = await User.findOne({ where: { email } });
      if (!user) {
        throw new Error('Credenciais inválidas. E-mail não encontrado.');
      }

      const isMatch = await cryptoUtils.comparePassword(password, user.password);
      if (!isMatch) {
        throw new Error('Credenciais inválidas. Senha incorreta.');
      }

      // --- CORREÇÃO APLICADA AQUI ---
      // Adiciona a 'role' do usuário ao payload do token JWT.
      const tokenPayload = {
        userId: user.id,
        email: user.email,
        role: user.role, // <<< ADICIONADO
      };
      const token = cryptoUtils.generateToken(tokenPayload);

      // Retorna o usuário sem a senha, mas com a role para o frontend saber.
      const userResponse = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      };

      return { user: userResponse, token };

    } catch (error) {
      console.error('Erro no serviço de login:', error.message);
      throw error;
    }
  },
};

module.exports = authService;