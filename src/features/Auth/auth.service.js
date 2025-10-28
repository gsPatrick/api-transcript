// src/features/Auth/auth.service.js
const crypto = require('crypto');
const { Op } = require('sequelize');
const db = require('../../config/database');
const cryptoUtils = require('../../utils/crypto');
const emailService = require('../../lib/email.service'); // Serviço que criaremos
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
        role: role || 'user',
      });

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

      const tokenPayload = {
        userId: user.id,
        email: user.email,
        role: user.role,
      };
      const token = cryptoUtils.generateToken(tokenPayload);

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

  // <<< INÍCIO DA NOVA LÓGICA DE REDEFINIÇÃO DE SENHA >>>
  async handleForgotPassword(email) {
    const user = await User.findOne({ where: { email } });
    
    // Se o usuário não existir, não fazemos nada, mas não retornamos erro.
    if (!user) {
      console.log(`Solicitação de redefinição de senha para e-mail não existente: ${email}`);
      return;
    }

    // 1. Gerar um token aleatório e seguro
    const resetToken = crypto.randomBytes(32).toString('hex');

    // 2. Hashear o token antes de salvar no banco de dados (segurança)
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    // 3. Definir a data de expiração (e.g., 1 hora)
    const expires = new Date();
    expires.setHours(expires.getHours() + 1);

    // 4. Salvar o token hasheado e a data de expiração no usuário
    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = expires;
    await user.save();

    // 5. Enviar o e-mail com o token NÃO-hasheado para o usuário
    try {
      await emailService.sendPasswordResetEmail(user.email, resetToken);
      console.log(`E-mail de redefinição de senha enviado para ${user.email}`);
    } catch (error) {
      console.error(`Falha ao enviar e-mail de redefinição para ${user.email}:`, error);
      // Mesmo com falha no e-mail, não lançamos o erro para não expor a existência do usuário.
      // A falha será logada no servidor.
    }
  },

  async handleResetPassword(token, newPassword) {
    // 1. Hashear o token recebido do usuário para comparar com o do banco
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // 2. Encontrar o usuário com o token válido e que não tenha expirado
    const user = await User.findOne({
      where: {
        resetPasswordToken: hashedToken,
        resetPasswordExpires: { [Op.gt]: new Date() }, // Op.gt significa "greater than" (maior que)
      },
    });

    if (!user) {
      throw new Error('Token de redefinição de senha inválido ou expirado.');
    }

    // 3. Se o token for válido, redefinir a senha
    user.password = await cryptoUtils.hashPassword(newPassword);
    
    // 4. Limpar os campos de redefinição para que o token não possa ser reutilizado
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    
    await user.save();

    console.log(`Senha do usuário ${user.email} redefinida com sucesso.`);
    // Opcional: Enviar um e-mail de confirmação de que a senha foi alterada.
  },
  // <<< FIM DA NOVA LÓGICA >>>
};

module.exports = authService;