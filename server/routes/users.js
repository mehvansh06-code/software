const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const { validateId, hasPermission } = require('../middleware');
const { PRESETS, PERMISSIONS } = require('../constants/permissions');
const { log: auditLog } = require('../services/auditService');

const MANAGE_PERM = PERMISSIONS.USERS_MANAGE_PERMISSIONS;

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
    const role = typeof b.role === 'string' ? b.role.toUpperCase() : 'VIEWER';
    const allowedDomains = Array.isArray(b.allowedDomains) ? b.allowedDomains : [];
    if (!username) return res.status(400).json({ success: false, error: 'Username required' });
    if (!password || String(password).length < 1) return res.status(400).json({ success: false, error: 'Password required' });
    const id = b.id || 'u_' + Math.random().toString(36).slice(2, 11);
    const idCheck = validateId(id, 'User ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const permissions = Array.isArray(b.permissions) ? b.permissions : (PRESETS[role] || PRESETS.VIEWER || []);
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
    const role = typeof b.role === 'string' ? b.role.toUpperCase() : undefined;
    const username = typeof b.username === 'string' ? b.username.trim() : undefined;
    const allowedDomains = Array.isArray(b.allowedDomains) ? b.allowedDomains : undefined;
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
    if (role !== undefined) {
      setClauses.push('role = ?');
      values.push(role);
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
      db.transaction(() => {
        if (username !== undefined && username !== '') {
          const conflict = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, idCheck.value);
          if (conflict) throw new Error('USERNAME_IN_USE');
        }
        const sql = `UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`;
        values.push(idCheck.value);
        db.prepare(sql).run(...values);
      });
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
    if (!newPassword || String(newPassword).length < 1) {
      return res.status(400).json({ success: false, error: 'Password required' });
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

  /** Update allowed domains (screens) for a user. Requires users.manage_permissions */
  router.patch('/:id/allowed-domains', hasPermission('users.manage_permissions'), (req, res) => {
    const idCheck = validateId(req.params?.id, 'User ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const allowedDomains = req.body?.allowedDomains;
    if (!Array.isArray(allowedDomains)) {
      return res.status(400).json({ success: false, error: 'Body must include allowedDomains array' });
    }
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
    const permissions = req.body?.permissions;
    if (!Array.isArray(permissions)) {
      return res.status(400).json({ success: false, error: 'Body must include permissions array' });
    }
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
