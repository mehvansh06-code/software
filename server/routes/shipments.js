const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const db = require('../db');
const getShipmentValues = db.getShipmentValues;
const { IMPORT_DOCS_BASE, EXPORT_DOCS_BASE, COMPANY_FOLDER } = require('../config');
const { validateId } = require('../middleware');

function safeParseJson(str, fallback) {
  if (str == null || str === '') return fallback;
  try {
    const parsed = JSON.parse(str);
    return parsed != null ? parsed : fallback;
  } catch (_) {
    return fallback;
  }
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
    if (rows && rows.length > 0) return rows.map(r => ({ productId: r.productId, productName: r.productName || '', description: r.description, hsnCode: r.hsnCode || '', quantity: r.quantity, unit: r.unit || 'KGS', rate: r.rate, amount: r.amount, productType: r.productType }));
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
    ins.run(shipmentId, it.productId || null, it.productName || null, it.description || null, it.hsnCode || null, it.quantity ?? null, it.unit || 'KGS', it.rate ?? null, it.amount ?? null, it.productType || null, i);
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

function linkShipmentToLC(shipment, broadcast) {
  if (!shipment || !shipment.isUnderLC || !shipment.lcNumber) return;
  const lcRef = String(shipment.lcNumber).trim();
  if (!lcRef) return;
  const shipmentId = shipment.id;
  const shipmentValue = Number(shipment.amount) || 0;
  let row = null;
  try {
    row = db.prepare('SELECT * FROM lcs WHERE lcNumber = ?').get(lcRef);
  } catch (e) {
    return;
  }
  if (row) {
    const shipments = (() => { try { return JSON.parse(row.shipments_json || '[]'); } catch (_) { return []; } })();
    if (shipments.indexOf(shipmentId) !== -1) return;
    shipments.push(shipmentId);
    const balanceAmount = Number(row.balanceAmount);
    const newBalance = (isNaN(balanceAmount) ? (Number(row.amount) || 0) : balanceAmount) - shipmentValue;
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
      shipmentValue, 0, shipment.currency || 'USD', now, now, now, shipment.company || 'GFPL', 'DRAFT', 'Auto-created from shipment',
      JSON.stringify([shipmentId])
    );
  } catch (e) {
    if (/no such column/.test(e.message)) {
      db.prepare('INSERT OR REPLACE INTO lcs (id, lcNumber, issuingBank, supplierId, buyerId, amount, currency, issueDate, expiryDate, maturityDate, company, status, remarks) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
        newId, lcRef, '—', isExport ? null : (shipment.supplierId || null), isExport ? (shipment.buyerId || null) : null,
        shipmentValue, shipment.currency || 'USD', now, now, now, shipment.company || 'GFPL', 'DRAFT', 'Auto-created from shipment'
      );
    } else throw e;
  }
  broadcast();
}

function openFolderResponse(res, success, message, statusCode, debug) {
  if (res.headersSent) return res;
  const payload = { success: !!success, message: message || (success ? 'OK' : 'Error') };
  if (debug != null) payload.debug = debug;
  return res.status(statusCode == null ? 200 : statusCode).json(payload);
}

function createRouter(broadcast) {
  const router = express.Router();

  router.get('/', (req, res) => {
    try {
      const rows = db.prepare('SELECT * FROM shipments').all();
      const result = [];
      for (const r of rows) {
        try {
          const folderPath = isValidDocumentsFolderPath(r.documentsFolderPath) ? r.documentsFolderPath : null;
          const itemsFallback = r.productId ? [{ productId: r.productId, productName: '', quantity: r.quantity, rate: r.rate, amount: (r.quantity || 0) * (r.rate || 0) }] : [];
          const items = getShipmentItems(r.id) || (r.items_json ? safeParseJson(r.items_json, itemsFallback) : itemsFallback);
          const history = getShipmentHistory(r.id) || safeParseJson(r.history_json, []);
          result.push({
            ...r,
            isUnderLC: !!r.isUnderLC,
            isUnderLicence: !!r.isUnderLicence,
            documents: safeParseJson(r.documents_json, {}),
            history,
            payments: safeParseJson(r.payments_json, []),
            items,
            documentsFolderPath: folderPath
          });
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

  router.get('/:id/documents-folder', (req, res) => {
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
        send(folderPath, exists);
      } catch (pathErr) {
        console.warn('GET /documents-folder path/fs:', pathErr.message);
        send(null, false);
      }
    } catch (err) {
      console.error('GET /documents-folder error:', err);
      if (!res.headersSent) res.status(200).json({ path: null, exists: false });
    }
  });

  router.get('/:id/documents-folder-files', (req, res) => {
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
        const files = names.filter((n) => {
          if (typeof n !== 'string' || n.includes('..')) return false;
          const p = path.join(folderPath, n);
          const resolved = path.resolve(p);
          if (resolved !== baseResolved && !resolved.startsWith(baseResolved + path.sep)) return false;
          try { return fs.statSync(p).isFile(); } catch (_) { return false; }
        });
        sendFiles(files);
      } catch (pathErr) {
        console.warn('GET /documents-folder-files path/fs:', pathErr.message);
        sendFiles([]);
      }
    } catch (err) {
      console.error('GET /documents-folder-files error:', err);
      if (!res.headersSent) res.status(200).json({ files: [] });
    }
  });

  router.post('/:id/open-documents-folder', (req, res) => {
    try {
      const idCheck = validateId(req.params && req.params.id, 'Shipment ID');
      if (!idCheck.valid) {
        return openFolderResponse(res, false, idCheck.message, 400, { id: req.params && req.params.id });
      }
      const id = idCheck.value;
      let row;
      try {
        row = db.prepare('SELECT * FROM shipments WHERE id = ?').get(id);
      } catch (dbErr) {
        console.warn('POST open-documents-folder db:', dbErr.message);
        return openFolderResponse(res, false, 'Database error. Try again.', 200, { error: dbErr.message });
      }
      let pathToOpenFromBody = null;
      if (!row && req.body && req.body.shipment) {
        const s = req.body.shipment;
        s.id = s.id || s._id || id;
        let documentsFolderPath;
        try {
          documentsFolderPath = ensureShipmentDocumentsFolder(s);
          pathToOpenFromBody = documentsFolderPath;
        } catch (e) {
          return openFolderResponse(res, false, 'Could not resolve folder path: ' + e.message, 200, { detail: e.message });
        }
        try {
          const stmt50 = db.prepare(`
            INSERT OR REPLACE INTO shipments (
              id, supplierId, buyerId, productId, invoiceNumber, company, amount, currency, exchangeRate, rate, quantity,
              status, expectedShipmentDate, createdAt, fobValueFC, fobValueINR, invoiceValueINR,
              isUnderLC, lcNumber, lcAmount, lcDate, isUnderLicence, linkedLicenceId,
              licenceObligationAmount, containerNumber, blNumber, blDate, beNumber, beDate, shippingLine,
              portCode, portOfLoading, portOfDischarge, assessedValue, dutyBCD, dutySWS, dutyINT, gst, trackingUrl,
              incoTerm, paymentDueDate, expectedArrivalDate, invoiceDate, freightCharges, otherCharges,
              documents_json, history_json, payments_json, items_json, documentsFolderPath, remarks, consigneeId
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          `);
          const runTx = db.transaction(() => {
            stmt50.run(...getShipmentValues(s, documentsFolderPath));
            setShipmentItems(id, s.items);
            setShipmentHistory(id, s.history);
          });
          runTx();
        } catch (insertErr) {
          console.warn('open-documents-folder insert failed:', insertErr.message);
          throw insertErr;
        }
        broadcast();
        row = db.prepare('SELECT * FROM shipments WHERE id = ?').get(id);
      }
      if (!row && !pathToOpenFromBody) {
        return openFolderResponse(res, false, 'Shipment not found. Send the shipment in the request body to create it and open the folder.', 404, { id });
      }
      let folderPath = row ? getValidDocumentsFolderPath(row) : pathToOpenFromBody;
      if (!folderPath || typeof folderPath !== 'string') {
        return openFolderResponse(res, false, 'Documents folder path could not be resolved. Ensure the shipment has Company, Invoice number, and (for import) a supplier or (for export) a buyer.', 400, { pathMissing: true });
      }
      const cleanPath = path.normalize(folderPath).replace(/[/\\]+$/, '');
      console.log('[Open Folder] Shipment id:', id, '| Resolved path:', cleanPath);

      if (!fs.existsSync(cleanPath)) {
        try {
          fs.mkdirSync(cleanPath, { recursive: true });
        } catch (e) {
          return openFolderResponse(res, false, 'Folder could not be created: ' + e.message, 200, { path: cleanPath.substring(0, 100) });
        }
      }

      const isWin = process.platform === 'win32';
      try {
        if (isWin) {
          const proc = spawn('explorer', [cleanPath], {
            windowsVerbatimArguments: true,
            detached: true,
            stdio: 'ignore'
          });
          proc.unref();
          proc.on('error', (err) => {
            if (!res.headersSent) openFolderResponse(res, false, err.message || 'Failed to open folder', 200, { execError: err.message, path: cleanPath.substring(0, 120) });
          });
          proc.on('spawn', () => {
            if (!res.headersSent) openFolderResponse(res, true, 'OK', 200, { path: cleanPath.substring(0, 120) });
          });
          proc.on('close', () => {
            if (!res.headersSent) openFolderResponse(res, true, 'OK', 200, { path: cleanPath.substring(0, 120) });
          });
        } else {
          const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
          const proc = spawn(cmd, [cleanPath]);
          proc.on('error', (err) => {
            if (!res.headersSent) openFolderResponse(res, false, err.message || 'Failed to open folder', 200, { execError: err.message, path: cleanPath.substring(0, 120) });
          });
          proc.on('close', (code) => {
            if (!res.headersSent) {
              if (code !== 0) openFolderResponse(res, false, 'Failed to open folder (exit ' + code + '). You can open it manually: ' + cleanPath, 200, { path: cleanPath.substring(0, 120) });
              else openFolderResponse(res, true, 'OK', 200, { path: cleanPath.substring(0, 120) });
            }
          });
        }
      } catch (execErr) {
        if (!res.headersSent) openFolderResponse(res, false, execErr.message || 'Failed to open folder', 200, { execError: execErr.message, path: cleanPath.substring(0, 120) });
      }
    } catch (err) {
      console.error('POST /open-documents-folder error:', err);
      if (!res.headersSent) {
        const safeMessage = /column count|values for.*columns|SQLITE_|syntax error/i.test(err.message)
          ? 'Could not save shipment. Please try again.'
          : (err.message || 'Internal server error');
        openFolderResponse(res, false, safeMessage, 200, { error: err.message });
      }
    }
  });

  router.post('/', (req, res) => {
    const s = req.body;
    if (!s || typeof s !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    const idCheck = validateId(s.id, 'Shipment ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const sNorm = { ...s, id: idCheck.value };
    const documentsFolderPath = ensureShipmentDocumentsFolder(sNorm);
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO shipments (
        id, supplierId, buyerId, productId, invoiceNumber, company, amount, currency, exchangeRate, rate, quantity,
        status, expectedShipmentDate, createdAt, fobValueFC, fobValueINR, invoiceValueINR,
        isUnderLC, lcNumber, lcAmount, lcDate, isUnderLicence, linkedLicenceId,
        licenceObligationAmount, containerNumber, blNumber, blDate, beNumber, beDate, shippingLine,
        portCode, portOfLoading, portOfDischarge, assessedValue, dutyBCD, dutySWS, dutyINT, gst, trackingUrl,
        incoTerm, paymentDueDate, expectedArrivalDate, invoiceDate, freightCharges, otherCharges,
        documents_json, history_json, payments_json, items_json, documentsFolderPath, remarks, consigneeId
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    try {
      const runTx = db.transaction(() => {
        stmt.run(...getShipmentValues(sNorm, documentsFolderPath));
        setShipmentItems(idCheck.value, sNorm.items);
        setShipmentHistory(idCheck.value, sNorm.history);
      });
      runTx();
    } catch (e) {
      console.error('POST /api/shipments transaction error:', e);
      return res.status(500).json({ success: false, error: e.message || 'Database error' });
    }
    linkShipmentToLC(sNorm, broadcast);
    res.json({ success: true });
    broadcast();
  });

  router.put('/:id', (req, res) => {
    const idCheck = validateId(req.params && req.params.id, 'Shipment ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const id = idCheck.value;
    const s = req.body;
    if (!s || typeof s !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });

    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO shipments (
        id, supplierId, buyerId, productId, invoiceNumber, company, amount, currency, exchangeRate, rate, quantity,
        status, expectedShipmentDate, createdAt, fobValueFC, fobValueINR, invoiceValueINR,
        isUnderLC, lcNumber, lcAmount, lcDate, isUnderLicence, linkedLicenceId,
        licenceObligationAmount, containerNumber, blNumber, blDate, beNumber, beDate, shippingLine,
        portCode, portOfLoading, portOfDischarge, assessedValue, dutyBCD, dutySWS, dutyINT, gst, trackingUrl,
        incoTerm, paymentDueDate, expectedArrivalDate, invoiceDate, freightCharges, otherCharges,
        documents_json, history_json, payments_json, items_json, documentsFolderPath, remarks, consigneeId
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    const updateStmt = db.prepare(`
      UPDATE shipments SET
        status=?, containerNumber=?, blNumber=?, blDate=?, beNumber=?, beDate=?,
        shippingLine=?, portCode=?, portOfLoading=?, portOfDischarge=?,
        assessedValue=?, dutyBCD=?, dutySWS=?, dutyINT=?, gst=?, trackingUrl=?,
        documents_json=?, history_json=?, payments_json=?, items_json=?,
        licenceObligationAmount=?, incoTerm=?, paymentDueDate=?, expectedArrivalDate=?,
        invoiceDate=?, freightCharges=?, otherCharges=?, exchangeRate=?, remarks=?,
        isUnderLC=?, lcNumber=?, lcAmount=?, lcDate=?, fileStatus=?, consigneeId=?
      WHERE id=?
    `);

    try {
      const runTx = db.transaction(() => {
        const exists = db.prepare('SELECT 1 FROM shipments WHERE id = ?').get(id);
        if (!exists) {
          const sNorm = { ...s, id };
          const documentsFolderPath = ensureShipmentDocumentsFolder(sNorm);
          insertStmt.run(...getShipmentValues(sNorm, documentsFolderPath));
          setShipmentItems(id, sNorm.items);
          setShipmentHistory(id, sNorm.history);
        } else {
          const existing = db.prepare('SELECT exchangeRate, remarks, isUnderLC, lcNumber, fileStatus, consigneeId FROM shipments WHERE id = ?').get(id);
          const allowedFileStatus = ['pending', 'clearing', 'ok'].includes(s.fileStatus) ? s.fileStatus : (existing?.fileStatus ?? null);
          const consigneeIdVal = s.consigneeId !== undefined ? s.consigneeId : (existing?.consigneeId ?? null);
          updateStmt.run(
            s.status, s.containerNumber, s.blNumber, s.blDate, s.beNumber, s.beDate,
            s.shippingLine, s.portCode, s.portOfLoading, s.portOfDischarge,
            s.assessedValue, s.dutyBCD, s.dutySWS, s.dutyINT, s.gst, s.trackingUrl,
            JSON.stringify(s.documents || {}), JSON.stringify(s.history || []), JSON.stringify(s.payments || []), JSON.stringify(s.items || []),
            s.licenceObligationAmount, s.incoTerm, s.paymentDueDate, s.expectedArrivalDate || null,
            s.invoiceDate || null, s.freightCharges ?? null, s.otherCharges ?? null,
            s.exchangeRate !== undefined && s.exchangeRate !== null ? s.exchangeRate : (existing?.exchangeRate ?? null),
            s.remarks !== undefined ? s.remarks : (existing?.remarks ?? null),
            s.isUnderLC ? 1 : 0, s.lcNumber || null, s.lcAmount ?? null, s.lcDate || null,
            allowedFileStatus,
            consigneeIdVal,
            id
          );
          setShipmentItems(id, s.items);
          setShipmentHistory(id, s.history);
        }
      });
      runTx();
    } catch (e) {
      console.error('PUT /api/shipments/:id transaction error:', e);
      return res.status(500).json({ success: false, error: e.message || 'Database error' });
    }
    linkShipmentToLC({ ...s, id }, broadcast);
    res.json({ success: true });
    broadcast();
  });

  router.delete('/:id', (req, res) => {
    const idCheck = validateId(req.params && req.params.id, 'Shipment ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const id = idCheck.value;
    try {
      const runTx = db.transaction(() => {
        db.prepare('DELETE FROM shipment_items WHERE shipmentId = ?').run(id);
        db.prepare('DELETE FROM shipment_history WHERE shipmentId = ?').run(id);
        db.prepare('DELETE FROM shipments WHERE id = ?').run(id);
      });
      runTx();
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
