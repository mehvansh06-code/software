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
