const jwt = require('jsonwebtoken');
const MAX_ID_LENGTH = 128;
const SAFE_ID_REGEX = /^[a-zA-Z0-9_\-\.]+$/;
const JWT_SECRET = process.env.JWT_SECRET || 'flotex-ims-secret-change-in-production';

function validateId(id, label) {
  if (id == null || typeof id !== 'string') return { valid: false, message: (label || 'ID') + ' is required' };
  const trimmed = id.trim();
  if (trimmed === '' || trimmed === 'undefined' || trimmed === 'null') return { valid: false, message: 'Invalid ' + (label || 'ID') };
  if (trimmed.length > MAX_ID_LENGTH) return { valid: false, message: (label || 'ID') + ' too long' };
  if (trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) return { valid: false, message: (label || 'ID') + ' contains invalid characters' };
  if (!SAFE_ID_REGEX.test(trimmed)) return { valid: false, message: (label || 'ID') + ' contains invalid characters' };
  return { valid: true, value: trimmed };
}

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Authorization required' });
  }
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = { userId: decoded.userId, role: decoded.role };
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

module.exports = { validateId, verifyToken, JWT_SECRET };
