const jwt = require('jsonwebtoken');
const db = require('../db');
const { PRESETS } = require('../constants/permissions');

const JWT_SECRET = process.env.JWT_SECRET || 'flotex-ims-secret-change-in-production';

/**
 * Middleware: verifies JWT from 'Authorization: Bearer <token>' header.
 * If missing or invalid, responds with 401 Unauthorized.
 * On success, loads user from DB (or uses decoded + preset) and sets req.user = { id, role, permissions }.
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
    const userId = decoded.userId;
    const role = decoded.role;

    try {
      const row = db.prepare('SELECT id, role, permissions FROM users WHERE id = ?').get(userId);
      if (row) {
        let permissions = [];
        try {
          permissions = JSON.parse(row.permissions || '[]');
        } catch (_) {}
        req.user = { id: row.id, role: row.role, permissions: Array.isArray(permissions) ? permissions : [] };
        return next();
      }
    } catch (_) {}

    // User not in DB (e.g. env admin or legacy): use preset by role
    const preset = PRESETS[role] || PRESETS.VIEWER || [];
    req.user = { id: userId, role: role || 'VIEWER', permissions: Array.isArray(preset) ? preset : [] };
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

/**
 * Returns middleware that allows only if req.user has the required permission.
 * Use after verifyToken. If req.user.permissions does not include requiredPerm, responds with 403.
 * @param {string} requiredPerm - Permission string (e.g. 'shipments.view')
 */
function hasPermission(requiredPerm) {
  return (req, res, next) => {
    const permissions = req.user && Array.isArray(req.user.permissions) ? req.user.permissions : [];
    if (!requiredPerm || !permissions.includes(requiredPerm)) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions for this action.' });
    }
    next();
  };
}

/**
 * Returns middleware that allows only the given roles.
 * Use after verifyToken. If req.user.role is not in allowedRoles, responds with 403.
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

module.exports = { verifyToken, requireRole, hasPermission, JWT_SECRET };
