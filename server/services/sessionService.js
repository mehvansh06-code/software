const SESSION_IDLE_TIMEOUT_MINUTES = 60;
const SESSION_IDLE_TIMEOUT_MS = SESSION_IDLE_TIMEOUT_MINUTES * 60 * 1000;

function nowIso(nowMs = Date.now()) {
  return new Date(nowMs).toISOString();
}

function expiresIso(nowMs = Date.now()) {
  return new Date(nowMs + SESSION_IDLE_TIMEOUT_MS).toISOString();
}

function deleteExpiredSessions(db, nowMs = Date.now()) {
  const now = nowIso(nowMs);
  db.prepare('DELETE FROM user_sessions WHERE expiresAt <= ?').run(now);
}

function getSessionByUser(db, userId) {
  return db.prepare('SELECT userId, sessionId, createdAt, lastActivityAt, expiresAt FROM user_sessions WHERE userId = ?').get(userId);
}

function startSession(db, userId, sessionId, nowMs = Date.now()) {
  if (!userId || !sessionId) {
    return { ok: false, code: 'INVALID_INPUT' };
  }
  deleteExpiredSessions(db, nowMs);
  const existing = getSessionByUser(db, userId);
  if (existing) {
    const expiryMs = Date.parse(existing.expiresAt || '');
    if (Number.isFinite(expiryMs) && expiryMs > nowMs) {
      return { ok: false, code: 'ALREADY_ACTIVE', activeSession: existing };
    }
    db.prepare('DELETE FROM user_sessions WHERE userId = ?').run(userId);
  }
  const createdAt = nowIso(nowMs);
  const expiresAt = expiresIso(nowMs);
  db.prepare(`
    INSERT INTO user_sessions (userId, sessionId, createdAt, lastActivityAt, expiresAt)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, sessionId, createdAt, createdAt, expiresAt);
  return { ok: true, createdAt, expiresAt };
}

function validateAndTouchSession(db, userId, sessionId, nowMs = Date.now()) {
  if (!userId || !sessionId) return { ok: false, code: 'INVALID_INPUT' };
  deleteExpiredSessions(db, nowMs);
  const row = getSessionByUser(db, userId);
  if (!row) return { ok: false, code: 'NO_ACTIVE_SESSION' };
  const expiryMs = Date.parse(row.expiresAt || '');
  if (!Number.isFinite(expiryMs) || expiryMs <= nowMs) {
    db.prepare('DELETE FROM user_sessions WHERE userId = ?').run(userId);
    return { ok: false, code: 'IDLE_TIMEOUT' };
  }
  if (String(row.sessionId) !== String(sessionId)) {
    return { ok: false, code: 'SESSION_MISMATCH' };
  }
  const lastActivityAt = nowIso(nowMs);
  const expiresAt = expiresIso(nowMs);
  db.prepare('UPDATE user_sessions SET lastActivityAt = ?, expiresAt = ? WHERE userId = ? AND sessionId = ?')
    .run(lastActivityAt, expiresAt, userId, sessionId);
  return { ok: true, lastActivityAt, expiresAt };
}

function endSession(db, userId, sessionId) {
  if (!userId) return;
  if (sessionId) {
    db.prepare('DELETE FROM user_sessions WHERE userId = ? AND sessionId = ?').run(userId, sessionId);
    return;
  }
  db.prepare('DELETE FROM user_sessions WHERE userId = ?').run(userId);
}

module.exports = {
  SESSION_IDLE_TIMEOUT_MINUTES,
  SESSION_IDLE_TIMEOUT_MS,
  deleteExpiredSessions,
  startSession,
  validateAndTouchSession,
  endSession,
};

