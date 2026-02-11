const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'flotex-ims-secret-change-in-production';

/**
 * Middleware: verifies JWT from 'Authorization: Bearer <token>' header.
 * If missing or invalid, responds with 401 Unauthorized.
 * On success, sets req.user = { userId, role } and calls next().
 */
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Authorization required' });
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    return res.status(401).json({ success: false, error: 'Authorization required' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = { userId: decoded.userId, role: decoded.role };
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

/**
 * Returns middleware that allows only the given roles.
 * Use after verifyToken. If req.user.role is not in allowedRoles, responds with 403 Forbidden.
 * @param {...string} allowedRoles - One or more role names (e.g. 'MANAGEMENT', 'CHECKER')
 */
function requireRole(...allowedRoles) {
  const set = new Set(allowedRoles.map((r) => String(r).toUpperCase()));
  return (req, res, next) => {
    const role = req.user && req.user.role ? String(req.user.role).toUpperCase() : '';
    if (!set.has(role)) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions for this action.' });
    }
    next();
  };
}

module.exports = { verifyToken, requireRole, JWT_SECRET };
