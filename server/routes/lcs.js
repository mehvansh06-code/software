const express = require('express');
const db = require('../db');
const { validateId } = require('../middleware');

function createRouter(broadcast) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const rows = db.prepare('SELECT * FROM lcs').all();
    res.json(rows.map(r => ({
      ...r,
      shipments: (() => { try { return JSON.parse(r.shipments_json || '[]'); } catch (_) { return []; } })(),
      balanceAmount: r.balanceAmount != null ? Number(r.balanceAmount) : (r.amount != null ? Number(r.amount) : undefined)
    })));
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
    res.json({ success: true });
    broadcast();
  });

  router.put('/:id', (req, res) => {
    const idCheck = validateId(req.params && req.params.id, 'LC ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const id = idCheck.value;
    const l = req.body;
    if (!l || typeof l !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    const prev = db.prepare('SELECT status FROM lcs WHERE id = ?').get(id);
    const newStatus = (l.status || '').toUpperCase();
    const stmt = db.prepare(`UPDATE lcs SET status=?, maturityDate=? WHERE id=?`);
    stmt.run(l.status, l.maturityDate, id);
    if ((newStatus === 'HONORED' || newStatus === 'PAID') && prev && prev.status !== newStatus) {
      settleLC(id, l.amount, l.maturityDate || new Date().toISOString().split('T')[0]);
    }
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
