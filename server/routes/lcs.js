const express = require('express');
const db = require('../db');
const { validateId, hasPermission } = require('../middleware');
const { log: auditLog } = require('../services/auditService');

function createRouter(broadcast) {
  const router = express.Router();

  /** Get payment transactions for all LCs with invoice number and payment reference from linked shipment */
  function getLCPaymentSummaryMap() {
    const map = new Map();
    try {
      const rows = db.prepare(`
        SELECT t.id, t.lcId, t.amount, t.currency, t.date, t.type, t.shipmentId, s.invoiceNumber, s.payments_json
        FROM lc_transactions t
        LEFT JOIN shipments s ON s.id = t.shipmentId
        ORDER BY t.lcId, t.date DESC
      `).all();
      const paymentsCache = new Map();
      for (const row of rows) {
        const lcId = row.lcId;
        if (!lcId) continue;
        let reference = null;
        if (row.shipmentId && row.payments_json) {
          try {
            const cacheKey = `${row.shipmentId}::${row.payments_json}`;
            let payments = paymentsCache.get(cacheKey);
            if (!payments) {
              payments = JSON.parse(row.payments_json || '[]');
              paymentsCache.set(cacheKey, payments);
            }
            const rowDate = row.date ? String(row.date).slice(0, 10) : null;
            const match = payments.find(p => {
              if (p.linkedLcId !== lcId || Number(p.amount) !== Number(row.amount)) return false;
              if (!rowDate) return true;
              const pDate = p.date ? String(p.date).slice(0, 10) : null;
              return pDate === rowDate;
            });
            if (match && match.reference) reference = match.reference;
          } catch (_) {}
        }
        const one = {
          id: row.id,
          date: row.date,
          amount: Number(row.amount) || 0,
          currency: row.currency || 'USD',
          type: row.type,
          shipmentId: row.shipmentId || null,
          invoiceNumber: row.invoiceNumber || null,
          reference: reference || null
        };
        if (!map.has(lcId)) map.set(lcId, []);
        map.get(lcId).push(one);
      }
    } catch (e) {
      return map;
    }
    return map;
  }

  router.get('/', hasPermission('lc.view'), (req, res, next) => {
    try {
      const rows = db.prepare('SELECT * FROM lcs').all();
      const paymentSummaryMap = getLCPaymentSummaryMap();
      const result = (Array.isArray(rows) ? rows : []).map(r => {
      const paymentSummary = paymentSummaryMap.get(r.id) || [];
      const totalPaid = paymentSummary.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      const amount = Number(r.amount) || 0;
      const balanceAmount = r.balanceAmount != null ? Number(r.balanceAmount) : amount;
      // Status is derived from payments lodged in shipments: LC is honoured only when that much payment has been made
      const derivedPaid = totalPaid >= amount || balanceAmount <= 0;
      const status = derivedPaid ? 'PAID' : (r.status || 'OPEN');
      return {
        ...r,
        status,
        shipments: (() => { try { return JSON.parse(r.shipments_json || '[]'); } catch (_) { return []; } })(),
        balanceAmount,
        version: r.version != null ? Number(r.version) : 1,
        paymentSummary
      };
    });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  router.post('/', hasPermission('lc.create'), (req, res) => {
    const l = req.body;
    if (!l || typeof l !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    const idCheck = validateId(l.id, 'LC ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const buyerId = l.buyerId || null;
    const supplierId = l.supplierId || null;
    const amountNum = Number(l.amount) || 0;
    try {
      const ins = db.prepare(`INSERT INTO lcs (id, lcNumber, issuingBank, supplierId, buyerId, amount, balanceAmount, currency, issueDate, expiryDate, maturityDate, company, status, remarks, version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      ins.run(idCheck.value, l.lcNumber, l.issuingBank, supplierId, buyerId, amountNum, amountNum, l.currency, l.issueDate, l.expiryDate, l.maturityDate, l.company, l.status, l.remarks || null, 1);
    } catch (e) {
      if (/no such column: balanceAmount/.test(e.message)) {
        const insLegacy = db.prepare(`INSERT INTO lcs (id, lcNumber, issuingBank, supplierId, buyerId, amount, currency, issueDate, expiryDate, maturityDate, company, status, remarks, version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
        insLegacy.run(idCheck.value, l.lcNumber, l.issuingBank, supplierId, buyerId, amountNum, l.currency, l.issueDate, l.expiryDate, l.maturityDate, l.company, l.status, l.remarks || null, 1);
      } else if (/no such column: buyerId/.test(e.message)) {
        db.prepare(`INSERT INTO lcs (id, lcNumber, issuingBank, supplierId, amount, currency, issueDate, expiryDate, maturityDate, company, status, remarks, version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(idCheck.value, l.lcNumber, l.issuingBank, supplierId, amountNum, l.currency, l.issueDate, l.expiryDate, l.maturityDate, l.company, l.status, l.remarks, 1);
      } else if (/UNIQUE constraint failed|SQLITE_CONSTRAINT/.test(e.message || '')) {
        return res.status(409).json({ success: false, error: 'LC already exists. Reload and edit the latest record.' });
      } else throw e;
    }
    const userId = req.user && req.user.id;
    auditLog(db, userId, 'LC_CREATED', idCheck.value, { lcNumber: l.lcNumber, amount: l.amount, currency: l.currency });
    res.json({ success: true, version: 1 });
    broadcast();
  });

  router.put('/:id', hasPermission('lc.edit'), (req, res) => {
    const idCheck = validateId(req.params && req.params.id, 'LC ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const id = idCheck.value;
    const l = req.body;
    if (!l || typeof l !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    const existing = db.prepare('SELECT * FROM lcs WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ success: false, error: 'LC not found' });
    const version = Number(l.version);
    if (!Number.isInteger(version) || version < 1) {
      return res.status(400).json({ success: false, error: 'Version is required for update' });
    }
    const issueDate = l.issueDate != null && l.issueDate !== '' ? l.issueDate : existing.issueDate;
    const expiryDate = l.expiryDate != null && l.expiryDate !== '' ? l.expiryDate : existing.expiryDate;
    const maturityDate = l.maturityDate != null && l.maturityDate !== '' ? l.maturityDate : existing.maturityDate;
    const amount = l.amount != null ? Number(l.amount) || 0 : (Number(existing.amount) || 0);
    const oldAmount = Number(existing.amount) || 0;
    const oldBalance = existing.balanceAmount != null ? Number(existing.balanceAmount) : oldAmount;
    const hasPayments = oldAmount > 0 ? (oldBalance < oldAmount) : false;
    const balanceAmount = hasPayments ? oldBalance : amount;
    let result;
    try {
      const stmt = db.prepare(`
        UPDATE lcs SET
          lcNumber=?, issuingBank=?, supplierId=?, buyerId=?, amount=?, balanceAmount=?, currency=?,
          issueDate=?, expiryDate=?, maturityDate=?, company=?, status=?, remarks=?, version = version + 1
        WHERE id=? AND version=?
      `);
      result = stmt.run(
        l.lcNumber ?? existing.lcNumber,
        l.issuingBank ?? existing.issuingBank,
        l.supplierId ?? existing.supplierId ?? null,
        l.buyerId ?? existing.buyerId ?? null,
        amount,
        balanceAmount,
        l.currency ?? existing.currency,
        issueDate,
        expiryDate,
        maturityDate,
        l.company ?? existing.company,
        l.status ?? existing.status,
        l.remarks != null ? l.remarks : existing.remarks,
        id,
        version
      );
    } catch (e) {
      if (/no such column: balanceAmount|no such column: buyerId/i.test(e.message || '')) {
        const fallback = db.prepare(`
          UPDATE lcs SET
            lcNumber=?, issuingBank=?, supplierId=?, amount=?, currency=?,
            issueDate=?, expiryDate=?, maturityDate=?, company=?, status=?, remarks=?, version = version + 1
          WHERE id=? AND version=?
        `);
        result = fallback.run(
          l.lcNumber ?? existing.lcNumber,
          l.issuingBank ?? existing.issuingBank,
          l.supplierId ?? existing.supplierId ?? null,
          amount,
          l.currency ?? existing.currency,
          issueDate,
          expiryDate,
          maturityDate,
          l.company ?? existing.company,
          l.status ?? existing.status,
          l.remarks != null ? l.remarks : existing.remarks,
          id,
          version
        );
      } else {
        return res.status(500).json({ success: false, error: e.message || 'Failed to update LC' });
      }
    }
    if (!result || result.changes === 0) {
      return res.status(409).json({ success: false, error: 'LC was modified by another user. Please reload and try again.' });
    }
    // Payment against LC is made only from Shipments (payment ledger). Do not settle from tracker.
    const versionRow = db.prepare('SELECT version FROM lcs WHERE id = ?').get(id);
    const userId = req.user && req.user.id;
    auditLog(db, userId, 'LC_UPDATED', id, { lcNumber: l.lcNumber, status: l.status });
    res.json({ success: true, version: versionRow ? versionRow.version : undefined });
    broadcast();
  });

  router.delete('/:id', hasPermission('lc.delete'), (req, res) => {
    const idCheck = validateId(req.params && req.params.id, 'LC ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const id = idCheck.value;
    const row = db.prepare('SELECT id, lcNumber FROM lcs WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ success: false, error: 'LC not found' });
    const linkedCountRow = db.prepare(`
      SELECT COUNT(DISTINCT s.id) AS c
      FROM shipments s
      JOIN json_each(COALESCE(s.payments_json, '[]')) p
      WHERE json_extract(p.value, '$.linkedLcId') = ?
    `).get(id);
    const shipmentsWithPayments = Number(linkedCountRow?.c || 0);
    if (shipmentsWithPayments > 0) {
      return res.status(409).json({
        success: false,
        error: `Cannot delete LC: ${shipmentsWithPayments} shipment(s) have payment(s) lodged against this LC. Remove or unlink those payments first.`
      });
    }
    try {
      db.prepare('DELETE FROM lc_transactions WHERE lcId = ?').run(id);
      db.prepare('DELETE FROM lcs WHERE id = ?').run(id);
    } catch (e) {
      console.error('LC delete error:', e);
      return res.status(500).json({ success: false, error: e.message || 'Failed to delete LC' });
    }
    const userId = req.user && req.user.id;
    auditLog(db, userId, 'LC_DELETED', id, { lcNumber: row.lcNumber });
    res.json({ success: true });
    broadcast();
  });

  return router;
}

module.exports = createRouter;
