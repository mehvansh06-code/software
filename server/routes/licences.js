const express = require('express');
const db = require('../db');
const { validateId, hasPermission } = require('../middleware');
const { log: auditLog } = require('../services/auditService');

function createRouter(broadcast) {
  const router = express.Router();

  router.get('/', hasPermission('licences.view'), (req, res) => {
    res.json(db.prepare('SELECT * FROM licences').all());
  });

  router.post('/', hasPermission('licences.create'), (req, res) => {
    const l = req.body;
    if (!l || typeof l !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    const idCheck = validateId(l.id, 'Licence ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const ins = db.prepare('INSERT OR REPLACE INTO licences (id, number, type, issueDate, importValidityDate, expiryDate, dutySaved, eoRequired, eoFulfilled, company, status) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    ins.run(idCheck.value, l.number || null, l.type, l.issueDate || null, l.importValidityDate || null, l.expiryDate || null, l.dutySaved ?? 0, l.eoRequired ?? 0, l.eoFulfilled ?? 0, l.company || null, l.status || 'ACTIVE');
    const userId = req.user && req.user.id;
    auditLog(db, userId, 'LICENCE_CREATED', idCheck.value, { number: l.number, type: l.type, company: l.company });
    res.json({ success: true });
    broadcast();
  });

  router.put('/:id', hasPermission('licences.edit'), (req, res) => {
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
    const userId = req.user && req.user.id;
    auditLog(db, userId, 'LICENCE_UPDATED', idCheck.value, { number: l.number, type: l.type, status: l.status });
    res.json({ success: true });
    broadcast();
  });

  return router;
}

module.exports = createRouter;
