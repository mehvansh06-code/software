/**
 * Permission system migration.
 * - Ensures users table exists (id, username, passwordHash, name, role, permissions).
 * - Adds permissions column if missing.
 * - Creates audit_logs table.
 * - Backfills permissions from PRESETS by role for users with empty permissions.
 * Run on server startup (required from db.js).
 */

const bcrypt = require('bcrypt');
const { PRESETS } = require('../constants/permissions');

const FALLBACK_USERS = [
  { id: '1', username: 'director', name: 'J P Tosniwal', role: 'MANAGEMENT' },
  { id: '2', username: 'checker', name: 'Sarah Accountant', role: 'CHECKER' },
  { id: '3', username: 'employee', name: 'Rahul Sharma', role: 'EXECUTIONER' },
];
const FALLBACK_PASSWORD_HASH = bcrypt.hashSync('admin123', 10);

function runPermissionMigration(db) {
  // 1) Create users table if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'VIEWER',
      permissions TEXT NOT NULL DEFAULT '[]',
      allowedDomains TEXT DEFAULT '[]'
    )
  `);

  // 2) Add permissions column if missing (existing users table from another migration)
  try {
    db.exec(`ALTER TABLE users ADD COLUMN permissions TEXT NOT NULL DEFAULT '[]'`);
  } catch (e) {
    if (!/duplicate column name|already exists/i.test(e.message)) throw e;
  }

  // 2b) Add allowedDomains: JSON array of domain ids (IMPORT, EXPORT, LICENCE, SALES_INDENT, INSURANCE). Empty/null = all domains.
  try {
    db.exec(`ALTER TABLE users ADD COLUMN allowedDomains TEXT DEFAULT '[]'`);
  } catch (e) {
    if (!/duplicate column name|already exists/i.test(e.message)) throw e;
  }
  // Verify column is readable (some SQLite builds may need reconnect)
  try {
    db.prepare('SELECT id, allowedDomains FROM users LIMIT 1').get();
  } catch (e) {
    console.warn('allowedDomains column check failed:', e.message);
  }

  // 3) Create audit_logs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT NOT NULL,
      action TEXT NOT NULL,
      targetId TEXT,
      details TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // 4) Seed users if table is empty (so login works with DB)
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (userCount === 0) {
    const ins = db.prepare(
      'INSERT INTO users (id, username, passwordHash, name, role, permissions, allowedDomains) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const allDomains = JSON.stringify(['IMPORT', 'EXPORT', 'LICENCE', 'SALES_INDENT', 'INSURANCE']);
    for (const u of FALLBACK_USERS) {
      const perms = PRESETS[u.role] || PRESETS.VIEWER;
      ins.run(u.id, u.username, FALLBACK_PASSWORD_HASH, u.name, u.role, JSON.stringify(perms), allDomains);
    }
  }

  // 5) Backfill: users with empty permissions get preset by role
  const users = db.prepare('SELECT id, role, permissions, allowedDomains FROM users').all();
  const updatePerms = db.prepare('UPDATE users SET permissions = ? WHERE id = ?');
  const allDomainsJson = JSON.stringify(['IMPORT', 'EXPORT', 'LICENCE', 'SALES_INDENT', 'INSURANCE']);
  const legacyFullDomains = ['IMPORT', 'EXPORT', 'LICENCE', 'SALES_INDENT'];
  const updateDomains = db.prepare('UPDATE users SET allowedDomains = ? WHERE id = ?');
  for (const u of users) {
    let perms = [];
    try {
      if (u.permissions && u.permissions.trim() !== '' && u.permissions !== '[]') {
        perms = JSON.parse(u.permissions);
      }
    } catch (_) {}
    if (!Array.isArray(perms) || perms.length === 0) {
      const preset = PRESETS[u.role] || PRESETS.VIEWER;
      updatePerms.run(JSON.stringify(preset), u.id);
    } else if (String(u.role || '').toUpperCase() === 'MANAGEMENT') {
      const preset = Array.isArray(PRESETS.MANAGEMENT) ? PRESETS.MANAGEMENT : [];
      const merged = Array.from(new Set([...(Array.isArray(perms) ? perms : []), ...preset]));
      if (merged.length !== perms.length) {
        updatePerms.run(JSON.stringify(merged), u.id);
      }
    }
    let domains = [];
    try {
      if (u.allowedDomains && String(u.allowedDomains).trim() !== '' && String(u.allowedDomains) !== '[]') {
        domains = JSON.parse(u.allowedDomains);
      }
    } catch (_) {}
    if (!Array.isArray(domains) || domains.length === 0) {
      updateDomains.run(allDomainsJson, u.id);
    } else {
      const hasLegacyFull = legacyFullDomains.every((d) => domains.includes(d));
      if (hasLegacyFull && !domains.includes('INSURANCE')) {
        updateDomains.run(JSON.stringify([...domains, 'INSURANCE']), u.id);
      }
    }
  }
}

module.exports = { runPermissionMigration };
