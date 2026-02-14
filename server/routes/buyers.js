const express = require('express');
const db = require('../db');
const { validateId, hasPermission } = require('../middleware');
const { log: auditLog } = require('../services/auditService');

function createRouter(broadcast) {
  const router = express.Router();

  router.get('/', hasPermission('buyers.view'), (req, res) => {
    res.json(db.prepare('SELECT * FROM buyers').all().map(b => {
      let consignees = [];
      if (b.consignees_json) {
        try { consignees = JSON.parse(b.consignees_json); } catch (_) {}
      }
      return { ...b, hasConsignee: !!b.hasConsignee, consignees: Array.isArray(consignees) ? consignees : [] };
    }));
  });

  router.post('/', hasPermission('buyers.create'), (req, res) => {
    const b = req.body;
    if (!b || typeof b !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    const idCheck = validateId(b.id, 'Buyer ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const consigneesJson = (b.consignees && Array.isArray(b.consignees)) ? JSON.stringify(b.consignees) : null;
    const stmt = db.prepare(`INSERT OR REPLACE INTO buyers (id, name, address, country, bankName, accountHolderName, swiftCode, bankAddress, contactPerson, contactDetails, salesPersonName, salesPersonContact, hasConsignee, status, requestedBy, createdAt, consignees_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    stmt.run(idCheck.value, b.name, b.address, b.country, b.bankName, b.accountHolderName, b.swiftCode, b.bankAddress, b.contactPerson, b.contactDetails, b.salesPersonName, b.salesPersonContact, b.hasConsignee ? 1 : 0, b.status, b.requestedBy, b.createdAt, consigneesJson);
    const userId = req.user && req.user.id;
    auditLog(db, userId, 'BUYER_CREATED', idCheck.value, { name: b.name });
    res.json({ success: true });
    broadcast();
  });

  router.post('/import', hasPermission('buyers.create'), (req, res) => {
    const body = req.body;
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    if (rows.length === 0) return res.status(400).json({ success: false, error: 'Send { rows: [...] } with buyer objects' });
    const now = new Date().toISOString();
    const stmt = db.prepare(`INSERT OR REPLACE INTO buyers (id, name, address, country, bankName, accountHolderName, swiftCode, bankAddress, contactPerson, contactDetails, salesPersonName, salesPersonContact, hasConsignee, status, requestedBy, createdAt, consignees_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    let count = 0;
    try {
      for (const r of rows) {
        const id = r.id || 'b_' + Math.random().toString(36).slice(2, 11);
        const consignees = Array.isArray(r.consignees) ? r.consignees : [];
        const consigneesJson = consignees.length ? JSON.stringify(consignees) : null;
        stmt.run(
          id,
          r.name || '',
          r.address || '',
          r.country || '',
          r.bankName || r.bank_name || '',
          r.accountHolderName || r.accountHolder || r.account_holder_name || '',
          r.swiftCode || r.swift || r.swift_code || '',
          r.bankAddress || r.bank_address || '',
          r.contactPerson || r.contact_person || '',
          r.contactDetails || r.contact_details || (r.contactNumber || r.contactEmail ? [r.contactNumber, r.contactEmail].filter(Boolean).join(' / ') : ''),
          r.salesPersonName || r.sales_person_name || '',
          r.salesPersonContact || r.sales_person_contact || r.salesPersonMobile || '',
          consignees.length ? 1 : 0,
          r.status || 'APPROVED',
          r.requestedBy || 'Import',
          r.createdAt || now,
          consigneesJson
        );
        count++;
      }
      const userId = req.user && req.user.id;
      auditLog(db, userId, 'BUYERS_IMPORTED', null, { count, message: `Imported ${count} buyer(s)` });
      broadcast();
      res.json({ success: true, imported: count });
    } catch (e) {
      console.error('buyers import:', e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  router.put('/:id', hasPermission('buyers.edit'), (req, res) => {
    const idCheck = validateId(req.params && req.params.id, 'Buyer ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const b = req.body;
    if (!b || typeof b !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    const consigneesJson = (b.consignees && Array.isArray(b.consignees)) ? JSON.stringify(b.consignees) : null;
    const stmt = db.prepare(`INSERT OR REPLACE INTO buyers (id, name, address, country, bankName, accountHolderName, swiftCode, bankAddress, contactPerson, contactDetails, salesPersonName, salesPersonContact, hasConsignee, status, requestedBy, createdAt, consignees_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    stmt.run(idCheck.value, b.name, b.address, b.country, b.bankName, b.accountHolderName, b.swiftCode, b.bankAddress, b.contactPerson, b.contactDetails, b.salesPersonName, b.salesPersonContact, b.hasConsignee ? 1 : 0, b.status, b.requestedBy, b.createdAt, consigneesJson);
    const userId = req.user && req.user.id;
    auditLog(db, userId, 'BUYER_UPDATED', idCheck.value, { name: b.name });
    res.json({ success: true });
    broadcast();
  });

  return router;
}

module.exports = createRouter;
