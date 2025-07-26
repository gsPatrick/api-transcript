const cryptoUtils = require('./crypto');

const authMiddleware = (req, res, next) => {
  // Obter o token do cabeçalho de autorização (Bearer Token)
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Acesso negado. Token não fornecido ou formato inválido.' });
  }

  const token = authHeader.split(' ')[1]; // Pega a segunda parte (o token em si)

  if (!token) {
    return res.status(401).json({ message: 'Acesso negado. Token não fornecido.' });
  }

  try {
    const decoded = cryptoUtils.verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ message: 'Token inválido ou expirado.' });
    }
    req.user = decoded; // Adiciona o payload do token ao objeto de requisição
    next(); // Continua para a próxima função middleware/rota
  } catch (error) {
    return res.status(401).json({ message: 'Token inválido.', error: error.message });
  }


};

module.exports = authMiddleware;