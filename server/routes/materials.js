const express = require('express');
const db = require('../db');
const { validateId, hasPermission } = require('../middleware');

function createRouter(broadcast) {
  const router = express.Router();

  router.get('/', hasPermission('materials.view'), (req, res, next) => {
    try {
      const rows = db.prepare('SELECT * FROM materials').all();
      res.json(Array.isArray(rows) ? rows : []);
    } catch (e) {
      next(e);
    }
  });

  router.post('/', hasPermission('materials.create'), (req, res) => {
    const m = req.body;
    if (!m || typeof m !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    const idCheck = validateId(m.id, 'Material ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    db.prepare('INSERT OR REPLACE INTO materials VALUES (?,?,?,?,?,?)').run(idCheck.value, m.name, m.description || null, m.hsnCode || null, m.unit || 'KGS', m.type || null);
    res.json({ success: true });
    broadcast();
  });

  router.post('/import', hasPermission('materials.create'), (req, res) => {
    const body = req.body;
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    if (rows.length === 0) return res.status(400).json({ success: false, error: 'Send { rows: [...] } with material objects' });
    let count = 0;
    try {
      for (const r of rows) {
        const id = (r.id && /^[a-zA-Z0-9_-]+$/.test(r.id)) ? r.id : 'm_' + Math.random().toString(36).slice(2, 11);
        db.prepare('INSERT OR REPLACE INTO materials VALUES (?,?,?,?,?,?)').run(
          id,
          r.name || '',
          r.description || null,
          r.hsnCode || null,
          r.unit || 'KGS',
          r.type || null
        );
        count++;
      }
      broadcast();
      res.json({ success: true, imported: count });
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
    db.prepare('UPDATE materials SET name=?, description=?, hsnCode=?, unit=?, type=? WHERE id=?').run(m.name, m.description || null, m.hsnCode || null, m.unit || 'KGS', m.type || null, idCheck.value);
    res.json({ success: true });
    broadcast();
  });

  router.delete('/:id', hasPermission('materials.delete'), (req, res) => {
    const idCheck = validateId(req.params && req.params.id, 'Material ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    try {
      const result = db.prepare('DELETE FROM materials WHERE id = ?').run(idCheck.value);
      if (result.changes === 0) return res.status(404).json({ success: false, error: 'Material not found' });
      res.json({ success: true });
      broadcast();
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  return router;
}

module.exports = createRouter;
