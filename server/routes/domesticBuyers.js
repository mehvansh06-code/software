const express = require('express');
const db = require('../db');
const { validateId } = require('../middleware');

function createRouter(broadcast) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const buyers = db.prepare('SELECT * FROM domestic_buyers ORDER BY name').all();
    const sites = db.prepare('SELECT * FROM domestic_buyer_sites').all();
    const byId = {};
    buyers.forEach((b) => {
      byId[b.id] = {
        ...b,
        sites: sites.filter((s) => s.domesticBuyerId === b.id).map((s) => ({
          id: s.id,
          siteName: s.siteName,
          shippingAddress: s.shippingAddress,
        })),
      };
    });
    res.json(Object.values(byId));
  });

  router.post('/', (req, res) => {
    const b = req.body;
    if (!b || typeof b !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    const idCheck = validateId(b.id, 'Domestic buyer ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const now = new Date().toISOString();
    db.prepare(
      `INSERT OR REPLACE INTO domestic_buyers (id, name, billingAddress, state, gstNo, mobile, salesPersonName, salesPersonMobile, salesPersonEmail, paymentTerms, createdAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
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
      b.createdAt || now
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
    res.json({ success: true });
    broadcast();
  });

  router.put('/:id', (req, res) => {
    const idCheck = validateId(req.params?.id, 'Domestic buyer ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const b = req.body;
    if (!b || typeof b !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    const existing = db.prepare('SELECT id FROM domestic_buyers WHERE id = ?').get(idCheck.value);
    if (!existing) return res.status(404).json({ success: false, error: 'Domestic buyer not found' });
    db.prepare(
      `UPDATE domestic_buyers SET name=?, billingAddress=?, state=?, gstNo=?, mobile=?, salesPersonName=?, salesPersonMobile=?, salesPersonEmail=?, paymentTerms=?
       WHERE id=?`
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
      idCheck.value
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
    res.json({ success: true });
    broadcast();
  });

  router.post('/import', (req, res) => {
    const body = req.body;
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    if (rows.length === 0) return res.status(400).json({ success: false, error: 'Send { rows: [...] } with row objects' });
    const now = new Date().toISOString();
    const ins = db.prepare(
      'INSERT OR REPLACE INTO domestic_buyers (id, name, billingAddress, state, gstNo, mobile, salesPersonName, salesPersonMobile, salesPersonEmail, paymentTerms, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
    );
    const insSite = db.prepare('INSERT INTO domestic_buyer_sites (id, domesticBuyerId, siteName, shippingAddress) VALUES (?,?,?,?)');
    let count = 0;
    try {
      for (const r of rows) {
        const id = r.id || 'db_' + Math.random().toString(36).slice(2, 11);
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
          now
        );
        count++;
        const sites = Array.isArray(r.sites) ? r.sites : [];
        sites.forEach((s) => {
          const sid = s.id || 's_' + Math.random().toString(36).slice(2, 11);
          insSite.run(sid, id, s.siteName || s.site_name || '', s.shippingAddress || s.shipping_address || '');
        });
      }
      broadcast();
      res.json({ success: true, imported: count });
    } catch (e) {
      console.error('domestic-buyers import:', e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  router.delete('/:id', (req, res) => {
    const idCheck = validateId(req.params?.id, 'Domestic buyer ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    db.prepare('DELETE FROM domestic_buyer_sites WHERE domesticBuyerId = ?').run(idCheck.value);
    db.prepare('DELETE FROM domestic_buyers WHERE id = ?').run(idCheck.value);
    res.json({ success: true });
    broadcast();
  });

  return router;
}

module.exports = createRouter;
