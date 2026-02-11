const express = require('express');
const db = require('../db');
const { validateId } = require('../middleware');

function createRouter(broadcast) {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json(db.prepare('SELECT * FROM buyers').all().map(b => {
      let consignees = [];
      if (b.consignees_json) {
        try { consignees = JSON.parse(b.consignees_json); } catch (_) {}
      }
      return { ...b, hasConsignee: !!b.hasConsignee, consignees: Array.isArray(consignees) ? consignees : [] };
    }));
  });

  router.post('/', (req, res) => {
    const b = req.body;
    if (!b || typeof b !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    const idCheck = validateId(b.id, 'Buyer ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const consigneesJson = (b.consignees && Array.isArray(b.consignees)) ? JSON.stringify(b.consignees) : null;
    const stmt = db.prepare(`INSERT OR REPLACE INTO buyers (id, name, address, country, bankName, accountHolderName, swiftCode, bankAddress, contactPerson, contactDetails, salesPersonName, salesPersonContact, hasConsignee, status, requestedBy, createdAt, consignees_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    stmt.run(idCheck.value, b.name, b.address, b.country, b.bankName, b.accountHolderName, b.swiftCode, b.bankAddress, b.contactPerson, b.contactDetails, b.salesPersonName, b.salesPersonContact, b.hasConsignee ? 1 : 0, b.status, b.requestedBy, b.createdAt, consigneesJson);
    res.json({ success: true });
    broadcast();
  });

  router.put('/:id', (req, res) => {
    const idCheck = validateId(req.params && req.params.id, 'Buyer ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const b = req.body;
    if (!b || typeof b !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    const consigneesJson = (b.consignees && Array.isArray(b.consignees)) ? JSON.stringify(b.consignees) : null;
    const stmt = db.prepare(`INSERT OR REPLACE INTO buyers (id, name, address, country, bankName, accountHolderName, swiftCode, bankAddress, contactPerson, contactDetails, salesPersonName, salesPersonContact, hasConsignee, status, requestedBy, createdAt, consignees_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    stmt.run(idCheck.value, b.name, b.address, b.country, b.bankName, b.accountHolderName, b.swiftCode, b.bankAddress, b.contactPerson, b.contactDetails, b.salesPersonName, b.salesPersonContact, b.hasConsignee ? 1 : 0, b.status, b.requestedBy, b.createdAt, consigneesJson);
    res.json({ success: true });
    broadcast();
  });

  return router;
}

module.exports = createRouter;
