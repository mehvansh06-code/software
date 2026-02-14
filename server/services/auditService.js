/**
 * Central audit logging. Writes to audit_logs (userId, action, targetId, details).
 * Use from routes after successful mutations.
 */

function log(db, userId, action, targetId, details) {
  if (!db) return;
  try {
    const detailsStr = details != null && typeof details === 'object' ? JSON.stringify(details) : (details == null ? null : String(details));
    db.prepare(
      'INSERT INTO audit_logs (userId, action, targetId, details, timestamp) VALUES (?, ?, ?, ?, datetime(\'now\'))'
    ).run(userId || 'system', action, targetId || null, detailsStr);
  } catch (e) {
    console.warn('Audit log insert failed:', e.message);
  }
}

function getUserName(db, userId) {
  if (!db || !userId) return null;
  try {
    const row = db.prepare('SELECT name FROM users WHERE id = ?').get(userId);
    return row && row.name ? row.name : null;
  } catch (_) {
    return null;
  }
}

module.exports = { log, getUserName };
