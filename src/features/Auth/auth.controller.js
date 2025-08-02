const authService = require('./auth.service');

const authController = {
 async register(req, res) {
    // Adicione 'role' à desestruturação
    const { name, email, password, role } = req.body; 

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Nome, e-mail e senha são obrigatórios.' });
    }

    // Opcional: Adicione validação para a role (se permitindo apenas 'user' ou 'admin')
    if (role && !['user', 'admin'].includes(role)) {
      return res.status(400).json({ message: 'Role inválida. As roles permitidas são "user" ou "admin".' });
    }

    try {
      // Passe 'role' para o serviço
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
      // Erros específicos do serviço (ex: credenciais inválidas)
      if (error.message.includes('Credenciais inválidas')) {
        return res.status(401).json({ message: error.message });
      }
      // Outros erros internos
      console.error('Erro ao fazer login:', error);
      return res.status(500).json({ message: 'Erro interno do servidor ao fazer login.' });
    }
  },

  // Exemplo de rota protegida para testar o middleware
  async protectedRoute(req, res) {
    // req.user contém o payload do token decodificado
    return res.status(200).json({
      message: 'Você acessou uma rota protegida!',
      userData: req.user,
      serverTime: new Date().toISOString()
    });
  },
};

module.exports = authController;