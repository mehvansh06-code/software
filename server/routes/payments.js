const express = require('express');
const db = require('../db');
const { hasPermission, asyncHandler } = require('../middleware');

const router = express.Router();
const EPS = 0.0001;

function fromCents(x) {
  if (x == null || x === undefined) return 0;
  const n = Number(x);
  if (Number.isNaN(n)) return 0;
  return n / 100;
}

function parseJsonSafe(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed != null ? parsed : fallback;
  } catch (_) {
    return fallback;
  }
}

function clampDays(input, fallback = 30) {
  const n = Number.parseInt(String(input ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(90, n));
}

function toYmd(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function amountToCurrency(amount, fromCurrency, toCurrency, exchangeRate) {
  const val = Number(amount) || 0;
  const from = String(fromCurrency || '').toUpperCase();
  const to = String(toCurrency || '').toUpperCase();
  const fx = Number(exchangeRate) || 1;
  if (!val) return 0;
  if (from === to) return val;
  if (from === 'INR' && to !== 'INR') return val / fx;
  if (to === 'INR' && from !== 'INR') return val * fx;
  return val;
}

function getDayLabel(daysUntil) {
  if (daysUntil < 0) return `Overdue by ${Math.abs(daysUntil)} day${Math.abs(daysUntil) === 1 ? '' : 's'}`;
  if (daysUntil === 0) return 'Due today';
  if (daysUntil === 1) return 'Due in 1 day';
  return `Due in ${daysUntil} days`;
}

function getDaysUntil(todayStart, ymdDate) {
  const due = new Date(`${ymdDate}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  return Math.ceil((due.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));
}

function isYmdInWindow(ymd, fromYmd, toYmd) {
  if (!ymd) return false;
  return String(ymd) >= fromYmd && String(ymd) <= toYmd;
}

function getDirectionRows(kind, fromYmd, toYmd) {
  const isOutgoing = kind === 'OUTGOING';
  const partyField = isOutgoing ? 'supplierId' : 'buyerId';
  const partyNameTable = isOutgoing ? 'suppliers' : 'buyers';
  const partyNameAlias = isOutgoing ? 'sup' : 'b';
  const labelFallback = isOutgoing ? 'Unknown Supplier' : 'Unknown Customer';

  const rows = db.prepare(`
    SELECT
      sh.id,
      sh.invoiceNumber,
      sh.currency,
      sh.exchangeRate,
      sh.amount,
      sh.fobValueFC,
      sh.paymentDueDate,
      sh.payments_json,
      ${partyNameAlias}.name AS entityName
    FROM shipments sh
    LEFT JOIN ${partyNameTable} ${partyNameAlias} ON ${partyNameAlias}.id = sh.${partyField}
    WHERE sh.${partyField} IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM shipment_installments si
        WHERE si.shipmentId = sh.id
          AND si.kind = ?
          AND si.dueDate >= ?
          AND si.dueDate <= ?
      )
    ORDER BY sh.createdAt DESC
  `).all(kind, fromYmd, toYmd);

  const ids = rows.map((r) => r.id).filter(Boolean);
  const installmentMap = new Map();
  if (ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    const instRows = db.prepare(
      `SELECT id, shipmentId, kind, dueDate, plannedAmountFC, currency, notes, sortOrder, createdAt
       FROM shipment_installments
       WHERE kind = ? AND shipmentId IN (${placeholders})
       ORDER BY dueDate ASC, sortOrder ASC, createdAt ASC`
    ).all(kind, ...ids);
    for (const inst of instRows) {
      if (!installmentMap.has(inst.shipmentId)) installmentMap.set(inst.shipmentId, []);
      installmentMap.get(inst.shipmentId).push(inst);
    }
  }

  return { rows, installmentMap, labelFallback };
}

function getLcRows(kind, fromYmd, toYmd) {
  const isOutgoing = kind === 'OUTGOING';
  const partyField = isOutgoing ? 'supplierId' : 'buyerId';
  const partyNameTable = isOutgoing ? 'suppliers' : 'buyers';
  const partyNameAlias = isOutgoing ? 'sup' : 'b';
  const labelFallback = isOutgoing ? 'Unknown Supplier' : 'Unknown Customer';

  const rows = db.prepare(`
    SELECT
      lc.id,
      lc.lcNumber,
      lc.currency,
      lc.amount,
      lc.balanceAmount,
      lc.maturityDate,
      lc.company,
      lc.shipments_json,
      ${partyNameAlias}.name AS entityName
    FROM lcs lc
    LEFT JOIN ${partyNameTable} ${partyNameAlias} ON ${partyNameAlias}.id = lc.${partyField}
    WHERE lc.${partyField} IS NOT NULL
      AND lc.maturityDate IS NOT NULL
      AND lc.maturityDate >= ?
      AND lc.maturityDate <= ?
    ORDER BY lc.maturityDate ASC
  `).all(fromYmd, toYmd);

  return { rows, labelFallback };
}

function buildCashflowItems({ start, fromYmd, toYmd, kind }) {
  const isOutgoing = kind === 'OUTGOING';
  const { rows, installmentMap, labelFallback } = getDirectionRows(kind, fromYmd, toYmd);
  const items = [];
  let totalInr = 0;

  for (const row of rows) {
    const shipmentCurrency = row.currency || 'USD';
    const amountMajor = fromCents(row.amount);
    const fobMajor = fromCents(row.fobValueFC);
    const totalDue = Number(isOutgoing ? amountMajor : (row.fobValueFC != null ? fobMajor : amountMajor)) || 0;

    const payments = parseJsonSafe(row.payments_json, []);
    const paidOrReceived = Array.isArray(payments)
      ? payments
          .filter((p) => (isOutgoing ? true : p && p.received === true))
          .reduce(
            (sum, p) => sum + amountToCurrency(p?.amount, p?.currency || shipmentCurrency, shipmentCurrency, row.exchangeRate),
            0
          )
      : 0;

    let remainingApplied = Math.max(0, paidOrReceived);
    const installments = installmentMap.get(row.id) || [];
    for (const inst of installments) {
      const planned = Math.max(
        0,
        amountToCurrency(inst.plannedAmountFC, inst.currency || shipmentCurrency, shipmentCurrency, row.exchangeRate)
      );
      const adjustedPaid = Math.min(remainingApplied, planned);
      remainingApplied = Math.max(0, remainingApplied - adjustedPaid);
      const pending = Math.max(0, planned - adjustedPaid);
      if (pending <= EPS) continue;
      if (!isYmdInWindow(inst.dueDate, fromYmd, toYmd)) continue;
      const daysUntil = getDaysUntil(start, inst.dueDate);
      if (daysUntil == null) continue;
      const inrAmount = amountToCurrency(pending, shipmentCurrency, 'INR', row.exchangeRate);
      totalInr += inrAmount;
      items.push({
        rowType: 'INSTALLMENT',
        installmentId: inst.id,
        shipmentId: row.id,
        entityName: row.entityName || labelFallback,
        invoiceNumber: row.invoiceNumber || 'NA',
        amount: Number(pending.toFixed(2)),
        pendingAmount: Number(pending.toFixed(2)),
        currency: shipmentCurrency,
        dueDate: String(inst.dueDate || ''),
        daysUntil,
        status: getDayLabel(daysUntil),
        direction: isOutgoing ? 'outgoing' : 'incoming',
        amountInr: Number(inrAmount.toFixed(2)),
        ...(isOutgoing
          ? { paidAmount: Number(paidOrReceived.toFixed(2)) }
          : { receivedAmount: Number(paidOrReceived.toFixed(2)) }),
        company: row.company || null,
      });
    }
  }

  const { rows: lcRows, labelFallback: lcLabelFallback } = getLcRows(kind, fromYmd, toYmd);
  for (const lc of lcRows) {
    const dueDate = String(lc.maturityDate || '');
    const daysUntil = getDaysUntil(start, dueDate);
    if (daysUntil == null) continue;
    const pending = Math.max(0, Number(lc.balanceAmount != null ? lc.balanceAmount : lc.amount) || 0);
    if (pending <= EPS) continue;
    let mappedShipmentId = `LC:${lc.id}`;
    let fx = 1;
    try {
      const shipIds = parseJsonSafe(lc.shipments_json, []);
      if (Array.isArray(shipIds) && shipIds.length > 0 && shipIds[0]) {
        const shId = String(shipIds[0]);
        const sh = db.prepare('SELECT id, exchangeRate FROM shipments WHERE id = ?').get(shId);
        if (sh?.id) {
          mappedShipmentId = String(sh.id);
          fx = Number(sh.exchangeRate) || 1;
        }
      }
    } catch (_) {}
    const inrAmount = amountToCurrency(pending, lc.currency || 'USD', 'INR', fx);
    totalInr += inrAmount;
    items.push({
      rowType: 'LC',
      installmentId: null,
      lcId: lc.id,
      shipmentId: mappedShipmentId,
      entityName: lc.entityName || lcLabelFallback,
      invoiceNumber: lc.lcNumber ? `LC ${lc.lcNumber}` : 'LC',
      amount: Number(pending.toFixed(2)),
      pendingAmount: Number(pending.toFixed(2)),
      currency: lc.currency || 'USD',
      dueDate,
      daysUntil,
      status: getDayLabel(daysUntil),
      direction: isOutgoing ? 'outgoing' : 'incoming',
      amountInr: Number(inrAmount.toFixed(2)),
      company: lc.company || null,
    });
  }

  items.sort((a, b) => {
    if (a.dueDate < b.dueDate) return -1;
    if (a.dueDate > b.dueDate) return 1;
    return String(a.invoiceNumber || '').localeCompare(String(b.invoiceNumber || ''));
  });

  return {
    items,
    summary: {
      count: items.length,
      totalInr: Number(totalInr.toFixed(2)),
    },
  };
}

router.get('/outgoing', hasPermission('shipments.view'), asyncHandler(async (req, res) => {
  const days = clampDays(req.query.days, 30);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  const fromYmd = toYmd(start);
  const toYmdDate = toYmd(end);

  const result = buildCashflowItems({ start, fromYmd, toYmd: toYmdDate, kind: 'OUTGOING' });
  res.json({ windowDays: days, ...result });
}));

router.get('/incoming', hasPermission('shipments.view'), asyncHandler(async (req, res) => {
  const days = clampDays(req.query.days, 30);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  const fromYmd = toYmd(start);
  const toYmdDate = toYmd(end);

  const result = buildCashflowItems({ start, fromYmd, toYmd: toYmdDate, kind: 'INCOMING' });
  res.json({ windowDays: days, ...result });
}));

module.exports = () => router;
