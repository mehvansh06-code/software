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
    const ins = db.prepare('INSERT OR REPLACE INTO licences VALUES (?,?,?,?,?,?,?,?,?,?)');
    ins.run(idCheck.value, l.number, l.type, l.issueDate, l.expiryDate, l.dutySaved, l.eoRequired, l.eoFulfilled, l.company, l.status);
    res.json({ success: true });
    broadcast();
  });

  router.put('/:id', (req, res) => {
    const idCheck = validateId(req.params && req.params.id, 'Licence ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const l = req.body;
    if (!l || typeof l !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    db.prepare('UPDATE licences SET eoFulfilled=?, status=? WHERE id=?').run(l.eoFulfilled, l.status, idCheck.value);
    res.json({ success: true });
    broadcast();
  });

  return router;
}

module.exports = createRouter;
