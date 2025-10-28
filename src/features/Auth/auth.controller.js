// src/features/Auth/auth.controller.js
const authService = require('./auth.service');

const authController = {
  async register(req, res) {
    const { name, email, password, role } = req.body; 

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Nome, e-mail e senha são obrigatórios.' });
    }

    if (role && !['user', 'admin'].includes(role)) {
      return res.status(400).json({ message: 'Role inválida. As roles permitidas são "user" ou "admin".' });
    }

    try {
      const { user, token } = await authService.registerUser(name, email, password, role); 
      return res.status(201).json({ message: 'Usuário registrado com sucesso!', user, token });
    } catch (error) {
      if (error.message.includes('Usuário com este e-mail já existe.')) {
        return res.status(409).json({ message: error.message });
      }
      console.error('Erro ao registrar usuário:', error);
      return res.status(500).json({ message: 'Erro interno do servidor ao registrar usuário.' });
    }
  },

  async login(req, res) {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'E-mail e senha são obrigatórios.' });
    }

    try {
      const { user, token } = await authService.loginUser(email, password);
      return res.status(200).json({ message: 'Login realizado com sucesso!', user, token });
    } catch (error) {
      if (error.message.includes('Credenciais inválidas')) {
        return res.status(401).json({ message: error.message });
      }
      console.error('Erro ao fazer login:', error);
      return res.status(500).json({ message: 'Erro interno do servidor ao fazer login.' });
    }
  },
  
  // <<< NOVOS MÉTODOS PARA REDEFINIÇÃO DE SENHA >>>
  async forgotPassword(req, res, next) {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'O e-mail é obrigatório.' });
    }

    try {
      await authService.handleForgotPassword(email);
      // Por segurança, sempre retorne sucesso para não revelar se um e-mail existe no banco
      return res.status(200).json({ message: 'Se um usuário com este e-mail existir, um link de redefinição de senha foi enviado.' });
    } catch (error) {
      next(error);
    }
  },

  async resetPassword(req, res, next) {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ message: 'O token e a nova senha são obrigatórios.' });
    }

    try {
      await authService.handleResetPassword(token, newPassword);
      return res.status(200).json({ message: 'Sua senha foi redefinida com sucesso.' });
    } catch (error) {
      if (error.message.includes('inválido ou expirado')) {
        return res.status(400).json({ message: error.message });
      }
      next(error);
    }
  },
  // <<< FIM DOS NOVOS MÉTODOS >>>

  async protectedRoute(req, res) {
    return res.status(200).json({
      message: 'Você acessou uma rota protegida!',
      userData: req.user,
      serverTime: new Date().toISOString()
    });
  },
};

module.exports = authController;