const MAX_ID_LENGTH = 128;
const SAFE_ID_REGEX = /^[a-zA-Z0-9_\-\.]+$/;
const { verifyToken, JWT_SECRET } = require('./middleware/auth');

function validateId(id, label) {
  if (id == null || typeof id !== 'string') return { valid: false, message: (label || 'ID') + ' is required' };
  const trimmed = id.trim();
  if (trimmed === '' || trimmed === 'undefined' || trimmed === 'null') return { valid: false, message: 'Invalid ' + (label || 'ID') };
  if (trimmed.length > MAX_ID_LENGTH) return { valid: false, message: (label || 'ID') + ' too long' };
  if (trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) return { valid: false, message: (label || 'ID') + ' contains invalid characters' };
  if (!SAFE_ID_REGEX.test(trimmed)) return { valid: false, message: (label || 'ID') + ' contains invalid characters' };
  return { valid: true, value: trimmed };
}

module.exports = { validateId, verifyToken, JWT_SECRET };
