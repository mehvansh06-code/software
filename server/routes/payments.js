const express = require('express');
const db = require('../db');
const { hasPermission, asyncHandler } = require('../middleware');

const router = express.Router();

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

router.get('/outgoing', hasPermission('shipments.view'), asyncHandler(async (req, res) => {
  const days = clampDays(req.query.days, 30);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  const fromYmd = toYmd(start);
  const toYmdDate = toYmd(end);

  const rows = db.prepare(`
    SELECT
      sh.id,
      sh.invoiceNumber,
      sh.currency,
      sh.exchangeRate,
      sh.amount,
      sh.paymentDueDate,
      sh.payments_json,
      sup.name AS entityName
    FROM shipments sh
    LEFT JOIN suppliers sup ON sup.id = sh.supplierId
    WHERE sh.supplierId IS NOT NULL
      AND sh.paymentDueDate IS NOT NULL
      AND sh.paymentDueDate >= ?
      AND sh.paymentDueDate <= ?
    ORDER BY sh.paymentDueDate ASC, sh.createdAt DESC
  `).all(fromYmd, toYmdDate);

  const items = [];
  let totalInr = 0;

  for (const row of rows) {
    const dueDate = String(row.paymentDueDate || '');
    const daysUntil = getDaysUntil(start, dueDate);
    if (daysUntil == null) continue;

    const totalDue = Number(row.amount) || 0;
    const payments = parseJsonSafe(row.payments_json, []);
    const paid = Array.isArray(payments)
      ? payments.reduce((sum, p) => sum + amountToCurrency(p?.amount, p?.currency || row.currency, row.currency, row.exchangeRate), 0)
      : 0;
    const outstanding = Math.max(0, totalDue - paid);
    if (outstanding <= 0.0001) continue;

    const inrAmount = amountToCurrency(outstanding, row.currency, 'INR', row.exchangeRate);
    totalInr += inrAmount;

    items.push({
      shipmentId: row.id,
      entityName: row.entityName || 'Unknown Supplier',
      invoiceNumber: row.invoiceNumber || 'NA',
      amount: Number(outstanding.toFixed(2)),
      currency: row.currency || 'USD',
      dueDate,
      daysUntil,
      status: getDayLabel(daysUntil),
      direction: 'outgoing',
      amountInr: Number(inrAmount.toFixed(2)),
    });
  }

  res.json({
    windowDays: days,
    items,
    summary: {
      count: items.length,
      totalInr: Number(totalInr.toFixed(2)),
    },
  });
}));

router.get('/incoming', hasPermission('shipments.view'), asyncHandler(async (req, res) => {
  const days = clampDays(req.query.days, 30);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  const fromYmd = toYmd(start);
  const toYmdDate = toYmd(end);

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
      b.name AS entityName
    FROM shipments sh
    LEFT JOIN buyers b ON b.id = sh.buyerId
    WHERE sh.buyerId IS NOT NULL
      AND sh.paymentDueDate IS NOT NULL
      AND sh.paymentDueDate >= ?
      AND sh.paymentDueDate <= ?
    ORDER BY sh.paymentDueDate ASC, sh.createdAt DESC
  `).all(fromYmd, toYmdDate);

  const items = [];
  let totalInr = 0;

  for (const row of rows) {
    const dueDate = String(row.paymentDueDate || '');
    const daysUntil = getDaysUntil(start, dueDate);
    if (daysUntil == null) continue;

    const totalDue = Number(row.fobValueFC != null ? row.fobValueFC : row.amount) || 0;
    const payments = parseJsonSafe(row.payments_json, []);
    const received = Array.isArray(payments)
      ? payments
          .filter((p) => p && p.received === true)
          .reduce((sum, p) => sum + amountToCurrency(p?.amount, p?.currency || row.currency, row.currency, row.exchangeRate), 0)
      : 0;
    const outstanding = Math.max(0, totalDue - received);
    if (outstanding <= 0.0001) continue;

    const inrAmount = amountToCurrency(outstanding, row.currency, 'INR', row.exchangeRate);
    totalInr += inrAmount;

    items.push({
      shipmentId: row.id,
      entityName: row.entityName || 'Unknown Customer',
      invoiceNumber: row.invoiceNumber || 'NA',
      amount: Number(outstanding.toFixed(2)),
      currency: row.currency || 'USD',
      dueDate,
      daysUntil,
      status: getDayLabel(daysUntil),
      direction: 'incoming',
      amountInr: Number(inrAmount.toFixed(2)),
    });
  }

  res.json({
    windowDays: days,
    items,
    summary: {
      count: items.length,
      totalInr: Number(totalInr.toFixed(2)),
    },
  });
}));

module.exports = () => router;

