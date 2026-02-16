const express = require('express');
const db = require('../db');
const { validateId, hasPermission } = require('../middleware');
const { log: auditLog } = require('../services/auditService');

function createRouter(broadcast) {
  const router = express.Router();

  function parseLicenceRow(r) {
    if (!r) return r;
    const { importProducts_json, exportProducts_json, ...rest } = r;
    return {
      ...rest,
      amountImportUSD: r.amountImportUSD != null ? Number(r.amountImportUSD) : undefined,
      amountImportINR: r.amountImportINR != null ? Number(r.amountImportINR) : undefined,
      importProducts: safeParseJson(importProducts_json, undefined),
      exportProducts: safeParseJson(exportProducts_json, undefined),
    };
  }
  function safeParseJson(str, fallback) {
    if (str == null || str === '') return fallback;
    try {
      const parsed = JSON.parse(str);
      return Array.isArray(parsed) ? parsed : fallback;
    } catch (_) {
      return fallback;
    }
  }

  router.get('/', hasPermission('licences.view'), (req, res) => {
    const rows = db.prepare('SELECT * FROM licences').all();
    res.json(rows.map(parseLicenceRow));
  });

  router.post('/', hasPermission('licences.create'), (req, res) => {
    const l = req.body;
    if (!l || typeof l !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    const idCheck = validateId(l.id, 'Licence ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const importProductsJson = Array.isArray(l.importProducts) ? JSON.stringify(l.importProducts) : null;
    const exportProductsJson = Array.isArray(l.exportProducts) ? JSON.stringify(l.exportProducts) : null;
    const ins = db.prepare('INSERT OR REPLACE INTO licences (id, number, type, issueDate, importValidityDate, expiryDate, dutySaved, eoRequired, eoFulfilled, company, status, amountImportUSD, amountImportINR, importProducts_json, exportProducts_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    ins.run(idCheck.value, l.number || null, l.type, l.issueDate || null, l.importValidityDate || null, l.expiryDate || null, l.dutySaved ?? 0, l.eoRequired ?? 0, l.eoFulfilled ?? 0, l.company || null, l.status || 'ACTIVE', l.amountImportUSD ?? null, l.amountImportINR ?? null, importProductsJson, exportProductsJson);
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
    const importProductsJson = Array.isArray(l.importProducts) ? JSON.stringify(l.importProducts) : null;
    const exportProductsJson = Array.isArray(l.exportProducts) ? JSON.stringify(l.exportProducts) : null;
    db.prepare(`
      UPDATE licences SET
        number=?, type=?, issueDate=?, importValidityDate=?, expiryDate=?,
        dutySaved=?, eoRequired=?, eoFulfilled=?, company=?, status=?,
        amountImportUSD=?, amountImportINR=?, importProducts_json=?, exportProducts_json=?
      WHERE id=?
    `).run(
      l.number ?? null, l.type ?? null, l.issueDate ?? null, l.importValidityDate ?? null, l.expiryDate ?? null,
      l.dutySaved ?? 0, l.eoRequired ?? 0, l.eoFulfilled ?? 0, l.company ?? null, l.status ?? 'ACTIVE',
      l.amountImportUSD ?? null, l.amountImportINR ?? null, importProductsJson, exportProductsJson,
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
