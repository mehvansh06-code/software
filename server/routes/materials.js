const express = require('express');
const db = require('../db');
const { validateId, hasPermission } = require('../middleware');
const { log: auditLog } = require('../services/auditService');

function createRouter(broadcast) {
  const router = express.Router();

  router.get('/', hasPermission('materials.view'), (req, res, next) => {
    try {
      const rows = db.prepare('SELECT * FROM materials').all();
      const out = Array.isArray(rows) ? rows.map((r) => ({
        ...r,
        version: r.version != null ? Number(r.version) : 1,
      })) : [];
      res.json(out);
    } catch (e) {
      next(e);
    }
  });

  router.post('/', hasPermission('materials.create'), (req, res) => {
    const m = req.body;
    if (!m || typeof m !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    const idCheck = validateId(m.id, 'Material ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    try {
      db.prepare('INSERT INTO materials (id, name, description, hsnCode, unit, type, version) VALUES (?,?,?,?,?,?,?)')
        .run(idCheck.value, m.name, m.description || null, m.hsnCode || null, m.unit || 'KGS', m.type || null, 1);
    } catch (e) {
      if (/UNIQUE constraint failed|SQLITE_CONSTRAINT/.test(e.message || '')) {
        return res.status(409).json({ success: false, error: 'Material already exists. Reload and edit the latest record.' });
      }
      return res.status(500).json({ success: false, error: e.message || 'Failed to create material' });
    }
    const userId = req.user && req.user.id;
    auditLog(db, userId, 'MATERIAL_CREATED', idCheck.value, { name: m.name });
    res.json({ success: true, version: 1 });
    broadcast();
  });

  router.post('/import', hasPermission('materials.create'), (req, res) => {
    const body = req.body;
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    if (rows.length === 0) return res.status(400).json({ success: false, error: 'Send { rows: [...] } with material objects' });
    let count = 0;
    let skipped = 0;
    try {
      for (const r of rows) {
        const id = (r.id && /^[a-zA-Z0-9_-]+$/.test(r.id)) ? r.id : 'm_' + Math.random().toString(36).slice(2, 11);
        try {
          db.prepare('INSERT INTO materials (id, name, description, hsnCode, unit, type, version) VALUES (?,?,?,?,?,?,?)').run(
            id,
            r.name || '',
            r.description || null,
            r.hsnCode || null,
            r.unit || 'KGS',
            r.type || null,
            1
          );
          count++;
        } catch (e) {
          if (/UNIQUE constraint failed|SQLITE_CONSTRAINT/.test(e.message || '')) {
            skipped++;
            continue;
          }
          throw e;
        }
      }
      const userId = req.user && req.user.id;
      auditLog(db, userId, 'MATERIALS_IMPORTED', null, { imported: count, skipped });
      broadcast();
      res.json({ success: true, imported: count, skipped });
    } catch (e) {
      console.error('materials import:', e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  router.put('/:id', hasPermission('materials.edit'), (req, res) => {
    const idCheck = validateId(req.params && req.params.id, 'Material ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const m = req.body;
    if (!m || typeof m !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    const existing = db.prepare('SELECT id, version FROM materials WHERE id = ?').get(idCheck.value);
    if (!existing) return res.status(404).json({ success: false, error: 'Material not found' });
    const version = Number(m.version);
    if (!Number.isInteger(version) || version < 1) {
      return res.status(400).json({ success: false, error: 'Version is required for update' });
    }
    const result = db.prepare(`
      UPDATE materials
      SET name=?, description=?, hsnCode=?, unit=?, type=?, version = version + 1
      WHERE id=? AND version=?
    `).run(m.name, m.description || null, m.hsnCode || null, m.unit || 'KGS', m.type || null, idCheck.value, version);
    if (result.changes === 0) {
      return res.status(409).json({ success: false, error: 'Material was modified by another user. Please reload and try again.' });
    }
    const versionRow = db.prepare('SELECT version FROM materials WHERE id = ?').get(idCheck.value);
    const userId = req.user && req.user.id;
    auditLog(db, userId, 'MATERIAL_UPDATED', idCheck.value, { name: m.name });
    res.json({ success: true, version: versionRow ? versionRow.version : undefined });
    broadcast();
  });

  router.delete('/:id', hasPermission('materials.delete'), (req, res) => {
    const idCheck = validateId(req.params && req.params.id, 'Material ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    try {
      const row = db.prepare('SELECT id, name FROM materials WHERE id = ?').get(idCheck.value);
      if (!row) return res.status(404).json({ success: false, error: 'Material not found' });
      const result = db.prepare('DELETE FROM materials WHERE id = ?').run(idCheck.value);
      if (result.changes === 0) return res.status(404).json({ success: false, error: 'Material not found' });
      const userId = req.user && req.user.id;
      auditLog(db, userId, 'MATERIAL_DELETED', idCheck.value, { name: row.name });
      res.json({ success: true });
      broadcast();
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  return router;
}

module.exports = createRouter;
