const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');
const getShipmentValues = db.getShipmentValues;
const SHIPMENT_INSERT_OR_REPLACE_SQL = db.SHIPMENT_INSERT_OR_REPLACE_SQL;
const { IMPORT_DOCS_BASE, EXPORT_DOCS_BASE, COMPANY_FOLDER } = require('../config');
const { validateId, hasPermission } = require('../middleware');
const { log: auditLog, getUserName } = require('../services/auditService');

function safeParseJson(str, fallback) {
  if (str == null || str === '') return fallback;
  try {
    const parsed = JSON.parse(str);
    return parsed != null ? parsed : fallback;
  } catch (_) {
    return fallback;
  }
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
      it.hsnCode || null,
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

/** Build and create shipment folder: [Import|Export] / [Gujarat Flotex|GTEX Fabrics] / [PartnerName_InvoiceNo] (e.g. Reliance_87). */
function ensureShipmentDocumentsFolder(shipment) {
  if (!shipment) return null;
  try {
    const isExport = !!(shipment.buyerId && !shipment.supplierId);
    const base = isExport ? EXPORT_DOCS_BASE : IMPORT_DOCS_BASE;
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
    const fullPath = path.join(String(base), String(companyFolder), String(folderName));
    const baseWithCompany = path.join(base, companyFolder);
    if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });
    if (!fs.existsSync(baseWithCompany)) fs.mkdirSync(baseWithCompany, { recursive: true });
    if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
    return fullPath;
  } catch (e) {
    console.warn('ensureShipmentDocumentsFolder error:', e.message);
    return null;
  }
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
  const linkedId = shipment.linkedLicenceId;
  if (!linkedId) return;
  const licence = db.prepare('SELECT expiryDate FROM licences WHERE id = ?').get(linkedId);
  if (!licence || !licence.expiryDate) return;
  const shipmentDate = shipment.expectedShipmentDate || shipment.invoiceDate;
  if (!shipmentDate) return;
  if (licence.expiryDate < shipmentDate) {
    const err = new Error('Compliance Error: Selected Licence has expired.');
    err.statusCode = 400;
    throw err;
  }
}

function linkShipmentToLC(shipment, broadcast) {
  if (!shipment || !shipment.isUnderLC || !shipment.lcNumber) return;
  const lcRef = String(shipment.lcNumber).trim();
  if (!lcRef) return;
  const shipmentId = shipment.id;
  const shipmentValue = Number(shipment.amount) || 0;
  const shipmentValueMajor = shipmentValue / 100;
  let row = null;
  try {
    row = db.prepare('SELECT * FROM lcs WHERE lcNumber = ?').get(lcRef);
  } catch (e) {
    return;
  }
  if (row) {
    const shipments = (() => { try { return JSON.parse(row.shipments_json || '[]'); } catch (_) { return []; } })();
    if (shipments.indexOf(shipmentId) !== -1) return;
    const balanceAmount = Number(row.balanceAmount);
    const currentBalance = (Number.isNaN(balanceAmount) ? (Number(row.amount) || 0) : balanceAmount);
    const shipmentValueMajor = shipmentValue / 100;
    if (currentBalance - shipmentValueMajor < 0) {
      const err = new Error('Transaction Declined: Letter of Credit limit exceeded.');
      err.statusCode = 400;
      throw err;
    }
    const newBalance = currentBalance - shipmentValueMajor;
    shipments.push(shipmentId);
    try {
      db.prepare('UPDATE lcs SET shipments_json = ?, balanceAmount = ? WHERE id = ?').run(JSON.stringify(shipments), newBalance, row.id);
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
  try {
    const ins = db.prepare('INSERT INTO lcs (id, lcNumber, issuingBank, supplierId, buyerId, amount, balanceAmount, currency, issueDate, expiryDate, maturityDate, company, status, remarks, shipments_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    ins.run(
      newId, lcRef, '—', isExport ? null : (shipment.supplierId || null), isExport ? (shipment.buyerId || null) : null,
      shipmentValueMajor, 0, shipment.currency || 'USD', now, now, now, shipment.company || 'GFPL', 'DRAFT', 'Auto-created from shipment',
      JSON.stringify([shipmentId])
    );
  } catch (e) {
    if (/no such column/.test(e.message)) {
      db.prepare('INSERT OR REPLACE INTO lcs (id, lcNumber, issuingBank, supplierId, buyerId, amount, currency, issueDate, expiryDate, maturityDate, company, status, remarks) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
        newId, lcRef, '—', isExport ? null : (shipment.supplierId || null), isExport ? (shipment.buyerId || null) : null,
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

const multerMemory = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

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

function buildShipmentResponse(r) {
  const folderPath = isValidDocumentsFolderPath(r.documentsFolderPath) ? r.documentsFolderPath : null;
  const items = getShipmentItems(r.id) ?? (r.productId ? [{ productId: r.productId, productName: '', quantity: fromCents(r.quantity), rate: fromCents(r.rate), amount: fromCents(r.quantity) * fromCents(r.rate) }] : []);
  const history = getShipmentHistory(r.id) ?? [];
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
    documentsFolderPath: folderPath
  };
}

function createRouter(broadcast) {
  const router = express.Router();

  router.get('/', hasPermission('shipments.view'), (req, res) => {
    try {
      const rows = db.prepare('SELECT * FROM shipments').all();
      const result = [];
      for (const r of rows) {
        try {
          result.push(buildShipmentResponse(r));
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

  router.post('/:id/files', hasPermission('documents.upload'), multerMemory.single('file'), (req, res) => {
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
      if (!req.file || !req.file.buffer) return res.status(400).json({ error: 'No file uploaded' });
      const rawName = req.file.originalname || 'upload';
      let baseName = sanitizeFileDownloadFilename(rawName) || rawName.replace(/[^a-zA-Z0-9._-]/g, '_') || 'upload';
      const docTypeRaw = (req.query && typeof req.query.documentType === 'string') ? req.query.documentType.trim() : '';
      const docType = docTypeRaw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20);
      if (docType.length > 0) baseName = docType + '_' + baseName;
      const filename = sanitizeFileDownloadFilename(baseName) || baseName;
      const fullPath = path.join(folderPath, filename);
      const resolvedFull = path.resolve(fullPath);
      const resolvedBase = path.resolve(folderPath);
      if (resolvedFull !== resolvedBase && !resolvedFull.startsWith(resolvedBase + path.sep)) {
        return res.status(400).json({ error: 'Invalid file name' });
      }
      try {
        if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
        fs.writeFileSync(fullPath, req.file.buffer);
      } catch (writeErr) {
        console.warn('File write error:', writeErr.message);
        return res.status(500).json({ error: 'Failed to save file' });
      }
      const userId = req.user && req.user.id;
      const userName = getUserName(db, userId) || userId || 'System';
      auditLog(db, userId, 'DOCUMENT_UPLOADED', id, { filename, userName, message: `User ${userName} uploaded '${filename}' for Shipment #${id}` });
      broadcast();
      res.status(201).json({ success: true, filename });
    } catch (err) {
      console.error('POST /:id/files error:', err);
      if (!res.headersSent) res.status(500).json({ error: 'An error occurred' });
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
    try {
      checkLicenceExpiry(sNorm);
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
    res.json({ success: true });
    broadcast();
  });

  router.put('/:id', hasPermission('shipments.edit'), (req, res) => {
    const idCheck = validateId(req.params && req.params.id, 'Shipment ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const id = idCheck.value;
    const s = req.body;
    if (!s || typeof s !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });

    const sNorm = clientToCents({ ...s, id });
    try {
      checkLicenceExpiry(sNorm);
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
        shippingLine=?, portCode=?, portOfLoading=?, portOfDischarge=?,
        assessedValue=?, dutyBCD=?, dutySWS=?, dutyINT=?, gst=?, trackingUrl=?,
        documents_json=?, history_json=?, payments_json=?, items_json=?,
        isUnderLicence=?, linkedLicenceId=?, epcgLicenceId=?, advLicenceId=?, licenceObligationAmount=?, licenceObligationQuantity=?,
        incoTerm=?, paymentDueDate=?, expectedArrivalDate=?,
        invoiceDate=?, freightCharges=?, otherCharges=?, exchangeRate=?, remarks=?,
        fobValueFC=?, fobValueINR=?,
        isUnderLC=?, lcNumber=?, lcAmount=?, lcDate=?, fileStatus=?, consigneeId=?, lcSettled=?,
        shipperSealNumber=?, lineSealNumber=?, sbNo=?, sbDate=?, dbk=?, rodtep=?,
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
          const existing = db.prepare('SELECT exchangeRate, remarks, fileStatus, consigneeId, lcSettled FROM shipments WHERE id = ?').get(id);
          const allowedFileStatus = ['pending', 'clearing', 'ok'].includes(s.fileStatus) ? s.fileStatus : (existing?.fileStatus ?? null);
          const consigneeIdVal = s.consigneeId !== undefined ? s.consigneeId : (existing?.consigneeId ?? null);
          const lcSettledVal = s.lcSettled !== undefined ? (s.lcSettled ? 1 : 0) : (existing?.lcSettled ?? 0);
          const result = updateStmt.run(
            s.status, sNorm.containerNumber, sNorm.blNumber, sNorm.blDate, sNorm.beNumber, sNorm.beDate,
            sNorm.shippingLine, sNorm.portCode, sNorm.portOfLoading, sNorm.portOfDischarge,
            sNorm.assessedValue, sNorm.dutyBCD, sNorm.dutySWS, sNorm.dutyINT, sNorm.gst, sNorm.trackingUrl,
            JSON.stringify(s.documents || {}), '[]', JSON.stringify(s.payments || []), null,
            sNorm.isUnderLicence ? 1 : 0, sNorm.linkedLicenceId || null, sNorm.epcgLicenceId || null, sNorm.advLicenceId || null, sNorm.licenceObligationAmount ?? null, sNorm.licenceObligationQuantity ?? null,
            sNorm.incoTerm, sNorm.paymentDueDate, sNorm.expectedArrivalDate || null,
            sNorm.invoiceDate || null, sNorm.freightCharges ?? null, sNorm.otherCharges ?? null,
            s.exchangeRate !== undefined && s.exchangeRate !== null ? s.exchangeRate : (existing?.exchangeRate ?? null),
            s.remarks !== undefined ? s.remarks : (existing?.remarks ?? null),
            sNorm.fobValueFC ?? null, sNorm.fobValueINR ?? null,
            sNorm.isUnderLC ? 1 : 0, sNorm.lcNumber || null, sNorm.lcAmount ?? null, sNorm.lcDate || null,
            allowedFileStatus,
            consigneeIdVal,
            lcSettledVal,
            sNorm.shipperSealNumber || null,
            sNorm.lineSealNumber || null,
            sNorm.sbNo || null,
            sNorm.sbDate || null,
            sNorm.dbk ?? null,
            sNorm.rodtep ?? null,
            id,
            version
          );
          if (result.changes === 0) {
            const err = new Error('Data was modified by another user.');
            err.statusCode = 409;
            throw err;
          }
          setShipmentItems(id, s.items || []);
          setShipmentHistory(id, s.history || []);
        }
      });
      runTx();
    } catch (e) {
      if (e.statusCode === 409) return res.status(409).json({ success: false, error: e.message });
      console.error('PUT /api/shipments/:id transaction error:', e);
      return res.status(500).json({ success: false, error: e.message || 'Database error' });
    }
    try {
      linkShipmentToLC(sNorm, broadcast);
    } catch (lcErr) {
      return res.status(lcErr.statusCode || 400).json({ success: false, error: lcErr.message });
    }
    const userId = req.user && req.user.id;
    auditLog(db, userId, 'SHIPMENT_UPDATED', id, { invoiceNumber: sNorm.invoiceNumber });
    const updated = db.prepare('SELECT version FROM shipments WHERE id = ?').get(id);
    res.json({ success: true, version: updated ? updated.version : undefined });
    broadcast();
  });

  router.delete('/:id', hasPermission('shipments.delete'), (req, res) => {
    const idCheck = validateId(req.params && req.params.id, 'Shipment ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const id = idCheck.value;
    try {
      const row = db.prepare('SELECT invoiceNumber FROM shipments WHERE id = ?').get(id);
      const runTx = db.transaction(() => {
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
