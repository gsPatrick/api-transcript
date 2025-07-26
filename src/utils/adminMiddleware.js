const adminMiddleware = (req, res, next) => {
  // req.user é populado pelo authMiddleware
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Acesso negado. Requer privilégios de administrador.' });
  }
  next(); // Continua se o usuário for um admin
};

module.exports = adminMiddleware;