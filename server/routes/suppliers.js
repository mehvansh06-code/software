const express = require('express');
const db = require('../db');
const { validateId, hasPermission } = require('../middleware');
const { log: auditLog } = require('../services/auditService');

function createRouter(broadcast) {
  const router = express.Router();

  router.get('/', hasPermission('suppliers.view'), (req, res) => {
    const rows = db.prepare('SELECT * FROM suppliers').all();
    rows.forEach(s => {
      s.products = db.prepare('SELECT * FROM products WHERE supplierId = ?').all(s.id);
    });
    res.json(rows);
  });

  router.post('/', hasPermission('suppliers.create'), (req, res) => {
    const s = req.body;
    if (!s || typeof s !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    const idCheck = validateId(s.id, 'Supplier ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const insert = db.prepare(`INSERT OR REPLACE INTO suppliers VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    insert.run(idCheck.value, s.name, s.address, s.country, s.bankName, s.accountHolderName, s.swiftCode, s.bankAddress, s.contactPerson, s.contactDetails, s.status, s.requestedBy, s.createdAt, s.hasIntermediaryBank ? 1 : 0, s.intermediaryBankName || null, s.intermediaryAccountHolderName || null, s.intermediarySwiftCode || null, s.intermediaryBankAddress || null);
    if (s.products && Array.isArray(s.products)) {
      db.prepare('DELETE FROM products WHERE supplierId = ?').run(idCheck.value);
      const prodStmt = db.prepare(`INSERT INTO products VALUES (?,?,?,?,?,?,?)`);
      for (const p of s.products) {
        const pid = validateId(p && p.id, 'Product ID');
        if (pid.valid) prodStmt.run(pid.value, idCheck.value, p.name, p.description, p.hsnCode, p.unit, p.type);
      }
    }
    const userId = req.user && req.user.id;
    auditLog(db, userId, 'SUPPLIER_CREATED', idCheck.value, { name: s.name });
    res.json({ success: true });
    broadcast();
  });

  router.put('/:id', hasPermission('suppliers.edit'), (req, res) => {
    const idCheck = validateId(req.params && req.params.id, 'Supplier ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const s = req.body;
    if (!s || typeof s !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    const insert = db.prepare(`INSERT OR REPLACE INTO suppliers VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    insert.run(idCheck.value, s.name, s.address, s.country, s.bankName, s.accountHolderName, s.swiftCode, s.bankAddress, s.contactPerson, s.contactDetails, s.status, s.requestedBy, s.createdAt, s.hasIntermediaryBank ? 1 : 0, s.intermediaryBankName || null, s.intermediaryAccountHolderName || null, s.intermediarySwiftCode || null, s.intermediaryBankAddress || null);
    if (s.products && Array.isArray(s.products)) {
      db.prepare('DELETE FROM products WHERE supplierId = ?').run(idCheck.value);
      const prodStmt = db.prepare(`INSERT INTO products VALUES (?,?,?,?,?,?,?)`);
      for (const p of s.products) {
        const pid = validateId(p && p.id, 'Product ID');
        if (pid.valid) prodStmt.run(pid.value, idCheck.value, p.name, p.description, p.hsnCode, p.unit, p.type);
      }
    }
    const userId = req.user && req.user.id;
    auditLog(db, userId, 'SUPPLIER_UPDATED', idCheck.value, { name: s.name });
    res.json({ success: true });
    broadcast();
  });

  return router;
}

module.exports = createRouter;
