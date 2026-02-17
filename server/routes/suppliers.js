const express = require('express');
const db = require('../db');
const { validateId, hasPermission } = require('../middleware');
const { log: auditLog } = require('../services/auditService');

function createRouter(broadcast) {
  const router = express.Router();

  router.get('/', hasPermission('suppliers.view'), (req, res, next) => {
    try {
      const rows = db.prepare('SELECT * FROM suppliers').all();
      const result = Array.isArray(rows) ? rows.map(s => {
        const products = db.prepare('SELECT * FROM products WHERE supplierId = ?').all(s.id);
        return { ...s, products: Array.isArray(products) ? products : [] };
      }) : [];
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  router.post('/', hasPermission('suppliers.create'), (req, res) => {
    const s = req.body;
    if (!s || typeof s !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    const idCheck = validateId(s.id, 'Supplier ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const insert = db.prepare(`INSERT OR REPLACE INTO suppliers (id, name, address, country, bankName, accountHolderName, accountNumber, swiftCode, bankAddress, contactPerson, contactDetails, status, requestedBy, createdAt, hasIntermediaryBank, intermediaryBankName, intermediaryAccountHolderName, intermediaryAccountNumber, intermediarySwiftCode, intermediaryBankAddress) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    insert.run(idCheck.value, s.name, s.address, s.country, s.bankName, s.accountHolderName, s.accountNumber || null, s.swiftCode, s.bankAddress, s.contactPerson, s.contactDetails, s.status, s.requestedBy, s.createdAt, s.hasIntermediaryBank ? 1 : 0, s.intermediaryBankName || null, s.intermediaryAccountHolderName || null, s.intermediaryAccountNumber || null, s.intermediarySwiftCode || null, s.intermediaryBankAddress || null);
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

  router.post('/import', hasPermission('suppliers.create'), (req, res) => {
    const body = req.body;
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    if (rows.length === 0) return res.status(400).json({ success: false, error: 'Send { rows: [...] } with supplier objects' });
    const now = new Date().toISOString();
    const insert = db.prepare(`INSERT OR REPLACE INTO suppliers (id, name, address, country, bankName, accountHolderName, accountNumber, swiftCode, bankAddress, contactPerson, contactDetails, status, requestedBy, createdAt, hasIntermediaryBank, intermediaryBankName, intermediaryAccountHolderName, intermediaryAccountNumber, intermediarySwiftCode, intermediaryBankAddress) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    let count = 0;
    try {
      for (const r of rows) {
        const id = (r.id && /^[a-zA-Z0-9_-]+$/.test(r.id)) ? r.id : 's_' + Math.random().toString(36).slice(2, 11);
        insert.run(
          id,
          r.name || '',
          r.address || '',
          r.country || '',
          r.bankName || r.bank_name || '',
          r.accountHolderName || r.accountHolder || r.account_holder_name || '',
          r.accountNumber || r.account_number || null,
          r.swiftCode || r.swift || r.swift_code || '',
          r.bankAddress || r.bank_address || '',
          r.contactPerson || r.contact_person || '',
          r.contactDetails || r.contact_details || (r.contactNumber || r.contactEmail ? [r.contactNumber, r.contactEmail].filter(Boolean).join(' / ') : '') || null,
          r.status || 'APPROVED',
          r.requestedBy || 'Import',
          r.createdAt || now,
          r.hasIntermediaryBank ? 1 : 0,
          r.intermediaryBankName || null,
          r.intermediaryAccountHolderName || null,
          r.intermediaryAccountNumber || r.intermediary_account_number || null,
          r.intermediarySwiftCode || null,
          r.intermediaryBankAddress || null
        );
        if (r.products && Array.isArray(r.products) && r.products.length > 0) {
          db.prepare('DELETE FROM products WHERE supplierId = ?').run(id);
          const prodStmt = db.prepare(`INSERT INTO products VALUES (?,?,?,?,?,?,?)`);
          for (const p of r.products) {
            const pid = (p && p.id && /^[a-zA-Z0-9_-]+$/.test(p.id)) ? p.id : 'p_' + Math.random().toString(36).slice(2, 11);
            prodStmt.run(pid, id, p.name || '', p.description || null, p.hsnCode || null, p.unit || 'KGS', p.type || null);
          }
        }
        count++;
      }
      const userId = req.user && req.user.id;
      auditLog(db, userId, 'SUPPLIERS_IMPORTED', null, { count, message: `Imported ${count} supplier(s)` });
      broadcast();
      res.json({ success: true, imported: count });
    } catch (e) {
      console.error('suppliers import:', e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  router.put('/:id', hasPermission('suppliers.edit'), (req, res) => {
    const idCheck = validateId(req.params && req.params.id, 'Supplier ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const s = req.body;
    if (!s || typeof s !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    const insert = db.prepare(`INSERT OR REPLACE INTO suppliers (id, name, address, country, bankName, accountHolderName, accountNumber, swiftCode, bankAddress, contactPerson, contactDetails, status, requestedBy, createdAt, hasIntermediaryBank, intermediaryBankName, intermediaryAccountHolderName, intermediaryAccountNumber, intermediarySwiftCode, intermediaryBankAddress) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    insert.run(idCheck.value, s.name, s.address, s.country, s.bankName, s.accountHolderName, s.accountNumber || null, s.swiftCode, s.bankAddress, s.contactPerson, s.contactDetails, s.status, s.requestedBy, s.createdAt, s.hasIntermediaryBank ? 1 : 0, s.intermediaryBankName || null, s.intermediaryAccountHolderName || null, s.intermediaryAccountNumber || null, s.intermediarySwiftCode || null, s.intermediaryBankAddress || null);
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

  router.delete('/:id', hasPermission('suppliers.delete'), (req, res) => {
    const idCheck = validateId(req.params && req.params.id, 'Supplier ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const id = idCheck.value;
    try {
      const row = db.prepare('SELECT id, name FROM suppliers WHERE id = ?').get(id);
      if (!row) return res.status(404).json({ success: false, error: 'Supplier not found' });
      const linked = db.prepare('SELECT COUNT(*) AS n FROM shipments WHERE supplierId = ?').get(id);
      const count = linked && linked.n != null ? Number(linked.n) : 0;
      if (count > 0) {
        return res.status(409).json({
          success: false,
          error: `Cannot delete supplier: ${count} shipment(s) are linked. Unlink them first.`
        });
      }
      db.prepare('DELETE FROM products WHERE supplierId = ?').run(id);
      db.prepare('DELETE FROM suppliers WHERE id = ?').run(id);
      const userId = req.user && req.user.id;
      auditLog(db, userId, 'SUPPLIER_DELETED', id, { name: row.name });
      res.json({ success: true });
      broadcast();
    } catch (e) {
      console.error('DELETE /suppliers/:id', e);
      res.status(500).json({ success: false, error: e.message || 'Failed to delete supplier' });
    }
  });

  return router;
}

module.exports = createRouter;
