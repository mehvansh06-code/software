const express = require('express');
const db = require('../db');
const { validateId } = require('../middleware');

function createRouter(broadcast) {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json(db.prepare('SELECT * FROM materials').all());
  });

  router.post('/', (req, res) => {
    const m = req.body;
    if (!m || typeof m !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    const idCheck = validateId(m.id, 'Material ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    db.prepare('INSERT OR REPLACE INTO materials VALUES (?,?,?,?,?,?)').run(idCheck.value, m.name, m.description || null, m.hsnCode || null, m.unit || 'KGS', m.type || null);
    res.json({ success: true });
    broadcast();
  });

  router.post('/import', (req, res) => {
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

  router.put('/:id', (req, res) => {
    const idCheck = validateId(req.params && req.params.id, 'Material ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const m = req.body;
    if (!m || typeof m !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    db.prepare('UPDATE materials SET name=?, description=?, hsnCode=?, unit=?, type=? WHERE id=?').run(m.name, m.description || null, m.hsnCode || null, m.unit || 'KGS', m.type || null, idCheck.value);
    res.json({ success: true });
    broadcast();
  });

  return router;
}

module.exports = createRouter;
