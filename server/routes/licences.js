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
      version: r.version != null ? Number(r.version) : 1,
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

  router.get('/', hasPermission('licences.view'), (req, res, next) => {
    try {
      const rows = db.prepare('SELECT * FROM licences').all();
      res.json((Array.isArray(rows) ? rows : []).map(parseLicenceRow));
    } catch (e) {
      next(e);
    }
  });

  router.post('/', hasPermission('licences.create'), (req, res) => {
    const l = req.body;
    if (!l || typeof l !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    const idCheck = validateId(l.id, 'Licence ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const importProductsJson = Array.isArray(l.importProducts) ? JSON.stringify(l.importProducts) : null;
    const exportProductsJson = Array.isArray(l.exportProducts) ? JSON.stringify(l.exportProducts) : null;
    const ins = db.prepare('INSERT INTO licences (id, number, type, issueDate, importValidityDate, expiryDate, dutySaved, eoRequired, eoFulfilled, company, status, amountImportUSD, amountImportINR, importProducts_json, exportProducts_json, version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    try {
      ins.run(idCheck.value, l.number || null, l.type, l.issueDate || null, l.importValidityDate || null, l.expiryDate || null, l.dutySaved ?? 0, l.eoRequired ?? 0, l.eoFulfilled ?? 0, l.company || null, l.status || 'ACTIVE', l.amountImportUSD ?? null, l.amountImportINR ?? null, importProductsJson, exportProductsJson, 1);
    } catch (e) {
      if (/UNIQUE constraint failed|SQLITE_CONSTRAINT/.test(e.message || '')) {
        return res.status(409).json({ success: false, error: 'Licence already exists. Reload and edit the latest record.' });
      }
      return res.status(500).json({ success: false, error: e.message || 'Failed to create licence' });
    }
    const userId = req.user && req.user.id;
    auditLog(db, userId, 'LICENCE_CREATED', idCheck.value, { number: l.number, type: l.type, company: l.company });
    res.json({ success: true, version: 1 });
    broadcast();
  });

  router.put('/:id', hasPermission('licences.edit'), (req, res) => {
    const idCheck = validateId(req.params && req.params.id, 'Licence ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const l = req.body;
    if (!l || typeof l !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    const existing = db.prepare('SELECT id, version FROM licences WHERE id = ?').get(idCheck.value);
    if (!existing) return res.status(404).json({ success: false, error: 'Licence not found' });
    const version = Number(l.version);
    if (!Number.isInteger(version) || version < 1) {
      return res.status(400).json({ success: false, error: 'Version is required for update' });
    }
    const importProductsJson = Array.isArray(l.importProducts) ? JSON.stringify(l.importProducts) : null;
    const exportProductsJson = Array.isArray(l.exportProducts) ? JSON.stringify(l.exportProducts) : null;
    const result = db.prepare(`
      UPDATE licences SET
        number=?, type=?, issueDate=?, importValidityDate=?, expiryDate=?,
        dutySaved=?, eoRequired=?, eoFulfilled=?, company=?, status=?,
        amountImportUSD=?, amountImportINR=?, importProducts_json=?, exportProducts_json=?,
        version = version + 1
      WHERE id=? AND version=?
    `).run(
      l.number ?? null, l.type ?? null, l.issueDate ?? null, l.importValidityDate ?? null, l.expiryDate ?? null,
      l.dutySaved ?? 0, l.eoRequired ?? 0, l.eoFulfilled ?? 0, l.company ?? null, l.status ?? 'ACTIVE',
      l.amountImportUSD ?? null, l.amountImportINR ?? null, importProductsJson, exportProductsJson,
      idCheck.value, version
    );
    if (result.changes === 0) {
      return res.status(409).json({ success: false, error: 'Licence was modified by another user. Please reload and try again.' });
    }
    const versionRow = db.prepare('SELECT version FROM licences WHERE id = ?').get(idCheck.value);
    const userId = req.user && req.user.id;
    auditLog(db, userId, 'LICENCE_UPDATED', idCheck.value, { number: l.number, type: l.type, status: l.status });
    res.json({ success: true, version: versionRow ? versionRow.version : undefined });
    broadcast();
  });

  router.delete('/:id', hasPermission('licences.delete'), (req, res) => {
    const idCheck = validateId(req.params && req.params.id, 'Licence ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const id = idCheck.value;
    try {
      const row = db.prepare('SELECT number, type, company FROM licences WHERE id = ?').get(id);
      if (!row) return res.status(404).json({ success: false, error: 'Licence not found' });
      const linked = db.prepare(
        'SELECT COUNT(*) AS n FROM shipments WHERE linkedLicenceId = ? OR epcgLicenceId = ? OR advLicenceId = ?'
      ).get(id, id, id);
      const count = linked && linked.n != null ? Number(linked.n) : 0;
      if (count > 0) {
        return res.status(409).json({
          success: false,
          error: `Cannot delete licence: ${count} shipment(s) are linked. Unlink them first.`
        });
      }
      db.prepare('DELETE FROM licences WHERE id = ?').run(id);
      const userId = req.user && req.user.id;
      auditLog(db, userId, 'LICENCE_DELETED', id, { number: row.number, type: row.type, company: row.company });
      res.json({ success: true });
      broadcast();
    } catch (e) {
      console.error('DELETE /licences/:id', e);
      res.status(500).json({ success: false, error: e.message || 'Failed to delete licence' });
    }
  });

  return router;
}

module.exports = createRouter;
