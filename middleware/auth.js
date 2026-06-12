const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'vitaldiary_fallback_secret_key_123';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer <token>"

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified; // Should contain user id (e.g. req.user.id)
    next();
  } catch (err) {
    res.status(403).json({ error: 'Invalid or expired token.' });
  }
}

module.exports = authenticateToken;
