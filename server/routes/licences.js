const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const fse = require('fs-extra');
const multer = require('multer');
const archiver = require('archiver');
const db = require('../db');
const { DOCUMENTS_BASE, COMPANY_FOLDER } = require('../config');
const { validateId, hasPermission } = require('../middleware');
const { log: auditLog, getUserName } = require('../services/auditService');

const LICENCE_ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.xlsx', '.docx', '.csv', '.txt'];
const LICENCE_UPLOAD_TMP_DIR = path.join(os.tmpdir(), 'exim-licence-upload-tmp');
try { fs.mkdirSync(LICENCE_UPLOAD_TMP_DIR, { recursive: true }); } catch (_) {}

const licenceMulterDisk = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, LICENCE_UPLOAD_TMP_DIR),
    filename: (_req, file, cb) => cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${file.originalname || 'upload'}`),
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});

function sanitizeFolderName(str) {
  if (!str || typeof str !== 'string') return 'Unknown';
  return str.replace(/[/\\:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim() || 'Unknown';
}

function sanitizeFilename(name) {
  if (!name || typeof name !== 'string') return null;
  const base = path.basename(name);
  if (!base || base.includes('..') || /[\\/]/.test(base)) return null;
  return base;
}

function sanitizeForPrefix(name) {
  return String(name || '').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_').trim();
}

function getLicenceDocPrefix(documentType) {
  if (documentType === 'LICENCE_COPY') return 'LICENCE_COPY_';
  if (documentType === 'BOND') return 'BOND_';
  if (documentType === 'MIC') return 'MIC_';
  return '';
}

function getLicenceDocumentsFolder(licence) {
  if (!licence) return null;
  const companyCode = String(licence.company || '').toUpperCase();
  const companyFolder = COMPANY_FOLDER[companyCode] || companyCode || 'Unknown';
  const base = path.join(DOCUMENTS_BASE, 'Licence Documents', sanitizeFolderName(companyFolder));
  const number = sanitizeFolderName(licence.number || licence.id || 'Unknown_Licence');
  const folder = path.join(base, number);
  try { fs.mkdirSync(folder, { recursive: true }); } catch (_) {}
  return folder;
}

function isEditorOrAdmin(user) {
  const role = String(user && user.role ? user.role : '').toUpperCase();
  return role === 'MANAGEMENT' || role === 'CHECKER';
}

function listFilesOnly(folder) {
  if (!folder || !fs.existsSync(folder)) return [];
  return fs.readdirSync(folder).filter((name) => {
    const full = path.join(folder, name);
    try {
      return fs.statSync(full).isFile();
    } catch (_) {
      return false;
    }
  });
}

function normalizeDocName(name) {
  return String(name || '')
    .replace(/\.[^/.]+$/, '')
    .replace(/\s+/g, '_')
    .toUpperCase();
}

function isBoeDoc(name) {
  const n = normalizeDocName(name);
  return /^BOE(_|$)/.test(n) || /^BEO(_|$)/.test(n) || n.includes('BILL_OF_ENTRY');
}

function isSbDoc(name) {
  const n = normalizeDocName(name);
  return /^SB(_|$)/.test(n) || n.includes('SHIPPING_BILL');
}

function isEbrcDoc(name) {
  const n = normalizeDocName(name);
  return /^EBRC(_|$)/.test(n) || /^E[-_]?BRC(_|$)/.test(n) || n.includes('E_BRC') || n.includes('EBRC');
}

function timestampStamp() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function safeCsv(v) {
  const s = String(v == null ? '' : v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function copyFileInto(sourceFile, targetDir) {
  await fse.ensureDir(targetDir);
  const sourceName = path.basename(sourceFile);
  const ext = path.extname(sourceName);
  const base = path.basename(sourceName, ext);
  let out = path.join(targetDir, sourceName);
  let n = 2;
  while (fs.existsSync(out)) {
    out = path.join(targetDir, `${base}_${n}${ext}`);
    n++;
  }
  await fse.copy(sourceFile, out, { overwrite: false, errorOnExist: false });
  return path.basename(out);
}

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

  function fromCents(x) {
    if (x == null || x === undefined || x === '') return 0;
    const n = Number(x);
    if (Number.isNaN(n)) return 0;
    return n / 100;
  }

  function getImportUtilizedForLicence(licenceId) {
    const rows = db.prepare('SELECT supplierId, linkedLicenceId, epcgLicenceId, advLicenceId, licence_allocations_json, licenceImportLines_json, licenceObligationAmount, invoiceValueINR FROM shipments WHERE supplierId IS NOT NULL').all();
    let totalInr = 0;
    for (const r of rows) {
      const isLinked = String(r.linkedLicenceId || '') === String(licenceId) || String(r.epcgLicenceId || '') === String(licenceId) || String(r.advLicenceId || '') === String(licenceId);
      const allocs = safeParseJson(r.licence_allocations_json, []);
      if (Array.isArray(allocs) && allocs.length > 0) {
        totalInr += allocs.filter((a) => String(a?.licenceId || '') === String(licenceId)).reduce((s, a) => s + (Number(a?.allocatedAmountINR) || 0), 0);
        continue;
      }
      if (!isLinked) continue;
      const lines = safeParseJson(r.licenceImportLines_json, []);
      if (Array.isArray(lines) && lines.length > 0) {
        totalInr += lines.reduce((s, l) => s + (Number(l?.valueINR) || 0), 0);
      } else {
        const obligation = r.licenceObligationAmount != null ? fromCents(r.licenceObligationAmount) : 0;
        const invoiceInr = r.invoiceValueINR != null ? fromCents(r.invoiceValueINR) : 0;
        totalInr += obligation || invoiceInr;
      }
    }
    return totalInr;
  }

  router.get('/', hasPermission('licences.view'), (req, res, next) => {
    try {
      const rows = db.prepare('SELECT * FROM licences').all();
      res.json((Array.isArray(rows) ? rows : []).map(parseLicenceRow));
    } catch (e) {
      next(e);
    }
  });

  router.get('/:id/documents-folder-files', hasPermission('documents.view'), (req, res) => {
    const idCheck = validateId(req.params && req.params.id, 'Licence ID');
    if (!idCheck.valid) return res.status(400).json({ files: [] });
    try {
      const lic = db.prepare('SELECT id, number, company FROM licences WHERE id = ?').get(idCheck.value);
      if (!lic) return res.status(404).json({ files: [] });
      const folder = getLicenceDocumentsFolder(lic);
      if (!folder || !fs.existsSync(folder)) return res.status(200).json({ files: [] });
      const files = fs.readdirSync(folder)
        .filter((f) => {
          const full = path.join(folder, f);
          try { return fs.statSync(full).isFile(); } catch (_) { return false; }
        })
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
      return res.status(200).json({ files });
    } catch (e) {
      return res.status(200).json({ files: [] });
    }
  });

  router.get('/:id/files/:filename', hasPermission('documents.view'), (req, res) => {
    const idCheck = validateId(req.params && req.params.id, 'Licence ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.message });
    const filename = sanitizeFilename(req.params && req.params.filename);
    if (!filename) return res.status(400).json({ error: 'Invalid filename' });
    try {
      const lic = db.prepare('SELECT id, number, company FROM licences WHERE id = ?').get(idCheck.value);
      if (!lic) return res.status(404).json({ error: 'Licence not found' });
      const folder = getLicenceDocumentsFolder(lic);
      const full = path.join(folder, filename);
      if (!fs.existsSync(full)) return res.status(404).json({ error: 'File not found' });
      return res.download(full, filename);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to download file' });
    }
  });

  router.post('/:id/files', hasPermission('documents.upload'), licenceMulterDisk.single('file'), async (req, res) => {
    const idCheck = validateId(req.params && req.params.id, 'Licence ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const documentTypeRaw = String(req.query && req.query.documentType ? req.query.documentType : '').toUpperCase();
    const documentType = documentTypeRaw === 'LICENCE_COPY' || documentTypeRaw === 'BOND' || documentTypeRaw === 'MIC' ? documentTypeRaw : '';
    if (!documentType) return res.status(400).json({ success: false, error: 'Invalid documentType' });
    try {
      if (!req.file || !req.file.path) return res.status(400).json({ success: false, error: 'No file uploaded' });
      const lic = db.prepare('SELECT id, number, company, type FROM licences WHERE id = ?').get(idCheck.value);
      if (!lic) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
        return res.status(404).json({ success: false, error: 'Licence not found' });
      }
      if (documentType === 'MIC' && String(lic.type || '').toUpperCase() !== 'EPCG') {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
        return res.status(400).json({ success: false, error: 'Machinery Installation Certificate is allowed only for EPCG licence.' });
      }

      const folder = getLicenceDocumentsFolder(lic);
      const original = sanitizeFilename(req.file.originalname || path.basename(req.file.path) || 'upload');
      const ext = path.extname(original || '').toLowerCase();
      if (!LICENCE_ALLOWED_EXTENSIONS.includes(ext)) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
        return res.status(400).json({ success: false, error: `Unsupported file type '${ext || ''}'. Allowed: ${LICENCE_ALLOWED_EXTENSIONS.join(', ')}` });
      }

      const prefix = getLicenceDocPrefix(documentType);
      if (prefix && documentType !== 'MIC') {
        try {
          const existing = fs.readdirSync(folder).filter((f) => String(f).toUpperCase().startsWith(prefix));
          existing.forEach((f) => { try { fs.unlinkSync(path.join(folder, f)); } catch (_) {} });
        } catch (_) {}
      }

      const baseName = sanitizeForPrefix(path.basename(original || 'upload', ext)) || 'upload';
      const unique = documentType === 'MIC'
        ? `${prefix}${baseName}_${Date.now()}${ext}`
        : `${prefix}${baseName}${ext}`;
      const dest = path.join(folder, unique);
      await fse.move(req.file.path, dest, { overwrite: true });

      const userId = req.user && req.user.id;
      const userName = getUserName(db, userId);
      auditLog(db, userId, 'LICENCE_DOCUMENT_UPLOADED', idCheck.value, { filename: unique, licenceNumber: lic.number, documentType, userName });
      broadcast();
      return res.json({ success: true, filename: unique });
    } catch (e) {
      try { if (req.file && req.file.path) fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(500).json({ success: false, error: 'Failed to upload file' });
    }
  });

  router.delete('/:id/files/:filename', hasPermission('documents.delete'), (req, res) => {
    const idCheck = validateId(req.params && req.params.id, 'Licence ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const filename = sanitizeFilename(req.params && req.params.filename);
    if (!filename) return res.status(400).json({ success: false, error: 'Invalid filename' });
    try {
      const lic = db.prepare('SELECT id, number, company FROM licences WHERE id = ?').get(idCheck.value);
      if (!lic) return res.status(404).json({ success: false, error: 'Licence not found' });
      const folder = getLicenceDocumentsFolder(lic);
      const full = path.join(folder, filename);
      if (!fs.existsSync(full)) return res.status(404).json({ success: false, error: 'File not found' });
      fs.unlinkSync(full);
      const userId = req.user && req.user.id;
      const userName = getUserName(db, userId);
      auditLog(db, userId, 'LICENCE_DOCUMENT_DELETED', idCheck.value, { filename, licenceNumber: lic.number, userName });
      broadcast();
      return res.json({ success: true });
    } catch (e) {
      return res.status(500).json({ success: false, error: 'Failed to delete file' });
    }
  });

  router.post('/:id/generate-document-bundle', hasPermission('licences.edit'), async (req, res) => {
    const idCheck = validateId(req.params && req.params.id, 'Licence ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    if (!isEditorOrAdmin(req.user)) return res.status(403).json({ success: false, error: 'Insufficient permissions for this action.' });

    try {
      const licenceId = idCheck.value;
      const lic = db.prepare('SELECT id, number, company FROM licences WHERE id = ?').get(licenceId);
      if (!lic) return res.status(404).json({ success: false, error: 'Licence not found' });

      const licenceFolder = getLicenceDocumentsFolder(lic);
      const baseBundleName = sanitizeForPrefix(lic.number || lic.id || 'Licence') || 'Licence';
      const stamp = timestampStamp();
      const bundleDirName = `${baseBundleName}_${stamp}`;
      const bundlesRoot = path.join(licenceFolder, 'bundles');
      const serverBundlePath = path.join(bundlesRoot, bundleDirName);
      const contentRoot = path.join(serverBundlePath, 'content');
      const licenceDocsOut = path.join(contentRoot, 'Licence_Documents');
      const importRoot = path.join(contentRoot, 'Import_Shipments');
      const exportRoot = path.join(contentRoot, 'Export_Shipments');
      await fse.ensureDir(licenceDocsOut);
      await fse.ensureDir(importRoot);
      await fse.ensureDir(exportRoot);

      const linkedShipments = db.prepare(`
        SELECT id, invoiceNumber, supplierId, buyerId, linkedLicenceId, epcgLicenceId, advLicenceId, licence_allocations_json, documentsFolderPath
        FROM shipments
      `).all().filter((row) => {
        const direct = String(row.linkedLicenceId || '') === licenceId || String(row.epcgLicenceId || '') === licenceId || String(row.advLicenceId || '') === licenceId;
        const allocs = safeParseJson(row.licence_allocations_json, []);
        const hasAlloc = Array.isArray(allocs) && allocs.some((a) => String(a && a.licenceId ? a.licenceId : '') === licenceId);
        return direct || hasAlloc;
      });

      const missing = [];
      let filesIncluded = 0;
      let importCount = 0;
      let exportCount = 0;

      for (const name of listFilesOnly(licenceFolder)) {
        const src = path.join(licenceFolder, name);
        await copyFileInto(src, licenceDocsOut);
        filesIncluded++;
      }

      for (const row of linkedShipments) {
        const shipmentRef = sanitizeFolderName(String(row.invoiceNumber || row.id || 'Shipment'));
        const shipmentId = String(row.id || '');
        const isImport = !!row.supplierId;
        const isExport = !!row.buyerId;

        if (isImport) importCount++;
        if (isExport) exportCount++;
        if (!isImport && !isExport) continue;

        const folder = row.documentsFolderPath && typeof row.documentsFolderPath === 'string' ? row.documentsFolderPath : null;
        if (!folder || !fs.existsSync(folder)) {
          if (isImport) {
            missing.push({ category: 'IMPORT', shipmentId, shipmentRef, requiredDocument: 'BOE', reason: 'Documents folder not found' });
          }
          if (isExport) {
            missing.push({ category: 'EXPORT', shipmentId, shipmentRef, requiredDocument: 'SB', reason: 'Documents folder not found' });
            missing.push({ category: 'EXPORT', shipmentId, shipmentRef, requiredDocument: 'EBRC', reason: 'Documents folder not found' });
          }
          continue;
        }

        const files = listFilesOnly(folder);
        if (isImport) {
          const boeFiles = files.filter(isBoeDoc);
          if (boeFiles.length === 0) {
            missing.push({ category: 'IMPORT', shipmentId, shipmentRef, requiredDocument: 'BOE', reason: 'Bill of Entry file not found' });
          } else {
            const target = path.join(importRoot, shipmentRef, 'BOE');
            for (const f of boeFiles) {
              await copyFileInto(path.join(folder, f), target);
              filesIncluded++;
            }
          }
        }

        if (isExport) {
          const sbFiles = files.filter(isSbDoc);
          const ebrcFiles = files.filter(isEbrcDoc);
          if (sbFiles.length === 0) {
            missing.push({ category: 'EXPORT', shipmentId, shipmentRef, requiredDocument: 'SB', reason: 'Shipping Bill file not found' });
          } else {
            const target = path.join(exportRoot, shipmentRef, 'Shipping_Bill');
            for (const f of sbFiles) {
              await copyFileInto(path.join(folder, f), target);
              filesIncluded++;
            }
          }
          if (ebrcFiles.length === 0) {
            missing.push({ category: 'EXPORT', shipmentId, shipmentRef, requiredDocument: 'EBRC', reason: 'e-BRC file not found' });
          } else {
            const target = path.join(exportRoot, shipmentRef, 'EBRC');
            for (const f of ebrcFiles) {
              await copyFileInto(path.join(folder, f), target);
              filesIncluded++;
            }
          }
        }
      }

      if (linkedShipments.length === 0) {
        missing.push({ category: 'GENERAL', shipmentId: '', shipmentRef: '', requiredDocument: '-', reason: 'No linked shipments found for this licence' });
      }

      const reportPath = path.join(contentRoot, 'missing_documents_report.csv');
      const csvHeader = 'category,shipmentId,shipmentRef,requiredDocument,reason\n';
      const csvBody = missing.map((m) => [
        safeCsv(m.category),
        safeCsv(m.shipmentId),
        safeCsv(m.shipmentRef),
        safeCsv(m.requiredDocument),
        safeCsv(m.reason),
      ].join(',')).join('\n');
      await fse.writeFile(reportPath, csvHeader + csvBody + (csvBody ? '\n' : ''), 'utf8');

      const manifest = {
        licenceId: lic.id,
        licenceNumber: lic.number || lic.id,
        generatedAt: new Date().toISOString(),
        stats: {
          shipmentsScanned: linkedShipments.length,
          importShipments: importCount,
          exportShipments: exportCount,
          filesIncluded,
          missingCount: missing.length,
        },
      };
      await fse.writeFile(path.join(contentRoot, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

      const zipFilename = `${baseBundleName}.zip`;
      const zipPath = path.join(serverBundlePath, zipFilename);
      await new Promise((resolve, reject) => {
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        output.on('close', resolve);
        output.on('error', reject);
        archive.on('error', reject);
        archive.pipe(output);
        archive.directory(contentRoot, false);
        archive.finalize();
      });

      const userId = req.user && req.user.id;
      const userName = getUserName(db, userId);
      auditLog(db, userId, 'LICENCE_DOCUMENT_BUNDLE_GENERATED', licenceId, {
        licenceNumber: lic.number,
        bundleName: baseBundleName,
        bundleFolder: serverBundlePath,
        filesIncluded,
        missingCount: missing.length,
        shipmentsScanned: linkedShipments.length,
        userName,
      });
      broadcast();

      return res.json({
        success: true,
        bundleName: baseBundleName,
        zipDownloadUrl: `/api/licences/${encodeURIComponent(licenceId)}/document-bundles/${encodeURIComponent(zipFilename)}?bundle=${encodeURIComponent(bundleDirName)}`,
        serverBundlePath,
        stats: manifest.stats,
        missing,
      });
    } catch (e) {
      console.error('POST /licences/:id/generate-document-bundle', e);
      return res.status(500).json({ success: false, error: 'Failed to generate licence document bundle' });
    }
  });

  router.get('/:id/document-bundles/:filename', hasPermission('licences.edit'), (req, res) => {
    const idCheck = validateId(req.params && req.params.id, 'Licence ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    if (!isEditorOrAdmin(req.user)) return res.status(403).json({ success: false, error: 'Insufficient permissions for this action.' });
    const filename = sanitizeFilename(req.params && req.params.filename);
    const bundle = sanitizeFilename(req.query && req.query.bundle ? String(req.query.bundle) : '');
    if (!filename || !bundle) return res.status(400).json({ success: false, error: 'Invalid bundle reference' });
    try {
      const lic = db.prepare('SELECT id, number, company FROM licences WHERE id = ?').get(idCheck.value);
      if (!lic) return res.status(404).json({ success: false, error: 'Licence not found' });
      const licenceFolder = getLicenceDocumentsFolder(lic);
      const bundlesRoot = path.join(licenceFolder, 'bundles');
      const full = path.join(bundlesRoot, bundle, filename);
      const resolvedBase = path.resolve(bundlesRoot);
      const resolvedFull = path.resolve(full);
      if (resolvedFull !== resolvedBase && !resolvedFull.startsWith(resolvedBase + path.sep)) {
        return res.status(400).json({ success: false, error: 'Invalid bundle reference' });
      }
      if (!fs.existsSync(resolvedFull)) return res.status(404).json({ success: false, error: 'Bundle file not found' });
      return res.download(resolvedFull, filename);
    } catch (e) {
      return res.status(500).json({ success: false, error: 'Failed to download bundle' });
    }
  });

  router.post('/', hasPermission('licences.create'), (req, res) => {
    const l = req.body;
    if (!l || typeof l !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    const idCheck = validateId(l.id, 'Licence ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const importProductsJson = Array.isArray(l.importProducts) ? JSON.stringify(l.importProducts) : null;
    const exportProductsJson = Array.isArray(l.exportProducts) ? JSON.stringify(l.exportProducts) : null;
    const ins = db.prepare('INSERT INTO licences (id, number, type, issueDate, machineryInstallationDate, importValidityDate, expiryDate, dutySaved, eoRequired, eoFulfilled, company, status, amountImportUSD, amountImportINR, importProducts_json, exportProducts_json, version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    try {
      ins.run(idCheck.value, l.number || null, l.type, l.issueDate || null, l.machineryInstallationDate || null, l.importValidityDate || null, l.expiryDate || null, l.dutySaved ?? 0, l.eoRequired ?? 0, l.eoFulfilled ?? 0, l.company || null, l.status || 'ACTIVE', l.amountImportUSD ?? null, l.amountImportINR ?? null, importProductsJson, exportProductsJson, 1);
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
    const importUtilized = getImportUtilizedForLicence(idCheck.value);
    const incomingDutySaved = Number(l.dutySaved ?? existing.dutySaved ?? 0);
    if (incomingDutySaved > 0 && importUtilized > incomingDutySaved) {
      return res.status(400).json({
        success: false,
        error: `Cannot reduce import limit below utilized value. Utilized: ${Math.round(importUtilized)} INR, new limit: ${Math.round(incomingDutySaved)} INR.`,
      });
    }
    const result = db.prepare(`
      UPDATE licences SET
        number=?, type=?, issueDate=?, machineryInstallationDate=?, importValidityDate=?, expiryDate=?,
        dutySaved=?, eoRequired=?, eoFulfilled=?, company=?, status=?,
        amountImportUSD=?, amountImportINR=?, importProducts_json=?, exportProducts_json=?,
        version = version + 1
      WHERE id=? AND version=?
    `).run(
      l.number ?? null, l.type ?? null, l.issueDate ?? null, l.machineryInstallationDate ?? null, l.importValidityDate ?? null, l.expiryDate ?? null,
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
