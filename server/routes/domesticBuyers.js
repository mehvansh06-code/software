const express = require('express');
const db = require('../db');
const { validateId, hasPermission } = require('../middleware');
const { log: auditLog } = require('../services/auditService');

function createRouter(broadcast) {
  const router = express.Router();

  router.get('/', hasPermission('buyers.view'), (req, res) => {
    const buyers = db.prepare('SELECT * FROM domestic_buyers ORDER BY name').all();
    const sites = db.prepare('SELECT * FROM domestic_buyer_sites').all();
    const byId = {};
    buyers.forEach((b) => {
      byId[b.id] = {
        ...b,
        version: b.version != null ? Number(b.version) : 1,
        sites: sites.filter((s) => s.domesticBuyerId === b.id).map((s) => ({
          id: s.id,
          siteName: s.siteName,
          shippingAddress: s.shippingAddress,
        })),
      };
    });
    res.json(Object.values(byId));
  });

  router.post('/', hasPermission('buyers.create'), (req, res) => {
    const b = req.body;
    if (!b || typeof b !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    const idCheck = validateId(b.id, 'Domestic buyer ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const now = new Date().toISOString();
    try {
      const runTx = db.transaction(() => {
        db.prepare(
          `INSERT INTO domestic_buyers (id, name, billingAddress, state, gstNo, mobile, salesPersonName, salesPersonMobile, salesPersonEmail, paymentTerms, createdAt, version)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
        ).run(
          idCheck.value,
          b.name || '',
          b.billingAddress || '',
          b.state || '',
          b.gstNo || '',
          b.mobile || '',
          b.salesPersonName || '',
          b.salesPersonMobile || '',
          b.salesPersonEmail || '',
          b.paymentTerms || '',
          b.createdAt || now,
          1
        );
        db.prepare('DELETE FROM domestic_buyer_sites WHERE domesticBuyerId = ?').run(idCheck.value);
        const sites = Array.isArray(b.sites) ? b.sites : [];
        const insSite = db.prepare(
          'INSERT INTO domestic_buyer_sites (id, domesticBuyerId, siteName, shippingAddress) VALUES (?,?,?,?)'
        );
        sites.forEach((s) => {
          const sid = s.id || 's_' + Math.random().toString(36).slice(2, 11);
          insSite.run(sid, idCheck.value, s.siteName || '', s.shippingAddress || '');
        });
      });
      runTx();
    } catch (e) {
      if (/UNIQUE constraint failed|SQLITE_CONSTRAINT/.test(e.message || '')) {
        return res.status(409).json({ success: false, error: 'Domestic buyer already exists. Reload and edit the latest record.' });
      }
      return res.status(500).json({ success: false, error: e.message || 'Failed to create domestic buyer' });
    }
    const userId = req.user && req.user.id;
    auditLog(db, userId, 'DOMESTIC_BUYER_CREATED', idCheck.value, { name: b.name });
    res.json({ success: true, version: 1 });
    broadcast();
  });

  router.put('/:id', hasPermission('buyers.edit'), (req, res) => {
    const idCheck = validateId(req.params?.id, 'Domestic buyer ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const b = req.body;
    if (!b || typeof b !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    const existing = db.prepare('SELECT id, version FROM domestic_buyers WHERE id = ?').get(idCheck.value);
    if (!existing) return res.status(404).json({ success: false, error: 'Domestic buyer not found' });
    const version = Number(b.version);
    if (!Number.isInteger(version) || version < 1) {
      return res.status(400).json({ success: false, error: 'Version is required for update' });
    }
    try {
      const runTx = db.transaction(() => {
        const result = db.prepare(
          `UPDATE domestic_buyers SET name=?, billingAddress=?, state=?, gstNo=?, mobile=?, salesPersonName=?, salesPersonMobile=?, salesPersonEmail=?, paymentTerms=?, version = version + 1
           WHERE id=? AND version=?`
        ).run(
          b.name || '',
          b.billingAddress || '',
          b.state || '',
          b.gstNo || '',
          b.mobile || '',
          b.salesPersonName || '',
          b.salesPersonMobile || '',
          b.salesPersonEmail || '',
          b.paymentTerms || '',
          idCheck.value,
          version
        );
        if (result.changes === 0) {
          const err = new Error('Domestic buyer was modified by another user. Please reload and try again.');
          err.statusCode = 409;
          throw err;
        }
        db.prepare('DELETE FROM domestic_buyer_sites WHERE domesticBuyerId = ?').run(idCheck.value);
        const sites = Array.isArray(b.sites) ? b.sites : [];
        const insSite = db.prepare(
          'INSERT INTO domestic_buyer_sites (id, domesticBuyerId, siteName, shippingAddress) VALUES (?,?,?,?)'
        );
        sites.forEach((s) => {
          const sid = s.id || 's_' + Math.random().toString(36).slice(2, 11);
          insSite.run(sid, idCheck.value, s.siteName || '', s.shippingAddress || '');
        });
      });
      runTx();
    } catch (e) {
      if (e.statusCode === 409) return res.status(409).json({ success: false, error: e.message });
      return res.status(500).json({ success: false, error: e.message || 'Failed to update domestic buyer' });
    }
    const versionRow = db.prepare('SELECT version FROM domestic_buyers WHERE id = ?').get(idCheck.value);
    const userId = req.user && req.user.id;
    auditLog(db, userId, 'DOMESTIC_BUYER_UPDATED', idCheck.value, { name: b.name });
    res.json({ success: true, version: versionRow ? versionRow.version : undefined });
    broadcast();
  });

  router.post('/import', hasPermission('buyers.create'), (req, res) => {
    const body = req.body;
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    if (rows.length === 0) return res.status(400).json({ success: false, error: 'Send { rows: [...] } with row objects' });
    const now = new Date().toISOString();
    const ins = db.prepare(
      'INSERT INTO domestic_buyers (id, name, billingAddress, state, gstNo, mobile, salesPersonName, salesPersonMobile, salesPersonEmail, paymentTerms, createdAt, version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
    );
    const insSite = db.prepare('INSERT INTO domestic_buyer_sites (id, domesticBuyerId, siteName, shippingAddress) VALUES (?,?,?,?)');
    let count = 0;
    let skipped = 0;
    try {
      for (const r of rows) {
        const id = r.id || 'db_' + Math.random().toString(36).slice(2, 11);
        try {
          ins.run(
            id,
            r.name || '',
            r.billingAddress || r.billing_address || '',
            r.state || '',
            r.gstNo || r.gst_no || r.gst || '',
            r.mobile || '',
            r.salesPersonName || r.sales_person_name || '',
            r.salesPersonMobile || r.sales_person_mobile || '',
            r.salesPersonEmail || r.sales_person_email || '',
            r.paymentTerms || r.payment_terms || '',
            now,
            1
          );
          count++;
          const sites = Array.isArray(r.sites) ? r.sites : [];
          sites.forEach((s) => {
            const sid = s.id || 's_' + Math.random().toString(36).slice(2, 11);
            insSite.run(sid, id, s.siteName || s.site_name || '', s.shippingAddress || s.shipping_address || '');
          });
        } catch (e) {
          if (/UNIQUE constraint failed|SQLITE_CONSTRAINT/.test(e.message || '')) {
            skipped++;
            continue;
          }
          throw e;
        }
      }
      const userId = req.user && req.user.id;
      auditLog(db, userId, 'DOMESTIC_BUYERS_IMPORTED', null, { imported: count, skipped });
      broadcast();
      res.json({ success: true, imported: count, skipped });
    } catch (e) {
      console.error('domestic-buyers import:', e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  router.delete('/:id', hasPermission('buyers.delete'), (req, res) => {
    const idCheck = validateId(req.params?.id, 'Domestic buyer ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const row = db.prepare('SELECT id, name FROM domestic_buyers WHERE id = ?').get(idCheck.value);
    if (!row) return res.status(404).json({ success: false, error: 'Domestic buyer not found' });
    db.prepare('DELETE FROM domestic_buyer_sites WHERE domesticBuyerId = ?').run(idCheck.value);
    db.prepare('DELETE FROM domestic_buyers WHERE id = ?').run(idCheck.value);
    const userId = req.user && req.user.id;
    auditLog(db, userId, 'DOMESTIC_BUYER_DELETED', idCheck.value, { name: row.name });
    res.json({ success: true });
    broadcast();
  });

  return router;
}

module.exports = createRouter;
