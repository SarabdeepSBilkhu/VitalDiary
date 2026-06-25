const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || '5fa886b2925e167df6a334b148143d8618f47b29184e98271046f8d0273fcf3e';

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
