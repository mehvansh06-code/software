const express = require('express');
const db = require('../db');
const { validateId } = require('../middleware');

function createRouter(broadcast) {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json(db.prepare('SELECT * FROM buyers').all().map(b => ({ ...b, hasConsignee: !!b.hasConsignee })));
  });

  router.post('/', (req, res) => {
    const b = req.body;
    if (!b || typeof b !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    const idCheck = validateId(b.id, 'Buyer ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const stmt = db.prepare(`INSERT OR REPLACE INTO buyers VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    stmt.run(idCheck.value, b.name, b.address, b.country, b.bankName, b.accountHolderName, b.swiftCode, b.bankAddress, b.contactPerson, b.contactDetails, b.salesPersonName, b.salesPersonContact, b.hasConsignee ? 1 : 0, b.status, b.requestedBy, b.createdAt);
    res.json({ success: true });
    broadcast();
  });

  router.put('/:id', (req, res) => {
    const idCheck = validateId(req.params && req.params.id, 'Buyer ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const b = req.body;
    if (!b || typeof b !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    const stmt = db.prepare(`INSERT OR REPLACE INTO buyers VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    stmt.run(idCheck.value, b.name, b.address, b.country, b.bankName, b.accountHolderName, b.swiftCode, b.bankAddress, b.contactPerson, b.contactDetails, b.salesPersonName, b.salesPersonContact, b.hasConsignee ? 1 : 0, b.status, b.requestedBy, b.createdAt);
    res.json({ success: true });
    broadcast();
  });

  return router;
}

module.exports = createRouter;
