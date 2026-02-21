const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const fse = require('fs-extra');
const multer = require('multer');
const { PDFDocument } = require('pdf-lib');
const db = require('../db');
const getShipmentValues = db.getShipmentValues;
const SHIPMENT_INSERT_OR_REPLACE_SQL = db.SHIPMENT_INSERT_OR_REPLACE_SQL;
const { IMPORT_DOCS_BASE, EXPORT_DOCS_BASE, LOCAL_IMPORT_DOCS, LOCAL_EXPORT_DOCS, COMPANY_FOLDER } = require('../config');
const { validateId, hasPermission } = require('../middleware');
const { log: auditLog, getUserName } = require('../services/auditService');

const ALLOWED_FILE_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.xlsx', '.docx', '.csv', '.txt'];

function normalizeHsnCode(v) {
  return String(v || '').replace(/\D/g, '').slice(0, 8);
}

function safeParseJson(str, fallback) {
  if (str == null || str === '') return fallback;
  try {
    const parsed = JSON.parse(str);
    return parsed != null ? parsed : fallback;
  } catch (_) {
    return fallback;
  }
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

function computePaidOrReceivedFC(payments, shipmentCurrency, exchangeRate, isOutgoing) {
  const list = Array.isArray(payments) ? payments : [];
  return list
    .filter((p) => (isOutgoing ? true : p && p.received === true))
    .reduce((sum, p) => sum + amountToCurrency(p?.amount, p?.currency || shipmentCurrency, shipmentCurrency, exchangeRate), 0);
}

function randomId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 11)}`;
}

/** Store currency and quantities in cents/paise (integer) for precision */
function toCents(x) {
  if (x == null || x === undefined || x === '') return null;
  const n = Number(x);
  if (Number.isNaN(n)) return null;
  return Math.round(n * 100);
}

function fromCents(x) {
  if (x == null || x === undefined) return 0;
  const n = Number(x);
  if (Number.isNaN(n)) return 0;
  return n / 100;
}

/** Convert shipment row from DB (cents) to client (decimals) */
function rowToClient(r) {
  if (!r) return r;
  return {
    ...r,
    amount: fromCents(r.amount),
    rate: fromCents(r.rate),
    quantity: fromCents(r.quantity),
    fobValueFC: fromCents(r.fobValueFC),
    fobValueINR: fromCents(r.fobValueINR),
    invoiceValueINR: fromCents(r.invoiceValueINR),
    lcAmount: fromCents(r.lcAmount),
    licenceObligationAmount: fromCents(r.licenceObligationAmount),
    licenceObligationQuantity: fromCents(r.licenceObligationQuantity),
    assessedValue: fromCents(r.assessedValue),
    dutyBCD: fromCents(r.dutyBCD),
    dutySWS: fromCents(r.dutySWS),
    dutyINT: fromCents(r.dutyINT),
    dutyPenalty: r.dutyPenalty != null ? fromCents(r.dutyPenalty) : 0,
    dutyFine: r.dutyFine != null ? fromCents(r.dutyFine) : 0,
    gst: fromCents(r.gst),
    dbk: r.dbk != null ? fromCents(r.dbk) : 0,
    rodtep: r.rodtep != null ? fromCents(r.rodtep) : 0,
    freightCharges: r.freightCharges != null ? fromCents(r.freightCharges) : null,
    otherCharges: r.otherCharges != null ? fromCents(r.otherCharges) : null,
    version: r.version != null ? r.version : 1,
  };
}

/** Convert client payload to DB format (cents) for getShipmentValues */
function clientToCents(s) {
  return {
    ...s,
    amount: toCents(s.amount) ?? 0,
    rate: toCents(s.rate),
    quantity: toCents(s.quantity),
    fobValueFC: toCents(s.fobValueFC) ?? 0,
    fobValueINR: toCents(s.fobValueINR) ?? 0,
    invoiceValueINR: toCents(s.invoiceValueINR) ?? 0,
    lcAmount: toCents(s.lcAmount) ?? 0,
    licenceObligationAmount: toCents(s.licenceObligationAmount),
    licenceObligationQuantity: toCents(s.licenceObligationQuantity),
    assessedValue: toCents(s.assessedValue) ?? 0,
    dutyBCD: toCents(s.dutyBCD) ?? 0,
    dutySWS: toCents(s.dutySWS) ?? 0,
    dutyINT: toCents(s.dutyINT) ?? 0,
    dutyPenalty: s.dutyPenalty != null ? toCents(s.dutyPenalty) : null,
    dutyFine: s.dutyFine != null ? toCents(s.dutyFine) : null,
    gst: toCents(s.gst) ?? 0,
    dbk: toCents(s.dbk) ?? 0,
    rodtep: toCents(s.rodtep) ?? 0,
    freightCharges: toCents(s.freightCharges),
    otherCharges: toCents(s.otherCharges),
  };
}

function sanitizeFolderName(str) {
  if (!str || typeof str !== 'string') return 'Unknown';
  return str.replace(/[/\\:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim() || 'Unknown';
}

function isValidDocumentsFolderPath(p) {
  if (!p || typeof p !== 'string') return false;
  if (p.length < 10 || p.length > 600) return false;
  if (/[\{\[\"]/.test(p) || p.indexOf('productId') !== -1) return false;
  return true;
}

function getShipmentItems(shipmentId) {
  try {
    const rows = db.prepare('SELECT productId, productName, description, hsnCode, quantity, unit, rate, amount, productType FROM shipment_items WHERE shipmentId = ? ORDER BY sortOrder, id').all(shipmentId);
    if (rows && rows.length > 0) return rows.map(r => ({ productId: r.productId, productName: r.productName || '', description: r.description, hsnCode: r.hsnCode || '', quantity: fromCents(r.quantity), unit: r.unit || 'KGS', rate: fromCents(r.rate), amount: fromCents(r.amount), productType: r.productType }));
    return null;
  } catch (_) { return null; }
}

function getShipmentHistory(shipmentId) {
  try {
    const rows = db.prepare('SELECT status, date, location, remarks, updatedBy FROM shipment_history WHERE shipmentId = ? ORDER BY sortOrder, id').all(shipmentId);
    if (rows && rows.length > 0) return rows.map(r => ({ status: r.status, date: r.date, location: r.location || '', remarks: r.remarks, updatedBy: r.updatedBy }));
    return null;
  } catch (_) { return null; }
}

function getShipmentItemsMap(shipmentIds) {
  const map = new Map();
  if (!Array.isArray(shipmentIds) || shipmentIds.length === 0) return map;
  const placeholders = shipmentIds.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT shipmentId, productId, productName, description, hsnCode, quantity, unit, rate, amount, productType
     FROM shipment_items
     WHERE shipmentId IN (${placeholders})
     ORDER BY shipmentId, sortOrder, id`
  ).all(...shipmentIds);
  for (const r of rows) {
    const one = {
      productId: r.productId,
      productName: r.productName || '',
      description: r.description,
      hsnCode: r.hsnCode || '',
      quantity: fromCents(r.quantity),
      unit: r.unit || 'KGS',
      rate: fromCents(r.rate),
      amount: fromCents(r.amount),
      productType: r.productType
    };
    if (!map.has(r.shipmentId)) map.set(r.shipmentId, []);
    map.get(r.shipmentId).push(one);
  }
  return map;
}

function getShipmentHistoryMap(shipmentIds) {
  const map = new Map();
  if (!Array.isArray(shipmentIds) || shipmentIds.length === 0) return map;
  const placeholders = shipmentIds.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT shipmentId, status, date, location, remarks, updatedBy
     FROM shipment_history
     WHERE shipmentId IN (${placeholders})
     ORDER BY shipmentId, sortOrder, id`
  ).all(...shipmentIds);
  for (const r of rows) {
    const one = {
      status: r.status,
      date: r.date,
      location: r.location || '',
      remarks: r.remarks,
      updatedBy: r.updatedBy
    };
    if (!map.has(r.shipmentId)) map.set(r.shipmentId, []);
    map.get(r.shipmentId).push(one);
  }
  return map;
}

function setShipmentItems(shipmentId, items) {
  db.prepare('DELETE FROM shipment_items WHERE shipmentId = ?').run(shipmentId);
  if (!items || !Array.isArray(items) || items.length === 0) return;
  const ins = db.prepare('INSERT INTO shipment_items (shipmentId, productId, productName, description, hsnCode, quantity, unit, rate, amount, productType, sortOrder) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  items.forEach((it, i) => {
    ins.run(
      shipmentId,
      it.productId || null,
      it.productName || null,
      it.description || null,
      normalizeHsnCode(it.hsnCode) || null,
      toCents(it.quantity) ?? null,
      it.unit || 'KGS',
      toCents(it.rate) ?? null,
      toCents(it.amount) ?? null,
      it.productType || null,
      i
    );
  });
}

function setShipmentHistory(shipmentId, history) {
  db.prepare('DELETE FROM shipment_history WHERE shipmentId = ?').run(shipmentId);
  if (!history || !Array.isArray(history) || history.length === 0) return;
  const ins = db.prepare('INSERT INTO shipment_history (shipmentId, status, date, location, remarks, updatedBy, sortOrder) VALUES (?,?,?,?,?,?,?)');
  history.forEach((h, i) => {
    ins.run(shipmentId, h.status || null, h.date || null, h.location || null, h.remarks || null, h.updatedBy || null, i);
  });
}

/** True if path is a UNC (network) path. */
function isUncPath(p) {
  return typeof p === 'string' && (p.startsWith('\\\\') || p.startsWith('//'));
}

/** Build and create shipment folder: [Import|Export] / [Gujarat Flotex|GTEX Fabrics] / [PartnerName_InvoiceNo] (e.g. Reliance_87). */
function ensureShipmentDocumentsFolder(shipment) {
  if (!shipment) return null;
  const isExport = !!(shipment.buyerId && !shipment.supplierId);
  const companyKey = (shipment.company === 'GTEX' ? 'GTEX' : 'GFPL');
  const companyFolder = sanitizeFolderName(COMPANY_FOLDER[companyKey] || companyKey);
  const invoiceNo = sanitizeFolderName(String(shipment.invoiceNumber || shipment.id || 'Unknown'));
  let partnerName = 'Unknown';
  try {
    if (shipment.supplierId) {
      const r = db.prepare('SELECT name FROM suppliers WHERE id = ?').get(shipment.supplierId);
      partnerName = r && r.name ? sanitizeFolderName(r.name) : 'Unknown';
    } else if (shipment.buyerId) {
      const r = db.prepare('SELECT name FROM buyers WHERE id = ?').get(shipment.buyerId);
      partnerName = r && r.name ? sanitizeFolderName(r.name) : 'Unknown';
    }
  } catch (e) {
    console.warn('ensureShipmentDocumentsFolder partner lookup:', e.message);
  }
  const folderName = `${partnerName}_${invoiceNo}`;

  function tryCreate(base) {
    const fullPath = path.join(String(base), String(companyFolder), String(folderName));
    const baseWithCompany = path.join(base, companyFolder);
    try {
      if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });
      if (!fs.existsSync(baseWithCompany)) fs.mkdirSync(baseWithCompany, { recursive: true });
      if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
      return fullPath;
    } catch (err) {
      return null;
    }
  }

  let base = isExport ? EXPORT_DOCS_BASE : IMPORT_DOCS_BASE;
  let fullPath = tryCreate(base);
  if (!fullPath && isUncPath(base)) {
    const localBase = isExport ? LOCAL_EXPORT_DOCS : LOCAL_IMPORT_DOCS;
    console.warn('Network path not writable (' + base + '), using local folder: ' + localBase);
    fullPath = tryCreate(localBase);
  }
  if (!fullPath) console.warn('ensureShipmentDocumentsFolder error: could not create folder');
  return fullPath;
}

/** Get partner name and invoice number for a shipment (same logic as folder naming). Used for auto-renaming uploaded files. */
function getShipmentPartnerAndInvoice(row) {
  if (!row) return { partnerName: 'Unknown', invoiceNo: 'Unknown' };
  let partnerName = 'Unknown';
  try {
    if (row.supplierId) {
      const r = db.prepare('SELECT name FROM suppliers WHERE id = ?').get(row.supplierId);
      partnerName = r && r.name ? sanitizeFolderName(r.name) : 'Unknown';
    } else if (row.buyerId) {
      const r = db.prepare('SELECT name FROM buyers WHERE id = ?').get(row.buyerId);
      partnerName = r && r.name ? sanitizeFolderName(r.name) : 'Unknown';
    }
  } catch (e) {
    console.warn('getShipmentPartnerAndInvoice partner lookup:', e.message);
  }
  const invoiceNo = sanitizeFolderName(String(row.invoiceNumber || row.id || 'Unknown'));
  return { partnerName, invoiceNo };
}

function getValidDocumentsFolderPath(row) {
  if (!row || !row.id) return null;
  try {
    const stored = row.documentsFolderPath;
    const isExport = !!(row.buyerId && !row.supplierId);
    const storedPointsToImport = stored && (stored.indexOf('Import Shipment Documents') !== -1 || stored.indexOf('Import Shipment Documents'.replace(/ /g, '_')) !== -1);
    const storedPointsToExport = stored && (stored.indexOf('Export Shipment Documents') !== -1 || stored.indexOf('Export Shipment Documents'.replace(/ /g, '_')) !== -1);
    const mismatch = (isExport && storedPointsToImport) || (!isExport && storedPointsToExport);
    if (isValidDocumentsFolderPath(stored) && !mismatch) return stored;
    const folderPath = ensureShipmentDocumentsFolder(row);
    if (folderPath) {
      try {
        db.prepare('UPDATE shipments SET documentsFolderPath = ? WHERE id = ?').run(folderPath, row.id);
      } catch (updateErr) {
        console.warn('getValidDocumentsFolderPath update path:', updateErr.message);
      }
    }
    return folderPath;
  } catch (e) {
    console.warn('getValidDocumentsFolderPath error:', e.message);
    return null;
  }
}

function checkLicenceExpiry(shipment) {
  const ids = new Set();
  if (shipment.linkedLicenceId) ids.add(shipment.linkedLicenceId);
  if (Array.isArray(shipment.licenceAllocations)) shipment.licenceAllocations.forEach(a => { if (a.licenceId) ids.add(a.licenceId); });
  const shipmentDate = shipment.expectedShipmentDate || shipment.invoiceDate;
  if (!shipmentDate) return;
  for (const linkedId of ids) {
    const licence = db.prepare('SELECT expiryDate FROM licences WHERE id = ?').get(linkedId);
    if (!licence || !licence.expiryDate) continue;
    if (licence.expiryDate < shipmentDate) {
      const err = new Error('Compliance Error: A selected licence has expired.');
      err.statusCode = 400;
      throw err;
    }
  }
}

function getLinkedLicenceIds(shipment) {
  const ids = new Set();
  if (shipment.linkedLicenceId) ids.add(String(shipment.linkedLicenceId));
  if (shipment.epcgLicenceId) ids.add(String(shipment.epcgLicenceId));
  if (shipment.advLicenceId) ids.add(String(shipment.advLicenceId));
  if (Array.isArray(shipment.licenceAllocations)) {
    shipment.licenceAllocations.forEach((a) => { if (a && a.licenceId) ids.add(String(a.licenceId)); });
  }
  return Array.from(ids);
}

function getShipmentDateForCompliance(shipment) {
  return shipment.expectedShipmentDate || shipment.invoiceDate || new Date().toISOString().slice(0, 10);
}

function calculateExistingImportUseForProduct(licenceId, productId, excludeShipmentId) {
  const rows = db.prepare('SELECT id, supplierId, licence_allocations_json, licenceImportLines_json FROM shipments WHERE supplierId IS NOT NULL').all();
  let qty = 0;
  let usd = 0;
  let inr = 0;
  for (const r of rows) {
    if (excludeShipmentId && String(r.id) === String(excludeShipmentId)) continue;
    const allocs = safeParseJson(r.licence_allocations_json, []);
    if (Array.isArray(allocs) && allocs.length > 0) {
      const filtered = allocs.filter((a) => String(a?.licenceId || '') === String(licenceId) && String(a?.productId || '') === String(productId));
      qty += filtered.reduce((s, a) => s + (Number(a?.allocatedQuantity) || 0), 0);
      usd += filtered.reduce((s, a) => s + (Number(a?.allocatedAmountUSD) || 0), 0);
      inr += filtered.reduce((s, a) => s + (Number(a?.allocatedAmountINR) || 0), 0);
      continue;
    }
    const lines = safeParseJson(r.licenceImportLines_json, []);
    if (Array.isArray(lines) && lines.length > 0) {
      const lf = lines.filter((l) => {
        const lineProductId = String(l?.productId || '');
        const lineLicenceId = String(l?.licenceId || l?.linkedLicenceId || l?.licence_id || '');
        return lineProductId === String(productId) && lineLicenceId === String(licenceId);
      });
      qty += lf.reduce((s, l) => s + (Number(l?.quantity) || 0), 0);
      usd += lf.reduce((s, l) => s + (Number(l?.amountUSD) || 0), 0);
      inr += lf.reduce((s, l) => s + (Number(l?.valueINR) || 0), 0);
    }
  }
  return { qty, usd, inr };
}

function enforceLicenceCompliance(req, shipment, existingShipmentId) {
  const linkedIds = getLinkedLicenceIds(shipment);
  if (linkedIds.length === 0 || !shipment.isUnderLicence) return false;
  const override = req && req.body && req.body.licenceOverride === true;
  const isManagement = req && req.user && String(req.user.role || '').toUpperCase() === 'MANAGEMENT';
  const shipmentDate = getShipmentDateForCompliance(shipment);
  let overrideUsed = false;

  for (const lid of linkedIds) {
    const licence = db.prepare('SELECT id, number, type, status, importValidityDate, expiryDate, importProducts_json FROM licences WHERE id = ?').get(lid);
    if (!licence) continue;

    const status = String(licence.status || 'ACTIVE').toUpperCase();
    if (status !== 'ACTIVE' && !(override && isManagement)) {
      const err = new Error(`Compliance Error: Licence ${licence.number || lid} is not ACTIVE.`);
      err.statusCode = 400;
      throw err;
    }
    if (status !== 'ACTIVE' && override && isManagement) overrideUsed = true;

    if (shipment.supplierId && licence.importValidityDate && shipmentDate > licence.importValidityDate && !(override && isManagement)) {
      const err = new Error(`Compliance Error: Import validity expired for licence ${licence.number || lid}.`);
      err.statusCode = 400;
      throw err;
    }
    if (shipment.supplierId && licence.importValidityDate && shipmentDate > licence.importValidityDate && override && isManagement) overrideUsed = true;

    if (licence.expiryDate && shipmentDate > licence.expiryDate && !(override && isManagement)) {
      const err = new Error(`Compliance Error: Export obligation due date exceeded for licence ${licence.number || lid}.`);
      err.statusCode = 400;
      throw err;
    }
    if (licence.expiryDate && shipmentDate > licence.expiryDate && override && isManagement) overrideUsed = true;

    if (shipment.supplierId) {
      const importProducts = safeParseJson(licence.importProducts_json, []);
      if (!Array.isArray(importProducts) || importProducts.length === 0) continue;

      const allocs = Array.isArray(shipment.licenceAllocations)
        ? shipment.licenceAllocations.filter((a) => String(a?.licenceId || '') === String(lid))
        : [];
      for (const alloc of allocs) {
        const productId = String(alloc?.productId || '');
        if (!productId) continue;
        const prod = importProducts.find((p) => String(p?.materialId || '') === productId);
        if (!prod) continue;
        const existing = calculateExistingImportUseForProduct(lid, productId, existingShipmentId);
        const qtyLimit = Number(prod.quantityLimit) || 0;
        const usdLimit = Number(prod.amountUSDLimit) || 0;
        const inrLimit = Number(prod.amountINR) || 0;
        const nextQty = existing.qty + (Number(alloc?.allocatedQuantity) || 0);
        const nextUsd = existing.usd + (Number(alloc?.allocatedAmountUSD) || 0);
        const nextInr = existing.inr + (Number(alloc?.allocatedAmountINR) || 0);
        const over = (qtyLimit > 0 && nextQty > qtyLimit) || (usdLimit > 0 && nextUsd > usdLimit) || (inrLimit > 0 && nextInr > inrLimit);
        if (over && !(override && isManagement)) {
          const err = new Error(`Compliance Error: Allocation exceeds licence limit for product ${prod.materialName || productId} on licence ${licence.number || lid}.`);
          err.statusCode = 400;
          throw err;
        }
        if (over && override && isManagement) overrideUsed = true;
      }
    }
  }
  return overrideUsed;
}

/**
 * When a payment is lodged with mode LC and linkedLcId, reduce the LC balance and record an lc_transaction.
 * amountMajor: payment amount in display units (e.g. 100 for $100).
 */
function applyLCPayment(lcId, amountMajor, currency, date, shipmentId, broadcast) {
  if (!lcId || amountMajor == null || Number(amountMajor) <= 0) return;
  const amt = Number(amountMajor);
  let row;
  try {
    row = db.prepare('SELECT * FROM lcs WHERE id = ?').get(lcId);
  } catch (e) { return; }
  if (!row) return;
  const lcAmount = Number(row.amount) || 0;
  const rawBalance = row.balanceAmount;
  const currentBalance = (rawBalance != null && rawBalance !== '' && !Number.isNaN(Number(rawBalance)))
    ? Number(rawBalance)
    : lcAmount;
  if (amt > currentBalance) {
    const err = new Error(
      `Payment amount (${amountMajor} ${currency || row.currency || 'USD'}) exceeds LC remaining balance. LC amount: ${lcAmount} ${row.currency || 'USD'}; remaining: ${currentBalance} ${row.currency || 'USD'}.`
    );
    err.statusCode = 400;
    throw err;
  }
  const newBalance = currentBalance - amt;
  try {
    db.prepare('UPDATE lcs SET balanceAmount = ? WHERE id = ?').run(newBalance, lcId);
    const txId = 'tx_' + Math.random().toString(36).substr(2, 9);
    const now = new Date().toISOString();
    db.prepare('INSERT INTO lc_transactions (id, lcId, amount, currency, date, type, shipmentId, createdAt) VALUES (?,?,?,?,?,?,?,?)').run(
      txId, lcId, amt, currency || row.currency || 'USD', date || now.split('T')[0], 'DEBIT', shipmentId || null, now
    );
  } catch (e) {
    if (e.statusCode) throw e;
    console.warn('applyLCPayment:', e.message);
    return;
  }
  broadcast();
}

function linkShipmentToLC(shipment, broadcast) {
  if (!shipment || !shipment.isUnderLC) return;
  const shipmentId = shipment.id;
  const shipmentValue = Number(shipment.amount) || 0;
  const shipmentValueMajor = shipmentValue / 100;
  let row = null;
  let lcRef = (shipment.lcNumber != null && shipment.lcNumber !== '') ? String(shipment.lcNumber).trim() : '';
  try {
    // Prefer linkedLcId when user selected an LC (e.g. from New Shipment dropdown)
    if (shipment.linkedLcId) {
      row = db.prepare('SELECT * FROM lcs WHERE id = ?').get(shipment.linkedLcId);
    }
    if (!row && lcRef) {
      row = db.prepare('SELECT * FROM lcs WHERE lcNumber = ?').get(lcRef);
    }
  } catch (e) {
    return;
  }
  if (row) {
    // Only link shipment to LC (add to shipments_json). Do not change balanceAmount here;
    // balance is reduced only by applyLCPayment() when a payment is lodged.
    const shipments = (() => { try { return JSON.parse(row.shipments_json || '[]'); } catch (_) { return []; } })();
    if (shipments.indexOf(shipmentId) !== -1) return;
    shipments.push(shipmentId);
    try {
      db.prepare('UPDATE lcs SET shipments_json = ? WHERE id = ?').run(JSON.stringify(shipments), row.id);
    } catch (e) {
      if (/no such column/.test(e.message)) return;
      throw e;
    }
    broadcast();
    return;
  }
  const isExport = !!(shipment.buyerId && !shipment.supplierId);
  const newId = 'lc_' + Math.random().toString(36).substr(2, 9);
  const now = new Date().toISOString().split('T')[0];
  // Auto-create LC: amount and balanceAmount both set to shipment value; balance will be reduced by applyLCPayment when payments are lodged
  try {
    const ins = db.prepare('INSERT INTO lcs (id, lcNumber, issuingBank, supplierId, buyerId, amount, balanceAmount, currency, issueDate, expiryDate, maturityDate, company, status, remarks, shipments_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    ins.run(
      newId, lcRef || ('AUTO-' + shipmentId), '—', isExport ? null : (shipment.supplierId || null), isExport ? (shipment.buyerId || null) : null,
      shipmentValueMajor, shipmentValueMajor, shipment.currency || 'USD', now, now, now, shipment.company || 'GFPL', 'DRAFT', 'Auto-created from shipment',
      JSON.stringify([shipmentId])
    );
  } catch (e) {
    if (/no such column/.test(e.message)) {
      db.prepare('INSERT OR REPLACE INTO lcs (id, lcNumber, issuingBank, supplierId, buyerId, amount, currency, issueDate, expiryDate, maturityDate, company, status, remarks) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
        newId, lcRef || ('AUTO-' + shipmentId), '—', isExport ? null : (shipment.supplierId || null), isExport ? (shipment.buyerId || null) : null,
        shipmentValueMajor, shipment.currency || 'USD', now, now, now, shipment.company || 'GFPL', 'DRAFT', 'Auto-created from shipment'
      );
    } else throw e;
  }
  broadcast();
}

/** Sanitize filename for download or upload: reject directory traversal and path separators. Returns null if invalid. */
function sanitizeFileDownloadFilename(filename) {
  if (typeof filename !== 'string' || filename === '') return null;
  const trimmed = filename.trim();
  if (trimmed === '' || trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) return null;
  return trimmed;
}

const UPLOAD_TMP_DIR = path.join(os.tmpdir(), 'exim-upload-tmp');
try { fse.ensureDirSync(UPLOAD_TMP_DIR); } catch (_) {}

const multerDisk = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_TMP_DIR),
    filename: (_req, file, cb) => {
      const ext = (path.extname(file.originalname || '') || '').toLowerCase();
      cb(null, `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});

/** Converts to Windows path; ensures network (UNC) paths start with exactly \\. */
/** Ensures Windows UNC paths (IP or network name) start with exactly two backslashes (\\), not four or one. */
function toWindowsPath(pathStr) {
  if (!pathStr || typeof pathStr !== 'string') return pathStr;
  let s = pathStr.replace(/\//g, '\\').replace(/\\+$/, '');
  if (s.startsWith('\\\\')) {
    s = '\\\\' + s.replace(/^\\+/, '');
    return s;
  }
  if (s.startsWith('\\')) return '\\' + s;
  return s;
}

function buildShipmentResponse(r, prefetchedItems, prefetchedHistory) {
  const folderPath = isValidDocumentsFolderPath(r.documentsFolderPath) ? r.documentsFolderPath : null;
  const items = prefetchedItems ?? getShipmentItems(r.id) ?? (r.productId ? [{ productId: r.productId, productName: '', quantity: fromCents(r.quantity), rate: fromCents(r.rate), amount: fromCents(r.quantity) * fromCents(r.rate) }] : []);
  const history = prefetchedHistory ?? getShipmentHistory(r.id) ?? [];
  const row = rowToClient(r);
  const { items_json, ...rest } = row;
  return {
    ...rest,
    isUnderLC: !!r.isUnderLC,
    isUnderLicence: !!r.isUnderLicence,
    linkedLicenceId: r.linkedLicenceId != null && r.linkedLicenceId !== '' ? String(r.linkedLicenceId) : null,
    epcgLicenceId: r.epcgLicenceId != null && r.epcgLicenceId !== '' ? String(r.epcgLicenceId) : null,
    advLicenceId: r.advLicenceId != null && r.advLicenceId !== '' ? String(r.advLicenceId) : null,
    lcSettled: !!r.lcSettled,
    documents: safeParseJson(r.documents_json, {}),
    history,
    payments: safeParseJson(r.payments_json, []),
    items,
    documentsFolderPath: folderPath,
    licenceImportLines: safeParseJson(r.licenceImportLines_json, []),
    licenceExportLines: safeParseJson(r.licenceExportLines_json, []),
    licenceAllocations: safeParseJson(r.licence_allocations_json, []),
  };
}

function createRouter(broadcast) {
  const router = express.Router();

  router.get('/', hasPermission('shipments.view'), (req, res) => {
    try {
      const rows = db.prepare('SELECT * FROM shipments').all();
      const shipmentIds = rows.map((r) => r.id).filter(Boolean);
      const itemsMap = getShipmentItemsMap(shipmentIds);
      const historyMap = getShipmentHistoryMap(shipmentIds);
      const result = [];
      for (const r of rows) {
        try {
          const fallbackItems = r.productId ? [{ productId: r.productId, productName: '', quantity: fromCents(r.quantity), rate: fromCents(r.rate), amount: fromCents(r.quantity) * fromCents(r.rate) }] : [];
          result.push(buildShipmentResponse(
            r,
            itemsMap.get(r.id) || fallbackItems,
            historyMap.get(r.id) || []
          ));
        } catch (rowErr) {
          console.warn('Shipment list row error:', r?.id, rowErr.message);
        }
      }
      res.json(result);
    } catch (err) {
      console.error('GET /shipments list error:', err);
      if (!res.headersSent) res.status(500).json({ error: 'Failed to load shipments' });
    }
  });

  router.get('/:id', hasPermission('shipments.view'), (req, res) => {
    try {
      const idCheck = validateId(req.params && req.params.id, 'Shipment ID');
      if (!idCheck.valid) return res.status(400).json({ error: idCheck.message });
      const id = idCheck.value;
      const r = db.prepare('SELECT * FROM shipments WHERE id = ?').get(id);
      if (!r) return res.status(404).json({ error: 'Shipment not found' });
      res.json(buildShipmentResponse(r));
    } catch (err) {
      console.error('GET /shipments/:id error:', err);
      if (!res.headersSent) res.status(500).json({ error: 'Failed to load shipment' });
    }
  });

  router.get('/:id/installments', hasPermission('shipments.view'), (req, res) => {
    try {
      const idCheck = validateId(req.params && req.params.id, 'Shipment ID');
      if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
      const shipmentId = idCheck.value;
      const sh = db.prepare('SELECT id FROM shipments WHERE id = ?').get(shipmentId);
      if (!sh) return res.status(404).json({ success: false, error: 'Shipment not found' });
      const rows = db.prepare(
        `SELECT id, shipmentId, kind, dueDate, plannedAmountFC, currency, notes, sortOrder, createdAt, updatedAt
         FROM shipment_installments
         WHERE shipmentId = ?
         ORDER BY dueDate ASC, sortOrder ASC, createdAt ASC`
      ).all(shipmentId);
      res.json({ success: true, items: rows || [] });
    } catch (e) {
      console.error('GET /api/shipments/:id/installments error:', e);
      res.status(500).json({ success: false, error: 'Failed to load installments' });
    }
  });

  router.post('/:id/installments', hasPermission('shipments.edit'), (req, res) => {
    try {
      const idCheck = validateId(req.params && req.params.id, 'Shipment ID');
      if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
      const shipmentId = idCheck.value;
      const sh = db.prepare('SELECT id, supplierId, buyerId, currency, amount, fobValueFC FROM shipments WHERE id = ?').get(shipmentId);
      if (!sh) return res.status(404).json({ success: false, error: 'Shipment not found' });

      const kind = String(req.body?.kind || '').toUpperCase();
      if (kind !== 'OUTGOING' && kind !== 'INCOMING') return res.status(400).json({ success: false, error: 'Invalid installment kind' });
      const expectedKind = sh.supplierId ? 'OUTGOING' : 'INCOMING';
      if (kind !== expectedKind) return res.status(400).json({ success: false, error: `This shipment supports only ${expectedKind} installments.` });

      const dueDate = String(req.body?.dueDate || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return res.status(400).json({ success: false, error: 'Due date is required (YYYY-MM-DD).' });

      const plannedAmountFC = Number(req.body?.plannedAmountFC);
      if (!Number.isFinite(plannedAmountFC) || plannedAmountFC <= 0) {
        return res.status(400).json({ success: false, error: 'Planned amount must be greater than zero.' });
      }
      const currency = String(req.body?.currency || '').toUpperCase().trim();
      const shipmentCurrency = String(sh.currency || 'USD').toUpperCase();
      if (!currency || currency !== shipmentCurrency) {
        return res.status(400).json({ success: false, error: `Currency must match shipment currency (${shipmentCurrency}).` });
      }
      const sortOrder = Math.max(0, Number.parseInt(String(req.body?.sortOrder ?? 0), 10) || 0);
      const notes = req.body?.notes != null ? String(req.body.notes).trim().slice(0, 500) : null;

      const existingRows = db.prepare(
        `SELECT id, dueDate, plannedAmountFC, sortOrder
         FROM shipment_installments
         WHERE shipmentId = ? AND kind = ?`
      ).all(shipmentId, kind);
      const duplicate = existingRows.find((r) =>
        String(r.dueDate) === dueDate &&
        Number(r.sortOrder || 0) === sortOrder &&
        Math.abs((Number(r.plannedAmountFC) || 0) - plannedAmountFC) <= 0.0001
      );
      if (duplicate) return res.status(400).json({ success: false, error: 'Duplicate installment row already exists.' });

      const invoiceTotalFC = Number(kind === 'OUTGOING'
        ? fromCents(sh.amount)
        : (sh.fobValueFC != null ? fromCents(sh.fobValueFC) : fromCents(sh.amount))) || 0;
      const plannedTotal = existingRows.reduce((s, r) => s + (Number(r.plannedAmountFC) || 0), 0) + plannedAmountFC;
      if (plannedTotal > invoiceTotalFC + 0.0001) {
        return res.status(400).json({
          success: false,
          error: `Installment total exceeds invoice amount by ${(plannedTotal - invoiceTotalFC).toFixed(2)} ${shipmentCurrency}.`,
        });
      }

      const now = new Date().toISOString();
      const id = randomId('inst');
      db.prepare(
        `INSERT INTO shipment_installments (id, shipmentId, kind, dueDate, plannedAmountFC, currency, notes, sortOrder, createdAt, updatedAt)
         VALUES (?,?,?,?,?,?,?,?,?,?)`
      ).run(id, shipmentId, kind, dueDate, plannedAmountFC, shipmentCurrency, notes, sortOrder, now, now);
      const created = db.prepare('SELECT * FROM shipment_installments WHERE id = ?').get(id);
      const userId = req.user && req.user.id;
      auditLog(db, userId, 'SHIPMENT_INSTALLMENT_CREATED', shipmentId, { installmentId: id, kind, dueDate, plannedAmountFC, currency: shipmentCurrency });
      broadcast();
      res.json({ success: true, item: created });
    } catch (e) {
      console.error('POST /api/shipments/:id/installments error:', e);
      res.status(500).json({ success: false, error: 'Failed to create installment' });
    }
  });

  router.put('/:id/installments/:installmentId', hasPermission('shipments.edit'), (req, res) => {
    try {
      const idCheck = validateId(req.params && req.params.id, 'Shipment ID');
      if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
      const shipmentId = idCheck.value;
      const installmentId = String(req.params?.installmentId || '').trim();
      if (!installmentId) return res.status(400).json({ success: false, error: 'Installment ID is required.' });

      const sh = db.prepare('SELECT id, supplierId, buyerId, currency, amount, fobValueFC FROM shipments WHERE id = ?').get(shipmentId);
      if (!sh) return res.status(404).json({ success: false, error: 'Shipment not found' });

      const existing = db.prepare('SELECT * FROM shipment_installments WHERE id = ? AND shipmentId = ?').get(installmentId, shipmentId);
      if (!existing) return res.status(404).json({ success: false, error: 'Installment not found' });

      const kind = String(req.body?.kind || existing.kind || '').toUpperCase();
      if (kind !== 'OUTGOING' && kind !== 'INCOMING') return res.status(400).json({ success: false, error: 'Invalid installment kind' });
      const expectedKind = sh.supplierId ? 'OUTGOING' : 'INCOMING';
      if (kind !== expectedKind) return res.status(400).json({ success: false, error: `This shipment supports only ${expectedKind} installments.` });

      const dueDate = String(req.body?.dueDate || existing.dueDate || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return res.status(400).json({ success: false, error: 'Due date is required (YYYY-MM-DD).' });

      const plannedAmountFC = req.body?.plannedAmountFC != null ? Number(req.body.plannedAmountFC) : Number(existing.plannedAmountFC);
      if (!Number.isFinite(plannedAmountFC) || plannedAmountFC <= 0) {
        return res.status(400).json({ success: false, error: 'Planned amount must be greater than zero.' });
      }
      const shipmentCurrency = String(sh.currency || 'USD').toUpperCase();
      const currency = String(req.body?.currency || existing.currency || '').toUpperCase().trim();
      if (!currency || currency !== shipmentCurrency) {
        return res.status(400).json({ success: false, error: `Currency must match shipment currency (${shipmentCurrency}).` });
      }
      const sortOrder = req.body?.sortOrder != null
        ? Math.max(0, Number.parseInt(String(req.body.sortOrder), 10) || 0)
        : Math.max(0, Number.parseInt(String(existing.sortOrder ?? 0), 10) || 0);
      const notes = req.body?.notes != null
        ? String(req.body.notes).trim().slice(0, 500)
        : (existing.notes != null ? String(existing.notes) : null);

      const existingRows = db.prepare(
        `SELECT id, dueDate, plannedAmountFC, sortOrder
         FROM shipment_installments
         WHERE shipmentId = ? AND kind = ? AND id <> ?`
      ).all(shipmentId, kind, installmentId);
      const duplicate = existingRows.find((r) =>
        String(r.dueDate) === dueDate &&
        Number(r.sortOrder || 0) === sortOrder &&
        Math.abs((Number(r.plannedAmountFC) || 0) - plannedAmountFC) <= 0.0001
      );
      if (duplicate) return res.status(400).json({ success: false, error: 'Duplicate installment row already exists.' });

      const invoiceTotalFC = Number(kind === 'OUTGOING'
        ? fromCents(sh.amount)
        : (sh.fobValueFC != null ? fromCents(sh.fobValueFC) : fromCents(sh.amount))) || 0;
      const plannedTotal = existingRows.reduce((s, r) => s + (Number(r.plannedAmountFC) || 0), 0) + plannedAmountFC;
      if (plannedTotal > invoiceTotalFC + 0.0001) {
        return res.status(400).json({
          success: false,
          error: `Installment total exceeds invoice amount by ${(plannedTotal - invoiceTotalFC).toFixed(2)} ${shipmentCurrency}.`,
        });
      }

      const now = new Date().toISOString();
      db.prepare(
        `UPDATE shipment_installments
         SET kind = ?, dueDate = ?, plannedAmountFC = ?, currency = ?, notes = ?, sortOrder = ?, updatedAt = ?
         WHERE id = ? AND shipmentId = ?`
      ).run(kind, dueDate, plannedAmountFC, shipmentCurrency, notes, sortOrder, now, installmentId, shipmentId);
      const updated = db.prepare('SELECT * FROM shipment_installments WHERE id = ?').get(installmentId);
      const userId = req.user && req.user.id;
      auditLog(db, userId, 'SHIPMENT_INSTALLMENT_UPDATED', shipmentId, { installmentId, kind, dueDate, plannedAmountFC, currency: shipmentCurrency });
      broadcast();
      res.json({ success: true, item: updated });
    } catch (e) {
      console.error('PUT /api/shipments/:id/installments/:installmentId error:', e);
      res.status(500).json({ success: false, error: 'Failed to update installment' });
    }
  });

  router.delete('/:id/installments/:installmentId', hasPermission('shipments.edit'), (req, res) => {
    try {
      const idCheck = validateId(req.params && req.params.id, 'Shipment ID');
      if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
      const shipmentId = idCheck.value;
      const installmentId = String(req.params?.installmentId || '').trim();
      if (!installmentId) return res.status(400).json({ success: false, error: 'Installment ID is required.' });
      const row = db.prepare('SELECT id FROM shipment_installments WHERE id = ? AND shipmentId = ?').get(installmentId, shipmentId);
      if (!row) return res.status(404).json({ success: false, error: 'Installment not found' });
      db.prepare('DELETE FROM shipment_installments WHERE id = ? AND shipmentId = ?').run(installmentId, shipmentId);
      const userId = req.user && req.user.id;
      auditLog(db, userId, 'SHIPMENT_INSTALLMENT_DELETED', shipmentId, { installmentId });
      broadcast();
      res.json({ success: true });
    } catch (e) {
      console.error('DELETE /api/shipments/:id/installments/:installmentId error:', e);
      res.status(500).json({ success: false, error: 'Failed to delete installment' });
    }
  });

  router.get('/:id/documents-folder', hasPermission('documents.view'), (req, res) => {
    const send = (pathVal, exists) => { if (!res.headersSent) res.status(200).json({ path: pathVal ?? null, exists: !!exists }); };
    try {
      const idCheck = validateId(req.params && req.params.id, 'Shipment ID');
      if (!idCheck.valid) { send(null, false); return; }
      const id = idCheck.value;
      let row = null;
      try {
        row = db.prepare('SELECT * FROM shipments WHERE id = ?').get(id);
      } catch (e) {
        console.warn('GET /documents-folder db:', e.message);
        send(null, false);
        return;
      }
      if (!row) { send(null, false); return; }
      let folderPath = null;
      try {
        folderPath = getValidDocumentsFolderPath(row);
      } catch (e) {
        console.warn('getValidDocumentsFolderPath failed:', e.message);
        send(null, false);
        return;
      }
      if (!folderPath || typeof folderPath !== 'string') { send(null, false); return; }
      try {
        folderPath = path.normalize(folderPath);
        if (!fs.existsSync(folderPath)) {
          try { fs.mkdirSync(folderPath, { recursive: true }); } catch (e) { console.warn('Could not create shipment documents folder:', folderPath, e.message); }
        }
        const exists = fs.existsSync(folderPath);
        send(toWindowsPath(folderPath), exists);
      } catch (pathErr) {
        console.warn('GET /documents-folder path/fs:', pathErr.message);
        send(null, false);
      }
    } catch (err) {
      console.error('GET /documents-folder error:', err);
      if (!res.headersSent) res.status(200).json({ path: null, exists: false });
    }
  });

  router.get('/:id/documents-folder-files', hasPermission('documents.view'), (req, res) => {
    const sendFiles = (files) => { if (!res.headersSent) res.status(200).json({ files: Array.isArray(files) ? files : [] }); };
    try {
      const idCheck = validateId(req.params && req.params.id, 'Shipment ID');
      if (!idCheck.valid) { sendFiles([]); return; }
      const id = idCheck.value;
      let row;
      try {
        row = db.prepare('SELECT * FROM shipments WHERE id = ?').get(id);
      } catch (e) {
        console.warn('GET /documents-folder-files db:', e.message);
        sendFiles([]);
        return;
      }
      if (!row) { sendFiles([]); return; }
      let folderPath = null;
      try {
        folderPath = getValidDocumentsFolderPath(row);
      } catch (e) {
        sendFiles([]);
        return;
      }
      if (!folderPath || typeof folderPath !== 'string') { sendFiles([]); return; }
      try {
        if (!fs.existsSync(folderPath)) { sendFiles([]); return; }
        const baseResolved = path.resolve(folderPath);
        const names = fs.readdirSync(folderPath);
        const fileNames = names.filter((n) => {
          if (typeof n !== 'string' || n.includes('..')) return false;
          const p = path.join(folderPath, n);
          const resolved = path.resolve(p);
          if (resolved !== baseResolved && !resolved.startsWith(baseResolved + path.sep)) return false;
          try { return fs.statSync(p).isFile(); } catch (_) { return false; }
        });
        sendFiles(fileNames.map((name) => ({ name })));
      } catch (pathErr) {
        console.warn('GET /documents-folder-files path/fs:', pathErr.message);
        sendFiles([]);
      }
    } catch (err) {
      console.error('GET /documents-folder-files error:', err);
      if (!res.headersSent) res.status(200).json({ files: [] });
    }
  });

  router.get('/:id/files/:filename', hasPermission('documents.view'), (req, res) => {
    try {
      const idCheck = validateId(req.params && req.params.id, 'Shipment ID');
      if (!idCheck.valid) return res.status(400).json({ error: idCheck.message });
      const id = idCheck.value;
      const filename = sanitizeFileDownloadFilename(req.params && req.params.filename);
      if (!filename) return res.status(400).json({ error: 'Invalid file name' });

      let row;
      try {
        row = db.prepare('SELECT * FROM shipments WHERE id = ?').get(id);
      } catch (e) {
        console.warn('GET /files/:filename db:', e.message);
        return res.status(500).json({ error: 'Failed to resolve shipment' });
      }
      if (!row) return res.status(404).json({ error: 'Shipment not found' });

      let folderPath = null;
      try {
        folderPath = getValidDocumentsFolderPath(row);
      } catch (e) {
        console.warn('getValidDocumentsFolderPath failed (files):', e.message);
        return res.status(500).json({ error: 'Failed to resolve documents folder' });
      }
      if (!folderPath || typeof folderPath !== 'string') return res.status(404).json({ error: 'Documents folder not available' });

      const fullPath = path.join(folderPath, filename);
      const resolvedFull = path.resolve(fullPath);
      const resolvedBase = path.resolve(folderPath);
      if (resolvedFull !== resolvedBase && !resolvedFull.startsWith(resolvedBase + path.sep)) {
        return res.status(400).json({ error: 'Invalid file name' });
      }
      if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not found' });
      try {
        const stat = fs.statSync(fullPath);
        if (!stat.isFile()) return res.status(404).json({ error: 'File not found' });
      } catch (statErr) {
        return res.status(404).json({ error: 'File not found' });
      }

      res.download(fullPath, filename, (err) => {
        if (err && !res.headersSent) {
          console.warn('File download error:', err.message);
          res.status(500).json({ error: 'Download failed' });
        }
      });
    } catch (err) {
      console.error('GET /:id/files/:filename error:', err);
      if (!res.headersSent) res.status(500).json({ error: 'An error occurred' });
    }
  });

  router.post('/:id/files/merge-pdf', hasPermission('documents.view'), async (req, res) => {
    try {
      const idCheck = validateId(req.params && req.params.id, 'Shipment ID');
      if (!idCheck.valid) return res.status(400).json({ error: idCheck.message });
      const id = idCheck.value;

      const rawFiles = Array.isArray(req.body?.filenames) ? req.body.filenames : [];
      if (rawFiles.length === 0) return res.status(400).json({ error: 'No files selected for merge' });
      if (rawFiles.length > 80) return res.status(400).json({ error: 'Too many files selected' });

      let row;
      try {
        row = db.prepare('SELECT * FROM shipments WHERE id = ?').get(id);
      } catch (e) {
        return res.status(500).json({ error: 'Failed to resolve shipment' });
      }
      if (!row) return res.status(404).json({ error: 'Shipment not found' });

      const folderPath = getValidDocumentsFolderPath(row);
      if (!folderPath || typeof folderPath !== 'string') return res.status(404).json({ error: 'Documents folder not available' });
      if (!fs.existsSync(folderPath)) return res.status(404).json({ error: 'Documents folder not available' });

      const resolvedBase = path.resolve(folderPath);
      const uniqueNames = [];
      const seen = new Set();
      for (const f of rawFiles) {
        const safe = sanitizeFileDownloadFilename(String(f || ''));
        if (!safe || seen.has(safe)) continue;
        seen.add(safe);
        uniqueNames.push(safe);
      }
      if (uniqueNames.length === 0) return res.status(400).json({ error: 'No valid files selected for merge' });

      const mergedPdf = await PDFDocument.create();
      const included = [];
      const skipped = [];

      for (const filename of uniqueNames) {
        const fullPath = path.join(folderPath, filename);
        const resolvedFull = path.resolve(fullPath);
        if (resolvedFull !== resolvedBase && !resolvedFull.startsWith(resolvedBase + path.sep)) {
          skipped.push({ filename, reason: 'invalid-path' });
          continue;
        }
        if (!fs.existsSync(fullPath)) {
          skipped.push({ filename, reason: 'not-found' });
          continue;
        }

        let stat;
        try {
          stat = fs.statSync(fullPath);
        } catch (_) {
          skipped.push({ filename, reason: 'not-found' });
          continue;
        }
        if (!stat.isFile()) {
          skipped.push({ filename, reason: 'not-file' });
          continue;
        }

        const ext = (path.extname(filename) || '').toLowerCase();
        let bytes;
        try {
          bytes = fs.readFileSync(fullPath);
        } catch (_) {
          skipped.push({ filename, reason: 'read-failed' });
          continue;
        }

        try {
          if (ext === '.pdf') {
            const srcPdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
            const pageIndices = srcPdf.getPageIndices();
            if (pageIndices.length === 0) {
              skipped.push({ filename, reason: 'empty-pdf' });
              continue;
            }
            const copiedPages = await mergedPdf.copyPages(srcPdf, pageIndices);
            copiedPages.forEach((p) => mergedPdf.addPage(p));
            included.push(filename);
            continue;
          }

          if (ext === '.jpg' || ext === '.jpeg') {
            const image = await mergedPdf.embedJpg(bytes);
            const page = mergedPdf.addPage([image.width, image.height]);
            page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
            included.push(filename);
            continue;
          }

          if (ext === '.png') {
            const image = await mergedPdf.embedPng(bytes);
            const page = mergedPdf.addPage([image.width, image.height]);
            page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
            included.push(filename);
            continue;
          }

          skipped.push({ filename, reason: 'unsupported-format' });
        } catch (_) {
          skipped.push({ filename, reason: 'parse-failed' });
        }
      }

      if (included.length === 0) {
        return res.status(400).json({ error: 'No PDF/Image files could be merged. Supported: PDF, JPG, JPEG, PNG.' });
      }

      const pdfBytes = await mergedPdf.save();
      const invoiceRef = sanitizeFolderName(String(row.invoiceNumber || row.id || 'shipment'));
      const outName = `PrintPacket_${invoiceRef}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${outName}"`);
      res.setHeader('X-Merge-Included-Count', String(included.length));
      res.setHeader('X-Merge-Skipped-Count', String(skipped.length));
      res.setHeader('X-Merge-Skipped', encodeURIComponent(JSON.stringify(skipped.slice(0, 25))));
      res.status(200).send(Buffer.from(pdfBytes));
    } catch (err) {
      console.error('POST /:id/files/merge-pdf error:', err);
      if (!res.headersSent) res.status(500).json({ error: 'Failed to merge files into PDF' });
    }
  });

  router.post('/:id/files', hasPermission('documents.upload'), multerDisk.single('file'), async (req, res) => {
    let tempFileMoved = false;
    try {
      const idCheck = validateId(req.params && req.params.id, 'Shipment ID');
      if (!idCheck.valid) return res.status(400).json({ error: idCheck.message });
      const id = idCheck.value;
      const row = db.prepare('SELECT * FROM shipments WHERE id = ?').get(id);
      if (!row) return res.status(404).json({ error: 'Shipment not found' });
      let folderPath;
      try {
        folderPath = getValidDocumentsFolderPath(row);
      } catch (e) {
        console.warn('getValidDocumentsFolderPath failed (files upload):', e.message);
        return res.status(500).json({ error: 'Documents folder could not be resolved' });
      }
      if (!folderPath || typeof folderPath !== 'string') return res.status(404).json({ error: 'Documents folder not available' });
      if (!req.file || !req.file.path) return res.status(400).json({ error: 'No file uploaded' });
      const rawName = req.file.originalname || path.basename(req.file.path) || 'upload';
      const ext = (path.extname(rawName) || '').toLowerCase();
      if (!ALLOWED_FILE_EXTENSIONS.includes(ext)) {
        return res.status(400).json({ error: 'File type not allowed. Allowed types: PDF, JPG, PNG, XLSX, DOCX, CSV, TXT.' });
      }
      const docTypeRaw = (req.query && typeof req.query.documentType === 'string') ? req.query.documentType.trim() : '';
      let filename;
      if (docTypeRaw && docTypeRaw !== 'Other') {
        const docType = docTypeRaw.replace(/[/\\:*?"<>|]/g, '_').trim().slice(0, 80) || 'Doc';
        const { partnerName, invoiceNo } = getShipmentPartnerAndInvoice(row);
        const baseName = `${docType}_${partnerName}_${invoiceNo}${ext}`;
        filename = sanitizeFileDownloadFilename(baseName) || baseName;
        let n = 2;
        while (fs.existsSync(path.join(folderPath, filename))) {
          const baseNoExt = path.basename(filename, ext) || filename.replace(ext, '');
          filename = sanitizeFileDownloadFilename(baseNoExt + '_' + n + ext) || baseNoExt + '_' + n + ext;
          n++;
        }
      } else {
        const baseName = sanitizeFileDownloadFilename(rawName) || rawName.replace(/[^a-zA-Z0-9._-]/g, '_') || 'upload';
        filename = sanitizeFileDownloadFilename(baseName) || baseName;
        let n = 2;
        while (fs.existsSync(path.join(folderPath, filename))) {
          const baseNoExt = path.basename(filename, ext) || filename.replace(ext, '');
          filename = sanitizeFileDownloadFilename(baseNoExt + '_' + n + ext) || baseNoExt + '_' + n + ext;
          n++;
        }
      }
      let fullPath = path.join(folderPath, filename);
      const resolvedFull = path.resolve(fullPath);
      const resolvedBase = path.resolve(folderPath);
      if (resolvedFull !== resolvedBase && !resolvedFull.startsWith(resolvedBase + path.sep)) {
        return res.status(400).json({ error: 'Invalid file name' });
      }
      let written = false;
      try {
        await fse.ensureDir(folderPath);
        await fse.move(req.file.path, fullPath, { overwrite: false });
        tempFileMoved = true;
        written = true;
      } catch (writeErr) {
        if (isUncPath(folderPath)) {
          const isExportRow = !!(row.buyerId && !row.supplierId);
          const localBase = isExportRow ? LOCAL_EXPORT_DOCS : LOCAL_IMPORT_DOCS;
          const parts = folderPath.split(path.sep).filter(Boolean);
          const lastTwo = parts.slice(-2);
          if (lastTwo.length === 2) {
            const localFolder = path.join(localBase, lastTwo[0], lastTwo[1]);
            const localFull = path.join(localFolder, filename);
            try {
              await fse.ensureDir(localFolder);
              await fse.move(req.file.path, localFull, { overwrite: false });
              tempFileMoved = true;
              folderPath = localFolder;
              fullPath = localFull;
              written = true;
              console.warn('Network path not writable, saved to local:', localFolder);
              try { db.prepare('UPDATE shipments SET documentsFolderPath = ? WHERE id = ?').run(localFolder, id); } catch (_) {}
            } catch (localErr) {
              console.warn('File write error (local fallback failed):', localErr.message);
            }
          }
        }
        if (!written) {
          console.warn('File write error:', writeErr.message);
          return res.status(500).json({ error: 'Failed to save file' });
        }
      }
      const userId = req.user && req.user.id;
      const userName = getUserName(db, userId) || userId || 'System';
      auditLog(db, userId, 'DOCUMENT_UPLOADED', id, { filename, userName, message: `User ${userName} uploaded '${filename}' for Shipment #${id}` });
      broadcast();
      res.status(201).json({ success: true, filename });
    } catch (err) {
      console.error('POST /:id/files error:', err);
      if (!res.headersSent) res.status(500).json({ error: 'An error occurred' });
    } finally {
      if (req.file && req.file.path && !tempFileMoved) {
        try { await fse.remove(req.file.path); } catch (_) {}
      }
    }
  });

  router.delete('/:id/files/:filename', hasPermission('documents.delete'), (req, res) => {
    try {
      const idCheck = validateId(req.params && req.params.id, 'Shipment ID');
      if (!idCheck.valid) return res.status(400).json({ error: idCheck.message });
      const id = idCheck.value;
      const filename = sanitizeFileDownloadFilename(req.params && req.params.filename);
      if (!filename) return res.status(400).json({ error: 'Invalid file name' });
      const row = db.prepare('SELECT * FROM shipments WHERE id = ?').get(id);
      if (!row) return res.status(404).json({ error: 'Shipment not found' });
      let folderPath;
      try {
        folderPath = getValidDocumentsFolderPath(row);
      } catch (e) {
        console.warn('getValidDocumentsFolderPath failed (files delete):', e.message);
        return res.status(500).json({ error: 'Documents folder could not be resolved' });
      }
      if (!folderPath || typeof folderPath !== 'string') return res.status(404).json({ error: 'Documents folder not available' });
      const fullPath = path.join(folderPath, filename);
      const resolvedFull = path.resolve(fullPath);
      const resolvedBase = path.resolve(folderPath);
      if (resolvedFull !== resolvedBase && !resolvedFull.startsWith(resolvedBase + path.sep)) {
        return res.status(400).json({ error: 'Invalid file name' });
      }
      if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not found' });
      try {
        fs.unlinkSync(fullPath);
      } catch (unlinkErr) {
        console.warn('File delete error:', unlinkErr.message);
        return res.status(500).json({ error: 'Failed to delete file' });
      }
      const userId = req.user && req.user.id;
      const userName = getUserName(db, userId) || userId || 'System';
      auditLog(db, userId, 'DOCUMENT_DELETED', id, { filename, userName, message: `User ${userName} deleted '${filename}' for Shipment #${id}` });
      broadcast();
      res.json({ success: true });
    } catch (err) {
      console.error('DELETE /:id/files/:filename error:', err);
      if (!res.headersSent) res.status(500).json({ error: 'An error occurred' });
    }
  });

  router.post('/', hasPermission('shipments.create'), (req, res) => {
    const s = req.body;
    if (!s || typeof s !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    const idCheck = validateId(s.id, 'Shipment ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const sNorm = clientToCents({ ...s, id: idCheck.value });
    let overrideUsed = false;
    try {
      checkLicenceExpiry(sNorm);
      overrideUsed = enforceLicenceCompliance(req, sNorm, null);
    } catch (e) {
      return res.status(e.statusCode || 400).json({ success: false, error: e.message });
    }
    const documentsFolderPath = ensureShipmentDocumentsFolder(sNorm);
    const stmt = db.prepare(SHIPMENT_INSERT_OR_REPLACE_SQL);
    try {
      const runTx = db.transaction(() => {
        stmt.run(getShipmentValues(sNorm, documentsFolderPath));
        setShipmentItems(idCheck.value, s.items || []);
        setShipmentHistory(idCheck.value, s.history || []);
      });
      runTx();
    } catch (e) {
      console.error('POST /api/shipments transaction error:', e);
      return res.status(500).json({ success: false, error: e.message || 'Database error' });
    }
    try {
      linkShipmentToLC(sNorm, broadcast);
    } catch (lcErr) {
      return res.status(lcErr.statusCode || 400).json({ success: false, error: lcErr.message });
    }
    const userId = req.user && req.user.id;
    auditLog(db, userId, 'SHIPMENT_CREATED', idCheck.value, { invoiceNumber: sNorm.invoiceNumber });
    if (overrideUsed) {
      auditLog(db, userId, 'LICENCE_OVERRIDE_USED', idCheck.value, {
        invoiceNumber: sNorm.invoiceNumber,
        userName: getUserName(db, userId) || userId || 'System',
      });
    }
    res.json({ success: true });
    broadcast();
  });

  router.post('/import', hasPermission('shipments.create'), (req, res) => {
    const body = req.body;
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    const isExport = !!body?.isExport;
    if (rows.length === 0) return res.status(400).json({ success: false, error: 'Send { rows: [...], isExport?: boolean } with shipment row objects' });
    const now = new Date().toISOString();
    const stmt = db.prepare(SHIPMENT_INSERT_OR_REPLACE_SQL);
    let imported = 0;
    try {
      for (const r of rows) {
        let supplierId = null;
        let buyerId = null;
        if (isExport) {
          const bRow = r.buyerId ? { id: r.buyerId } : (r.buyerName ? db.prepare('SELECT id FROM buyers WHERE name = ? LIMIT 1').get(r.buyerName) : null);
          buyerId = bRow ? bRow.id : null;
          if (!buyerId) continue; // skip row without valid buyer
        } else {
          const sRow = r.supplierId ? { id: r.supplierId } : (r.supplierName ? db.prepare('SELECT id FROM suppliers WHERE name = ? LIMIT 1').get(r.supplierName) : null);
          supplierId = sRow ? sRow.id : null;
          if (!supplierId) continue;
        }
        const productName = r.productName || r.ProductName || r.product_name || '';
        const hsnCode = normalizeHsnCode(r.hsnCode || r.HSNCode || r.hsn_code || '');
        const quantity = Number(r.quantity) || Number(r.Quantity) || 0;
        const unit = r.unit || r.Unit || 'KGS';
        const rate = Number(r.rate) || Number(r.ratePerUnit) || 0;
        const amount = Number(r.amount) || Number(r.Amount) || (quantity * rate) || 0;
        const exchangeRate = Number(r.exchangeRate) || Number(r.exchange_rate) || 1;
        const shipmentModeRaw = String(r.shipmentMode || r.shipment_mode || r.modeShipment || r.mode_of_shipment || 'SEA').toUpperCase();
        const shipmentMode = ['SEA', 'AIR', 'ROAD', 'RAIL'].includes(shipmentModeRaw) ? shipmentModeRaw : 'SEA';
        const invoiceValueINR = Math.round((amount * exchangeRate) * 100) / 100;
        const id = r.id && /^[a-zA-Z0-9_-]+$/.test(r.id) ? r.id : 'sh_' + Math.random().toString(36).slice(2, 11);
        const invoiceNumber = r.invoiceNumber || r.InvoiceNo || r.invoice_number || id;
        const company = (r.company === 'GTEX' || r.company === 'GFPL') ? r.company : 'GFPL';
        const expectedShipmentDate = r.expectedShipmentDate || r.ExpectedShipmentDate || r.expected_shipment_date || null;
        const invoiceDate = r.invoiceDate || r.InvoiceDate || r.invoice_date || now.slice(0, 10);
        const history = [{ status: 'ORDERED', date: now, location: 'Import', remarks: 'Bulk import' }];
        const items = [{
          productId: r.productId || null,
          productName: productName || 'Product',
          description: r.description || null,
          hsnCode: hsnCode || '',
          quantity,
          unit,
          rate,
          amount,
          productType: r.productType || 'RAW_MATERIAL',
        }];
        const sNorm = clientToCents({
          id,
          supplierId,
          buyerId,
          invoiceNumber,
          company,
          amount,
          currency: r.currency || 'USD',
          exchangeRate,
          rate,
          quantity,
          expectedShipmentDate,
          createdAt: now,
          invoiceDate,
          shipmentMode,
          fobValueFC: amount,
          fobValueINR: invoiceValueINR,
          invoiceValueINR,
          isUnderLC: false,
          isUnderLicence: false,
          status: r.status || 'ORDERED',
          history,
          items,
          documents: {},
          payments: [],
        });
        const documentsFolderPath = ensureShipmentDocumentsFolder(sNorm);
        try {
          stmt.run(getShipmentValues(sNorm, documentsFolderPath));
          setShipmentItems(id, items);
          setShipmentHistory(id, history);
          imported++;
        } catch (rowErr) {
          console.warn('shipment import row skip:', id, rowErr.message);
        }
      }
      const userId = req.user && req.user.id;
      auditLog(db, userId, 'SHIPMENTS_IMPORTED', null, { count: imported, isExport, message: `Imported ${imported} shipment(s)` });
      broadcast();
      res.json({ success: true, imported });
    } catch (e) {
      console.error('shipments import:', e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  router.put('/:id', hasPermission('shipments.edit'), (req, res) => {
    const idCheck = validateId(req.params && req.params.id, 'Shipment ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const id = idCheck.value;
    const s = req.body;
    if (!s || typeof s !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });

    const sNorm = clientToCents({ ...s, id });
    let overrideUsed = false;
    try {
      checkLicenceExpiry(sNorm);
      overrideUsed = enforceLicenceCompliance(req, sNorm, id);
    } catch (e) {
      return res.status(e.statusCode || 400).json({ success: false, error: e.message });
    }

    const exists = db.prepare('SELECT 1 FROM shipments WHERE id = ?').get(id);
    if (exists && (s.version == null || s.version === undefined)) {
      return res.status(400).json({ success: false, error: 'Version is required for update' });
    }

    const insertStmt = db.prepare(SHIPMENT_INSERT_OR_REPLACE_SQL);
    const updateStmt = db.prepare(`
      UPDATE shipments SET
        status=?, containerNumber=?, blNumber=?, blDate=?, beNumber=?, beDate=?,
        shippingLine=?, shipmentMode=?, portCode=?, portOfLoading=?, portOfDischarge=?,
        assessedValue=?, dutyBCD=?, dutySWS=?, dutyINT=?, dutyPenalty=?, dutyFine=?, gst=?, trackingUrl=?,
        documents_json=?, history_json=?, payments_json=?, items_json=?,
        isUnderLicence=?, linkedLicenceId=?, epcgLicenceId=?, advLicenceId=?, licenceObligationAmount=?, licenceObligationQuantity=?,
        incoTerm=?, paymentDueDate=?, paymentTerm=?, expectedArrivalDate=?,
        invoiceDate=?, freightCharges=?, otherCharges=?, exchangeRate=?, remarks=?,
        fobValueFC=?, fobValueINR=?,
        isUnderLC=?, lcNumber=?, lcAmount=?, lcDate=?, linkedLcId=?, fileStatus=?, consigneeId=?, lcSettled=?,
        shipperSealNumber=?, lineSealNumber=?, sbNo=?, sbDate=?, dbk=?, rodtep=?, scripNo=?,
        licenceImportLines_json=?, licenceExportLines_json=?, licence_allocations_json=?,
        version = version + 1
      WHERE id=? AND version=?
    `);

    try {
      const runTx = db.transaction(() => {
        const exists = db.prepare('SELECT 1 FROM shipments WHERE id = ?').get(id);
        if (!exists) {
          const documentsFolderPath = ensureShipmentDocumentsFolder(sNorm);
          insertStmt.run(getShipmentValues(sNorm, documentsFolderPath));
          setShipmentItems(id, s.items || []);
          setShipmentHistory(id, s.history || []);
        } else {
          const version = s.version;
          const existingRow = db.prepare('SELECT supplierId, buyerId, currency, amount, fobValueFC, exchangeRate, remarks, paymentTerm, fileStatus, consigneeId, lcSettled, shipmentMode, documents_json, history_json, payments_json, licence_allocations_json, licenceExportLines_json, licenceImportLines_json FROM shipments WHERE id = ?').get(id);
          const existing = existingRow;
          const existingPayments = safeParseJson(existingRow?.payments_json, []);
          const shipmentCurrency = String(s.currency || existingRow?.currency || 'USD').toUpperCase();
          const shipmentExchangeRate = Number(s.exchangeRate != null ? s.exchangeRate : existingRow?.exchangeRate) || 1;
          const isOutgoing = !!(s.supplierId != null ? s.supplierId : existingRow?.supplierId);
          const effectiveAmount = Number(s.amount != null ? s.amount : fromCents(existingRow?.amount));
          const effectiveFobValueFC = Number(s.fobValueFC != null ? s.fobValueFC : fromCents(existingRow?.fobValueFC));
          const totalDueFC = Math.max(0, isOutgoing ? effectiveAmount : (Number.isFinite(effectiveFobValueFC) && effectiveFobValueFC > 0 ? effectiveFobValueFC : effectiveAmount));
          const candidatePayments = s.payments !== undefined ? (s.payments || []) : existingPayments;
          const paidOrReceivedFC = computePaidOrReceivedFC(candidatePayments, shipmentCurrency, shipmentExchangeRate, isOutgoing);
          if (paidOrReceivedFC > totalDueFC + 0.0001) {
            const overBy = paidOrReceivedFC - totalDueFC;
            const err = new Error(`Payment exceeds pending by ${overBy.toFixed(2)} ${shipmentCurrency}.`);
            err.statusCode = 400;
            throw err;
          }
          const existingPaymentIds = new Set((existingPayments || []).map(p => p.id));
          const allowedFileStatus = ['pending', 'clearing', 'ok'].includes(s.fileStatus) ? s.fileStatus : (existing?.fileStatus ?? null);
          const consigneeIdVal = s.consigneeId !== undefined ? s.consigneeId : (existing?.consigneeId ?? null);
          const lcSettledVal = s.lcSettled !== undefined ? (s.lcSettled ? 1 : 0) : (existing?.lcSettled ?? 0);
          const documentsJson = s.documents !== undefined
            ? JSON.stringify(s.documents || {})
            : (existingRow?.documents_json ?? '{}');
          const historyJson = s.history !== undefined
            ? JSON.stringify(s.history || [])
            : (existingRow?.history_json ?? '[]');
          const paymentsJson = s.payments !== undefined
            ? JSON.stringify(s.payments || [])
            : (existingRow?.payments_json ?? '[]');
          // Licence lines/allocations are managed in Licence Tracker; preserve when not sent from Shipment Master
          const licenceImportLinesJson = s.licenceImportLines !== undefined
            ? (Array.isArray(s.licenceImportLines) ? JSON.stringify(s.licenceImportLines) : null)
            : (existingRow?.licenceImportLines_json ?? null);
          const licenceExportLinesJson = s.licenceExportLines !== undefined
            ? (Array.isArray(s.licenceExportLines) ? JSON.stringify(s.licenceExportLines) : null)
            : (existingRow?.licenceExportLines_json ?? null);
          // Allocations: preserve existing when not sent
          const licenceAllocationsJson = s.licenceAllocations !== undefined
            ? (Array.isArray(s.licenceAllocations) && s.licenceAllocations.length > 0 ? JSON.stringify(s.licenceAllocations) : null)
            : (existingRow?.licence_allocations_json ?? null);
          const result = updateStmt.run(
            s.status, sNorm.containerNumber, sNorm.blNumber, sNorm.blDate, sNorm.beNumber, sNorm.beDate,
            sNorm.shippingLine, (s.shipmentMode !== undefined ? (sNorm.shipmentMode || 'SEA') : (existing?.shipmentMode || 'SEA')), sNorm.portCode, sNorm.portOfLoading, sNorm.portOfDischarge,
            sNorm.assessedValue, sNorm.dutyBCD, sNorm.dutySWS, sNorm.dutyINT, (sNorm.dutyPenalty != null ? sNorm.dutyPenalty : null), (sNorm.dutyFine != null ? sNorm.dutyFine : null), sNorm.gst, sNorm.trackingUrl,
            documentsJson, historyJson, paymentsJson, null,
            sNorm.isUnderLicence ? 1 : 0, sNorm.linkedLicenceId || null, sNorm.epcgLicenceId || null, sNorm.advLicenceId || null, sNorm.licenceObligationAmount ?? null, sNorm.licenceObligationQuantity ?? null,
            sNorm.incoTerm, sNorm.paymentDueDate, (s.paymentTerm !== undefined ? s.paymentTerm : (existing?.paymentTerm ?? null)), sNorm.expectedArrivalDate || null,
            sNorm.invoiceDate || null, sNorm.freightCharges ?? null, sNorm.otherCharges ?? null,
            s.exchangeRate !== undefined && s.exchangeRate !== null ? s.exchangeRate : (existing?.exchangeRate ?? null),
            s.remarks !== undefined ? s.remarks : (existing?.remarks ?? null),
            sNorm.fobValueFC ?? null, sNorm.fobValueINR ?? null,
            sNorm.isUnderLC ? 1 : 0, sNorm.lcNumber || null, sNorm.lcAmount ?? null, sNorm.lcDate || null, sNorm.linkedLcId || null,
            allowedFileStatus,
            consigneeIdVal,
            lcSettledVal,
            sNorm.shipperSealNumber || null,
            sNorm.lineSealNumber || null,
            sNorm.sbNo || null,
            sNorm.sbDate || null,
            sNorm.dbk ?? null,
            sNorm.rodtep ?? null,
            (sNorm.scripNo !== undefined && sNorm.scripNo !== null ? String(sNorm.scripNo) : null),
            licenceImportLinesJson,
            licenceExportLinesJson,
            licenceAllocationsJson,
            id,
            version
          );
          if (result.changes === 0) {
            const err = new Error('Data was modified by another user.');
            err.statusCode = 409;
            throw err;
          }
          if (s.items !== undefined) setShipmentItems(id, s.items || []);
          if (s.history !== undefined) setShipmentHistory(id, s.history || []);
          // Apply new LC payments: reduce LC balance and record lc_transaction
          const newPayments = s.payments || [];
          for (const p of newPayments) {
            if (!existingPaymentIds.has(p.id) && (p.mode === 'LC' || p.mode === 'Letter of Credit') && p.linkedLcId) {
              const amt = Number(p.amount);
              if (!Number.isNaN(amt) && amt > 0) applyLCPayment(p.linkedLcId, amt, p.currency, p.date, id, broadcast);
            }
          }
        }
      });
      runTx();
    } catch (e) {
      if (e.statusCode === 409) return res.status(409).json({ success: false, error: e.message });
      if (e.statusCode === 400) return res.status(400).json({ success: false, error: e.message });
      console.error('PUT /api/shipments/:id transaction error:', e);
      return res.status(500).json({ success: false, error: e.message || 'Database error' });
    }
    try {
      linkShipmentToLC(sNorm, broadcast);
    } catch (lcErr) {
      return res.status(lcErr.statusCode || 400).json({ success: false, error: lcErr.message });
    }
    // Backfill: apply any existing LC payments that don't have linkedLcId yet (e.g. added before this feature)
    const row = db.prepare('SELECT payments_json FROM shipments WHERE id = ?').get(id);
    const currentPayments = safeParseJson(row?.payments_json, []);
    let backfillApplied = false;
    const lcNumberForBackfill = (s.lcNumber || sNorm.lcNumber || '').toString().trim();
    for (const p of currentPayments) {
      if ((p.mode === 'LC' || p.mode === 'Letter of Credit') && Number(p.amount) > 0 && !p.linkedLcId && lcNumberForBackfill) {
        const lcRow = db.prepare('SELECT id FROM lcs WHERE lcNumber = ?').get(lcNumberForBackfill);
        if (lcRow) {
          try {
            applyLCPayment(lcRow.id, Number(p.amount), p.currency, p.date, id, broadcast);
            p.linkedLcId = lcRow.id;
            backfillApplied = true;
          } catch (lcErr) {
            return res.status(lcErr.statusCode || 400).json({ success: false, error: lcErr.message });
          }
        }
      }
    }
    if (backfillApplied) {
      db.prepare('UPDATE shipments SET payments_json = ? WHERE id = ?').run(JSON.stringify(currentPayments), id);
      broadcast();
    }
    const userId = req.user && req.user.id;
    auditLog(db, userId, 'SHIPMENT_UPDATED', id, { invoiceNumber: sNorm.invoiceNumber });
    if (overrideUsed) {
      auditLog(db, userId, 'LICENCE_OVERRIDE_USED', id, {
        invoiceNumber: sNorm.invoiceNumber,
        userName: getUserName(db, userId) || userId || 'System',
      });
    }
    const versionRow = db.prepare('SELECT version FROM shipments WHERE id = ?').get(id);
    res.json({ success: true, version: versionRow ? versionRow.version : undefined });
    broadcast();
  });

  router.delete('/:id', hasPermission('shipments.delete'), (req, res) => {
    const idCheck = validateId(req.params && req.params.id, 'Shipment ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const id = idCheck.value;
    try {
      const row = db.prepare('SELECT invoiceNumber FROM shipments WHERE id = ?').get(id);
      const runTx = db.transaction(() => {
        const lcRows = db.prepare('SELECT id, shipments_json FROM lcs').all();
        for (const lc of lcRows) {
          let list = [];
          try {
            list = JSON.parse(lc.shipments_json || '[]');
          } catch (_) {}
          if (!Array.isArray(list)) continue;
          const next = list.filter(sid => String(sid) !== String(id));
          if (next.length !== list.length) {
            db.prepare('UPDATE lcs SET shipments_json = ? WHERE id = ?').run(JSON.stringify(next), lc.id);
          }
        }
        db.prepare('DELETE FROM shipment_items WHERE shipmentId = ?').run(id);
        db.prepare('DELETE FROM shipment_history WHERE shipmentId = ?').run(id);
        db.prepare('DELETE FROM shipments WHERE id = ?').run(id);
      });
      runTx();
      const userId = req.user && req.user.id;
      auditLog(db, userId, 'SHIPMENT_DELETED', id, { invoiceNumber: row ? row.invoiceNumber : null });
      broadcast();
      res.json({ success: true });
    } catch (e) {
      console.error('DELETE /api/shipments/:id error:', e);
      return res.status(500).json({ success: false, error: e.message || 'Database error' });
    }
  });

  return router;
}

module.exports = createRouter;
