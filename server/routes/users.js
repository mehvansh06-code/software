const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const { validateId, hasPermission } = require('../middleware');
const { PRESETS, PERMISSIONS, ALL_PERMISSION_VALUES } = require('../constants/permissions');
const { log: auditLog } = require('../services/auditService');
const { endSession } = require('../services/sessionService');

const MANAGE_PERM = PERMISSIONS.USERS_MANAGE_PERMISSIONS;
const VALID_ALLOWED_DOMAINS = new Set(['IMPORT', 'EXPORT', 'LICENCE', 'SALES_INDENT']);
const VALID_PERMISSIONS = new Set(ALL_PERMISSION_VALUES || []);
const VALID_ROLES = new Set(['VIEWER', 'CHECKER', 'MANAGEMENT', 'EXECUTIONER']);
const MAX_ARRAY_ITEMS = 256;

function normalizeAllowedDomains(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const val = raw.trim().toUpperCase();
    if (!val || !VALID_ALLOWED_DOMAINS.has(val)) continue;
    if (!out.includes(val)) out.push(val);
    if (out.length >= MAX_ARRAY_ITEMS) break;
  }
  return out;
}

function normalizePermissions(input, fallback = []) {
  const source = Array.isArray(input) ? input : fallback;
  const out = [];
  for (const raw of source) {
    if (typeof raw !== 'string') continue;
    const val = raw.trim();
    if (!val || !VALID_PERMISSIONS.has(val)) continue;
    if (!out.includes(val)) out.push(val);
    if (out.length >= MAX_ARRAY_ITEMS) break;
  }
  return out;
}

function normalizeRole(input, fallback = 'VIEWER') {
  const role = typeof input === 'string' ? input.trim().toUpperCase() : '';
  if (VALID_ROLES.has(role)) return role;
  return fallback;
}

function createRouter() {
  const router = express.Router();

  /** List users (mask password). Requires users.view */
  router.get('/', hasPermission('users.view'), (req, res) => {
    try {
      const rows = db.prepare('SELECT id, username, name, role, permissions, allowedDomains FROM users ORDER BY username').all();
      res.json(rows.map((r) => ({
        id: r.id,
        username: r.username,
        name: r.name,
        role: r.role,
        permissions: (() => {
          try {
            return JSON.parse(r.permissions || '[]');
          } catch (_) {
            return [];
          }
        })(),
        allowedDomains: (() => {
          try {
            return JSON.parse(r.allowedDomains || '[]');
          } catch (_) {
            return [];
          }
        })(),
      })));
    } catch (e) {
      console.error('GET /users:', e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /** Create user. Hash password. Default permissions = preset of selected role. Requires users.create */
  router.post('/', hasPermission('users.create'), (req, res) => {
    const b = req.body || {};
    const username = typeof b.username === 'string' ? b.username.trim() : '';
    const password = b.password;
    const name = typeof b.name === 'string' ? b.name.trim() : b.username || '';
    const rawRole = typeof b.role === 'string' ? b.role.trim().toUpperCase() : '';
    if (rawRole && !VALID_ROLES.has(rawRole)) {
      return res.status(400).json({ success: false, error: 'Invalid role' });
    }
    const role = normalizeRole(b.role, 'VIEWER');
    const allowedDomains = normalizeAllowedDomains(b.allowedDomains);
    if (!username) return res.status(400).json({ success: false, error: 'Username required' });
    if (!password || String(password).length < 8) return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
    const id = b.id || 'u_' + Math.random().toString(36).slice(2, 11);
    const idCheck = validateId(id, 'User ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const permissions = normalizePermissions(b.permissions, PRESETS[role] || PRESETS.VIEWER || []);
    let passwordHash;
    try {
      passwordHash = bcrypt.hashSync(String(password), 10);
    } catch (e) {
      return res.status(500).json({ success: false, error: 'Failed to hash password' });
    }
    try {
      db.prepare(
        'INSERT INTO users (id, username, passwordHash, name, role, permissions, allowedDomains) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(idCheck.value, username, passwordHash, name, role, JSON.stringify(permissions), JSON.stringify(allowedDomains));
      const row = db.prepare('SELECT id, username, name, role, permissions, allowedDomains FROM users WHERE id = ?').get(idCheck.value);
      let perms = [];
      let domains = [];
      try {
        perms = JSON.parse(row.permissions || '[]');
      } catch (_) {}
      try {
        domains = JSON.parse(row.allowedDomains || '[]');
      } catch (_) {}
      const userId = req.user && req.user.id;
      auditLog(db, userId, 'USER_CREATED', idCheck.value, { username: row.username, name: row.name, role: row.role });
      res.status(201).json({
        id: row.id,
        username: row.username,
        name: row.name,
        role: row.role,
        permissions: perms,
        allowedDomains: domains,
      });
    } catch (e) {
      if (/UNIQUE constraint failed|SQLITE_CONSTRAINT/.test(e.message)) {
        return res.status(400).json({ success: false, error: 'Username already exists' });
      }
      console.error('POST /users:', e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /** Update user details (username, display name, role, allowedDomains; not password). Requires users.edit */
  router.put('/:id', hasPermission('users.edit'), (req, res) => {
    const idCheck = validateId(req.params?.id, 'User ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const b = req.body || {};
    const name = typeof b.name === 'string' ? b.name.trim() : undefined;
    const role = b.role === undefined ? undefined : normalizeRole(b.role, '');
    if (b.role !== undefined && !role) {
      return res.status(400).json({ success: false, error: 'Invalid role' });
    }
    const username = typeof b.username === 'string' ? b.username.trim() : undefined;
    const allowedDomains = Array.isArray(b.allowedDomains) ? normalizeAllowedDomains(b.allowedDomains) : undefined;
    const existing = db.prepare('SELECT id, username, name, role FROM users WHERE id = ?').get(idCheck.value);
    if (!existing) return res.status(404).json({ success: false, error: 'User not found' });
    const setClauses = [];
    const values = [];
    if (username !== undefined && username !== '') {
      setClauses.push('username = ?');
      values.push(username);
    }
    if (name !== undefined) {
      setClauses.push('name = ?');
      values.push(name);
    }
    const roleChanged = role !== undefined && String(role) !== String(existing.role || '');
    if (role !== undefined) {
      setClauses.push('role = ?');
      values.push(role);
      if (roleChanged) {
        // Keep role and permissions consistent when edited from User Management.
        const presetPerms = normalizePermissions(PRESETS[role] || PRESETS.VIEWER || [], PRESETS.VIEWER || []);
        setClauses.push('permissions = ?');
        values.push(JSON.stringify(presetPerms));
      }
    }
    if (allowedDomains !== undefined) {
      setClauses.push('allowedDomains = ?');
      values.push(JSON.stringify(allowedDomains));
    }
    if (setClauses.length === 0) {
      const row = db.prepare('SELECT id, username, name, role, permissions, allowedDomains FROM users WHERE id = ?').get(idCheck.value);
      let perms = [];
      let domains = [];
      try {
        perms = JSON.parse(row.permissions || '[]');
      } catch (_) {}
      try {
        domains = JSON.parse(row.allowedDomains || '[]');
      } catch (_) {}
      return res.json({
        id: row.id,
        username: row.username,
        name: row.name,
        role: row.role,
        permissions: perms,
        allowedDomains: domains,
      });
    }
    try {
      const runTx = db.transaction(() => {
        if (username !== undefined && username !== '') {
          const conflict = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, idCheck.value);
          if (conflict) throw new Error('USERNAME_IN_USE');
        }
        const sql = `UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`;
        values.push(idCheck.value);
        db.prepare(sql).run(...values);
      });
      runTx();
      const row = db.prepare('SELECT id, username, name, role, permissions, allowedDomains FROM users WHERE id = ?').get(idCheck.value);
      let perms = [];
      let domains = [];
      try {
        perms = JSON.parse(row.permissions || '[]');
      } catch (_) {}
      try {
        domains = JSON.parse(row.allowedDomains || '[]');
      } catch (_) {}
      const userId = req.user && req.user.id;
      auditLog(db, userId, 'USER_UPDATED', idCheck.value, { username: row.username, name: row.name, role: row.role });
      res.json({
        id: row.id,
        username: row.username,
        name: row.name,
        role: row.role,
        permissions: perms,
        allowedDomains: domains,
      });
    } catch (e) {
      if (e.message === 'USERNAME_IN_USE') {
        return res.status(400).json({ success: false, error: 'Username already in use' });
      }
      console.error('PUT /users/:id:', e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /** Set user password (admin reset). Requires users.edit */
  router.patch('/:id/password', hasPermission('users.edit'), (req, res) => {
    const idCheck = validateId(req.params?.id, 'User ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const newPassword = req.body?.password;
    if (!newPassword || String(newPassword).length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
    }
    const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(idCheck.value);
    if (!existing) return res.status(404).json({ success: false, error: 'User not found' });
    let passwordHash;
    try {
      passwordHash = bcrypt.hashSync(String(newPassword), 10);
    } catch (e) {
      return res.status(500).json({ success: false, error: 'Failed to hash password' });
    }
    try {
      db.prepare('UPDATE users SET passwordHash = ? WHERE id = ?').run(passwordHash, idCheck.value);
      res.json({ success: true });
    } catch (e) {
      console.error('PATCH /users/:id/password:', e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /** Delete user. Cannot delete self. Cannot delete last admin. Requires users.delete */
  router.delete('/:id', hasPermission('users.delete'), (req, res) => {
    const idCheck = validateId(req.params?.id, 'User ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const targetId = idCheck.value;
    const selfId = req.user && req.user.id;
    if (selfId && targetId === selfId) {
      return res.status(400).json({ success: false, error: 'Cannot delete your own account' });
    }
    const existing = db.prepare('SELECT id, username, name, permissions FROM users WHERE id = ?').get(targetId);
    if (!existing) return res.status(404).json({ success: false, error: 'User not found' });
    let targetPerms = [];
    try {
      targetPerms = JSON.parse(existing.permissions || '[]');
    } catch (_) {}
    const isTargetAdmin = targetPerms.includes(MANAGE_PERM);
    if (isTargetAdmin) {
      const admins = db.prepare('SELECT id, permissions FROM users').all().filter((r) => {
        let p = [];
        try {
          p = JSON.parse(r.permissions || '[]');
        } catch (_) {}
        return p.includes(MANAGE_PERM);
      });
      if (admins.length <= 1) {
        return res.status(400).json({ success: false, error: 'Cannot delete the last user with permission management' });
      }
    }
    try {
      db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
      auditLog(db, selfId, 'USER_DELETED', targetId, { username: existing.username, name: existing.name });
      res.json({ success: true });
    } catch (e) {
      console.error('DELETE /users/:id:', e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /** Unlock a user's active session (admin recovery). Requires users.manage_permissions */
  router.post('/:id/unlock-session', hasPermission('users.manage_permissions'), (req, res) => {
    const idCheck = validateId(req.params?.id, 'User ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const targetId = idCheck.value;
    const existing = db.prepare('SELECT id, username, name FROM users WHERE id = ?').get(targetId);
    if (!existing && targetId !== 'admin') return res.status(404).json({ success: false, error: 'User not found' });
    try {
      endSession(db, targetId);
      const actorId = req.user && req.user.id;
      auditLog(db, actorId, 'SESSION_UNLOCKED_BY_ADMIN', targetId, {
        username: existing ? existing.username : 'admin',
        name: existing ? existing.name : 'Admin',
      });
      return res.json({ success: true });
    } catch (e) {
      console.error('POST /users/:id/unlock-session:', e);
      return res.status(500).json({ success: false, error: e.message || 'Failed to unlock session' });
    }
  });

  /** Update allowed domains (screens) for a user. Requires users.manage_permissions */
  router.patch('/:id/allowed-domains', hasPermission('users.manage_permissions'), (req, res) => {
    const idCheck = validateId(req.params?.id, 'User ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const allowedDomainsRaw = req.body?.allowedDomains;
    if (!Array.isArray(allowedDomainsRaw)) {
      return res.status(400).json({ success: false, error: 'Body must include allowedDomains array' });
    }
    const allowedDomains = normalizeAllowedDomains(allowedDomainsRaw);
    const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(idCheck.value);
    if (!existing) return res.status(404).json({ success: false, error: 'User not found' });
    try {
      db.prepare('UPDATE users SET allowedDomains = ? WHERE id = ?').run(JSON.stringify(allowedDomains), idCheck.value);
      const row = db.prepare('SELECT id, username, name, role, permissions, allowedDomains FROM users WHERE id = ?').get(idCheck.value);
      let perms = [];
      let domains = [];
      try {
        perms = JSON.parse(row.permissions || '[]');
      } catch (_) {}
      try {
        domains = JSON.parse(row.allowedDomains || '[]');
      } catch (_) {}
      res.json({
        id: row.id,
        username: row.username,
        name: row.name,
        role: row.role,
        permissions: perms,
        allowedDomains: domains,
      });
    } catch (e) {
      console.error('PATCH /users/:id/allowed-domains:', e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /** Update permissions. Audit log. Anti-lockout: if target is self, reject removal of users.manage_permissions. Requires users.manage_permissions */
  router.patch('/:id/permissions', hasPermission('users.manage_permissions'), (req, res) => {
    const idCheck = validateId(req.params?.id, 'User ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const targetId = idCheck.value;
    const permissionsRaw = req.body?.permissions;
    if (!Array.isArray(permissionsRaw)) {
      return res.status(400).json({ success: false, error: 'Body must include permissions array' });
    }
    const permissions = normalizePermissions(permissionsRaw, []);
    const selfId = req.user && req.user.id;
    if (selfId && targetId === selfId && !permissions.includes(MANAGE_PERM)) {
      return res.status(400).json({
        success: false,
        error: 'You cannot remove your own "Manage permissions" right (would lock yourself out)',
      });
    }
    const existing = db.prepare('SELECT id, username, permissions FROM users WHERE id = ?').get(targetId);
    if (!existing) return res.status(404).json({ success: false, error: 'User not found' });
    const previous = (() => {
      try {
        return JSON.parse(existing.permissions || '[]');
      } catch (_) {
        return [];
      }
    })();
    try {
      db.prepare('UPDATE users SET permissions = ? WHERE id = ?').run(JSON.stringify(permissions), targetId);
      auditLog(db, selfId, 'PERMISSIONS_UPDATED', targetId, { updatedBy: selfId, previousPermissions: previous, newPermissions: permissions });
      const row = db.prepare('SELECT id, username, name, role, permissions FROM users WHERE id = ?').get(targetId);
      let perms = [];
      try {
        perms = JSON.parse(row.permissions || '[]');
      } catch (_) {}
      res.json({
        id: row.id,
        username: row.username,
        name: row.name,
        role: row.role,
        permissions: perms,
      });
    } catch (e) {
      console.error('PATCH /users/:id/permissions:', e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  return router;
}

module.exports = createRouter;
