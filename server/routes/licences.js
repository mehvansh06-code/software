const express = require('express');
const db = require('../db');
const { validateId } = require('../middleware');

function createRouter(broadcast) {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json(db.prepare('SELECT * FROM licences').all());
  });

  router.post('/', (req, res) => {
    const l = req.body;
    if (!l || typeof l !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    const idCheck = validateId(l.id, 'Licence ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const ins = db.prepare('INSERT OR REPLACE INTO licences (id, number, type, issueDate, importValidityDate, expiryDate, dutySaved, eoRequired, eoFulfilled, company, status) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    ins.run(idCheck.value, l.number || null, l.type, l.issueDate || null, l.importValidityDate || null, l.expiryDate || null, l.dutySaved ?? 0, l.eoRequired ?? 0, l.eoFulfilled ?? 0, l.company || null, l.status || 'ACTIVE');
    res.json({ success: true });
    broadcast();
  });

  router.put('/:id', (req, res) => {
    const idCheck = validateId(req.params && req.params.id, 'Licence ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const l = req.body;
    if (!l || typeof l !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    db.prepare(`
      UPDATE licences SET
        number=?, type=?, issueDate=?, importValidityDate=?, expiryDate=?,
        dutySaved=?, eoRequired=?, eoFulfilled=?, company=?, status=?
      WHERE id=?
    `).run(
      l.number ?? null, l.type ?? null, l.issueDate ?? null, l.importValidityDate ?? null, l.expiryDate ?? null,
      l.dutySaved ?? 0, l.eoRequired ?? 0, l.eoFulfilled ?? 0, l.company ?? null, l.status ?? 'ACTIVE',
      idCheck.value
    );
    res.json({ success: true });
    broadcast();
  });

  return router;
}

module.exports = createRouter;
