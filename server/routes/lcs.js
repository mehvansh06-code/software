const express = require('express');
const db = require('../db');
const { validateId, hasPermission } = require('../middleware');
const { log: auditLog } = require('../services/auditService');

function createRouter(broadcast) {
  const router = express.Router();

  /** Get payment transactions for an LC with invoice number and payment reference from linked shipment */
  function getLCPaymentSummary(lcId) {
    try {
      const rows = db.prepare(`
        SELECT t.id, t.amount, t.currency, t.date, t.type, t.shipmentId, s.invoiceNumber, s.payments_json
        FROM lc_transactions t
        LEFT JOIN shipments s ON s.id = t.shipmentId
        WHERE t.lcId = ?
        ORDER BY t.date DESC
      `).all(lcId);
      return rows.map(row => {
        let reference = null;
        if (row.shipmentId && row.payments_json) {
          try {
            const payments = JSON.parse(row.payments_json || '[]');
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
        return {
          id: row.id,
          date: row.date,
          amount: Number(row.amount) || 0,
          currency: row.currency || 'USD',
          type: row.type,
          shipmentId: row.shipmentId || null,
          invoiceNumber: row.invoiceNumber || null,
          reference: reference || null
        };
      });
    } catch (e) {
      return [];
    }
  }

  router.get('/', hasPermission('lc.view'), (req, res) => {
    const rows = db.prepare('SELECT * FROM lcs').all();
    res.json(rows.map(r => {
      const paymentSummary = getLCPaymentSummary(r.id);
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
        paymentSummary
      };
    }));
  });

  router.post('/', (req, res) => {
    const l = req.body;
    if (!l || typeof l !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    const idCheck = validateId(l.id, 'LC ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const buyerId = l.buyerId || null;
    const supplierId = l.supplierId || null;
    try {
      const ins = db.prepare(`INSERT OR REPLACE INTO lcs (id, lcNumber, issuingBank, supplierId, buyerId, amount, currency, issueDate, expiryDate, maturityDate, company, status, remarks) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      ins.run(idCheck.value, l.lcNumber, l.issuingBank, supplierId, buyerId, l.amount, l.currency, l.issueDate, l.expiryDate, l.maturityDate, l.company, l.status, l.remarks || null);
    } catch (e) {
      if (/no such column: buyerId/.test(e.message)) {
        db.prepare(`INSERT OR REPLACE INTO lcs VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(idCheck.value, l.lcNumber, l.issuingBank, supplierId, l.amount, l.currency, l.issueDate, l.expiryDate, l.maturityDate, l.company, l.status, l.remarks);
      } else throw e;
    }
    const userId = req.user && req.user.id;
    auditLog(db, userId, 'LC_CREATED', idCheck.value, { lcNumber: l.lcNumber, amount: l.amount, currency: l.currency });
    res.json({ success: true });
    broadcast();
  });

  router.put('/:id', hasPermission('lc.edit'), (req, res) => {
    const idCheck = validateId(req.params && req.params.id, 'LC ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const id = idCheck.value;
    const l = req.body;
    if (!l || typeof l !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    const prev = db.prepare('SELECT status FROM lcs WHERE id = ?').get(id);
    const newStatus = (l.status || '').toUpperCase();
    const issueDate = l.issueDate != null && l.issueDate !== '' ? l.issueDate : null;
    const expiryDate = l.expiryDate != null && l.expiryDate !== '' ? l.expiryDate : null;
    const maturityDate = l.maturityDate != null && l.maturityDate !== '' ? l.maturityDate : null;
    const stmt = db.prepare('UPDATE lcs SET status=?, issueDate=?, expiryDate=?, maturityDate=? WHERE id=?');
    const existing = db.prepare('SELECT issueDate, expiryDate, maturityDate FROM lcs WHERE id = ?').get(id);
    stmt.run(
      l.status,
      issueDate != null ? issueDate : (existing && existing.issueDate),
      expiryDate != null ? expiryDate : (existing && existing.expiryDate),
      maturityDate != null ? maturityDate : (existing && existing.maturityDate),
      id
    );
    // Payment against LC is made only from Shipments (payment ledger). Do not settle from tracker.
    const userId = req.user && req.user.id;
    auditLog(db, userId, 'LC_UPDATED', id, { lcNumber: l.lcNumber, status: l.status });
    res.json({ success: true });
    broadcast();
  });

  router.delete('/:id', hasPermission('lc.delete'), (req, res) => {
    const idCheck = validateId(req.params && req.params.id, 'LC ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const id = idCheck.value;
    const row = db.prepare('SELECT id, lcNumber FROM lcs WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ success: false, error: 'LC not found' });
    const shipmentRows = db.prepare('SELECT id, payments_json FROM shipments').all();
    let shipmentsWithPayments = 0;
    for (const sh of shipmentRows) {
      let payments = [];
      try {
        payments = JSON.parse(sh.payments_json || '[]');
      } catch (_) {}
      if (!Array.isArray(payments)) continue;
      const hasLinkedPayment = payments.some(p => p && String(p.linkedLcId) === String(id));
      if (hasLinkedPayment) shipmentsWithPayments++;
    }
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

  function settleLC(lcId, amount, date) {
    let row;
    try {
      row = db.prepare('SELECT * FROM lcs WHERE id = ?').get(lcId);
    } catch (e) { return; }
    if (!row) return;
    const isExport = !!(row.buyerId && !row.supplierId);
    const txType = isExport ? 'CREDIT' : 'DEBIT';
    const shipmentIds = (() => { try { return JSON.parse(row.shipments_json || '[]'); } catch (_) { return []; } })();
    const txId = 'tx_' + Math.random().toString(36).substr(2, 9);
    const now = new Date().toISOString();
    try {
      db.prepare('INSERT INTO lc_transactions (id, lcId, amount, currency, date, type, createdAt) VALUES (?,?,?,?,?,?,?)').run(
        txId, lcId, amount || row.amount, row.currency || 'USD', date || new Date().toISOString().split('T')[0], txType, now
      );
    } catch (e) {
      console.warn('settleLC insert transaction:', e.message);
    }
    for (const sid of shipmentIds) {
      try {
        const shRow = db.prepare('SELECT * FROM shipments WHERE id = ?').get(sid);
        if (!shRow) continue;
        const payments = (() => { try { return JSON.parse(shRow.payments_json || '[]'); } catch (_) { return []; } })();
        const payId = 'pay_' + Math.random().toString(36).substr(2, 9);
        const amt = Number(shRow.amount) || 0;
        payments.push({
          id: payId,
          date: date || new Date().toISOString().split('T')[0],
          amount: amt,
          currency: shRow.currency || 'USD',
          reference: 'LC Settled: ' + (row.lcNumber || lcId),
          received: true,
          adviceUploaded: false
        });
        db.prepare('UPDATE shipments SET payments_json = ? WHERE id = ?').run(JSON.stringify(payments), sid);
      } catch (e) {
        console.warn('settleLC update shipment', sid, e.message);
      }
    }
    broadcast();
  }

  return router;
}

module.exports = createRouter;
