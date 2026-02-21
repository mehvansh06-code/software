const express = require('express');
const db = require('../db');
const { validateId, hasPermission } = require('../middleware');
const { log: auditLog } = require('../services/auditService');
const { stringValue, parseFiniteNumber, parseHsnCode } = require('../utils/importValidation');

function createRouter(broadcast) {
  const router = express.Router();

  router.get('/', hasPermission('indent.view'), (req, res) => {
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
      version: r.version != null ? Number(r.version) : 1,
    })));
  });

  router.post('/', hasPermission('indent.create'), (req, res) => {
    const p = req.body;
    if (!p || typeof p !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    const idCheck = validateId(p.id, 'Product ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    try {
      db.prepare(
        `INSERT INTO indent_products (id, quality, description, designNo, shadeNo, hsnCode, unit, rateInr, rateUsd, rateGbp, version)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`
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
        p.rateGbp ?? 0,
        1
      );
    } catch (e) {
      if (/UNIQUE constraint failed|SQLITE_CONSTRAINT/.test(e.message || '')) {
        return res.status(409).json({ success: false, error: 'Indent product already exists. Reload and edit the latest record.' });
      }
      return res.status(500).json({ success: false, error: e.message || 'Failed to create indent product' });
    }
    const userId = req.user && req.user.id;
    auditLog(db, userId, 'INDENT_PRODUCT_CREATED', idCheck.value, { quality: p.quality, designNo: p.designNo, shadeNo: p.shadeNo });
    res.json({ success: true, version: 1 });
    broadcast();
  });

  router.put('/:id', hasPermission('indent.edit'), (req, res) => {
    const idCheck = validateId(req.params?.id, 'Product ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const p = req.body;
    if (!p || typeof p !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    const existing = db.prepare('SELECT id, version FROM indent_products WHERE id = ?').get(idCheck.value);
    if (!existing) return res.status(404).json({ success: false, error: 'Product not found' });
    const version = Number(p.version);
    if (!Number.isInteger(version) || version < 1) {
      return res.status(400).json({ success: false, error: 'Version is required for update' });
    }
    const result = db.prepare(
      `UPDATE indent_products
       SET quality=?, description=?, designNo=?, shadeNo=?, hsnCode=?, unit=?, rateInr=?, rateUsd=?, rateGbp=?, version = version + 1
       WHERE id=? AND version=?`
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
      idCheck.value,
      version
    );
    if (result.changes === 0) {
      return res.status(409).json({ success: false, error: 'Indent product was modified by another user. Please reload and try again.' });
    }
    const versionRow = db.prepare('SELECT version FROM indent_products WHERE id = ?').get(idCheck.value);
    const userId = req.user && req.user.id;
    auditLog(db, userId, 'INDENT_PRODUCT_UPDATED', idCheck.value, { quality: p.quality, designNo: p.designNo, shadeNo: p.shadeNo });
    res.json({ success: true, version: versionRow ? versionRow.version : undefined });
    broadcast();
  });

  router.post('/import', hasPermission('indent.create'), (req, res) => {
    const body = req.body;
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    if (rows.length === 0) return res.status(400).json({ success: false, error: 'Send { rows: [...] } with row objects' });
    const ins = db.prepare(
      'INSERT INTO indent_products (id, quality, description, designNo, shadeNo, hsnCode, unit, rateInr, rateUsd, rateGbp, version) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
    );
    let count = 0;
    let skipped = 0;
    try {
      const validationErrors = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i] || {};
        const rowNo = i + 2;
        if (!stringValue(r.quality || r.Quality)) validationErrors.push(`Row ${rowNo}: Quality is required.`);
        const hsnRes = parseHsnCode(r.hsnCode || r.hsn_code || r.hsn || '', { allowEmpty: true, allowedLengths: [4, 6, 8], maxLength: 8 });
        if (!hsnRes.ok) validationErrors.push(`Row ${rowNo}: ${hsnRes.error}`);
        const inrRes = parseFiniteNumber(r.rateInr ?? r.rate_inr, 'Rate INR', { min: 0, allowBlank: true });
        const usdRes = parseFiniteNumber(r.rateUsd ?? r.rate_usd, 'Rate USD', { min: 0, allowBlank: true });
        const gbpRes = parseFiniteNumber(r.rateGbp ?? r.rate_gbp, 'Rate GBP', { min: 0, allowBlank: true });
        if (!inrRes.ok) validationErrors.push(`Row ${rowNo}: ${inrRes.error}`);
        if (!usdRes.ok) validationErrors.push(`Row ${rowNo}: ${usdRes.error}`);
        if (!gbpRes.ok) validationErrors.push(`Row ${rowNo}: ${gbpRes.error}`);
      }
      if (validationErrors.length > 0) {
        return res.status(400).json({ success: false, error: `Import validation failed:\n${validationErrors.slice(0, 25).join('\n')}` });
      }

      for (const r of rows) {
        const id = r.id || 'ip_' + Math.random().toString(36).slice(2, 11);
        const hsnRes = parseHsnCode(r.hsnCode || r.hsn_code || r.hsn || '', { allowEmpty: true, allowedLengths: [4, 6, 8], maxLength: 8 });
        const inrRes = parseFiniteNumber(r.rateInr ?? r.rate_inr, 'Rate INR', { min: 0, allowBlank: true });
        const usdRes = parseFiniteNumber(r.rateUsd ?? r.rate_usd, 'Rate USD', { min: 0, allowBlank: true });
        const gbpRes = parseFiniteNumber(r.rateGbp ?? r.rate_gbp, 'Rate GBP', { min: 0, allowBlank: true });
        try {
          ins.run(
            id,
            stringValue(r.quality || r.Quality),
            r.description || r.desc || '',
            r.designNo || r.design_no || r.design || '',
            r.shadeNo || r.shade_no || r.shade || '',
            hsnRes.value || '',
            r.unit || 'MTR',
            inrRes.value ?? 0,
            usdRes.value ?? 0,
            gbpRes.value ?? 0,
            1
          );
          count++;
        } catch (e) {
          if (/UNIQUE constraint failed|SQLITE_CONSTRAINT/.test(e.message || '')) {
            skipped++;
            continue;
          }
          throw e;
        }
      }
      const userId = req.user && req.user.id;
      auditLog(db, userId, 'INDENT_PRODUCTS_IMPORTED', null, { imported: count, skipped });
      broadcast();
      res.json({ success: true, imported: count, skipped });
    } catch (e) {
      console.error('indent-products import:', e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  router.delete('/:id', hasPermission('indent.delete'), (req, res) => {
    const idCheck = validateId(req.params?.id, 'Product ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const row = db.prepare('SELECT id, quality, designNo, shadeNo FROM indent_products WHERE id = ?').get(idCheck.value);
    if (!row) return res.status(404).json({ success: false, error: 'Product not found' });
    db.prepare('DELETE FROM indent_products WHERE id = ?').run(idCheck.value);
    const userId = req.user && req.user.id;
    auditLog(db, userId, 'INDENT_PRODUCT_DELETED', idCheck.value, { quality: row.quality, designNo: row.designNo, shadeNo: row.shadeNo });
    res.json({ success: true });
    broadcast();
  });

  return router;
}

module.exports = createRouter;
