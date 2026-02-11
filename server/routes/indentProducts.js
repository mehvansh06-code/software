const express = require('express');
const db = require('../db');
const { validateId } = require('../middleware');

function createRouter(broadcast) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const rows = db.prepare('SELECT * FROM indent_products ORDER BY quality, designNo, shadeNo').all();
    res.json(rows.map((r) => ({
      id: r.id,
      quality: r.quality,
      description: r.description || '',
      designNo: r.designNo || '',
      shadeNo: r.shadeNo || '',
      hsnCode: r.hsnCode || '',
      unit: r.unit || 'MTR',
      rateInr: r.rateInr ?? 0,
      rateUsd: r.rateUsd ?? 0,
      rateGbp: r.rateGbp ?? 0,
    })));
  });

  router.post('/', (req, res) => {
    const p = req.body;
    if (!p || typeof p !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    const idCheck = validateId(p.id, 'Product ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    db.prepare(
      `INSERT OR REPLACE INTO indent_products (id, quality, description, designNo, shadeNo, hsnCode, unit, rateInr, rateUsd, rateGbp)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).run(
      idCheck.value,
      p.quality || '',
      p.description || '',
      p.designNo || '',
      p.shadeNo || '',
      p.hsnCode || '',
      p.unit || 'MTR',
      p.rateInr ?? 0,
      p.rateUsd ?? 0,
      p.rateGbp ?? 0
    );
    res.json({ success: true });
    broadcast();
  });

  router.put('/:id', (req, res) => {
    const idCheck = validateId(req.params?.id, 'Product ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const p = req.body;
    if (!p || typeof p !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    const existing = db.prepare('SELECT id FROM indent_products WHERE id = ?').get(idCheck.value);
    if (!existing) return res.status(404).json({ success: false, error: 'Product not found' });
    db.prepare(
      `UPDATE indent_products SET quality=?, description=?, designNo=?, shadeNo=?, hsnCode=?, unit=?, rateInr=?, rateUsd=?, rateGbp=? WHERE id=?`
    ).run(
      p.quality || '',
      p.description || '',
      p.designNo || '',
      p.shadeNo || '',
      p.hsnCode || '',
      p.unit || 'MTR',
      p.rateInr ?? 0,
      p.rateUsd ?? 0,
      p.rateGbp ?? 0,
      idCheck.value
    );
    res.json({ success: true });
    broadcast();
  });

  router.post('/import', (req, res) => {
    const body = req.body;
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    if (rows.length === 0) return res.status(400).json({ success: false, error: 'Send { rows: [...] } with row objects' });
    const ins = db.prepare(
      'INSERT OR REPLACE INTO indent_products (id, quality, description, designNo, shadeNo, hsnCode, unit, rateInr, rateUsd, rateGbp) VALUES (?,?,?,?,?,?,?,?,?,?)'
    );
    let count = 0;
    try {
      for (const r of rows) {
        const id = r.id || 'ip_' + Math.random().toString(36).slice(2, 11);
        ins.run(
          id,
          r.quality || '',
          r.description || r.desc || '',
          r.designNo || r.design_no || r.design || '',
          r.shadeNo || r.shade_no || r.shade || '',
          r.hsnCode || r.hsn_code || r.hsn || '',
          r.unit || 'MTR',
          r.rateInr ?? r.rate_inr ?? 0,
          r.rateUsd ?? r.rate_usd ?? 0,
          r.rateGbp ?? r.rate_gbp ?? 0
        );
        count++;
      }
      broadcast();
      res.json({ success: true, imported: count });
    } catch (e) {
      console.error('indent-products import:', e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  router.delete('/:id', (req, res) => {
    const idCheck = validateId(req.params?.id, 'Product ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    db.prepare('DELETE FROM indent_products WHERE id = ?').run(idCheck.value);
    res.json({ success: true });
    broadcast();
  });

  return router;
}

module.exports = createRouter;
