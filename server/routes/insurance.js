const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const fse = require('fs-extra');
const multer = require('multer');
const db = require('../db');
const { DOCUMENTS_BASE } = require('../config');
const { validateId, hasPermission } = require('../middleware');
const { log: auditLog, getUserName } = require('../services/auditService');

const INSURANCE_ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.xlsx', '.docx', '.csv', '.txt'];
const INSURANCE_UPLOAD_TMP_DIR = path.join(os.tmpdir(), 'exim-insurance-upload-tmp');
try { fs.mkdirSync(INSURANCE_UPLOAD_TMP_DIR, { recursive: true }); } catch (_) {}

const insuranceMulterDisk = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, INSURANCE_UPLOAD_TMP_DIR),
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

function toIsoDate(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function addOneYearIso(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

function normalizeCoverage(lines) {
  const source = Array.isArray(lines) ? lines : [];
  return source
    .map((l) => ({
      particulars: String(l?.particulars || '').trim(),
      sumAssured: Number(l?.sumAssured || 0) || 0,
    }))
    .filter((l) => l.particulars);
}

function getTotal(lines) {
  return (Array.isArray(lines) ? lines : []).reduce((sum, l) => sum + (Number(l?.sumAssured || 0) || 0), 0);
}

function parseCoverageJson(str) {
  if (!str) return [];
  try {
    const parsed = JSON.parse(str);
    return normalizeCoverage(parsed);
  } catch (_) {
    return [];
  }
}

function getPolicyFolder(policy) {
  const stableId = sanitizeFolderName(policy?.id || 'Unknown');
  const folder = path.join(DOCUMENTS_BASE, 'Insurance Policies', 'by-id', stableId);
  try { fs.mkdirSync(folder, { recursive: true }); } catch (_) {}
  return folder;
}

function getLegacyPolicyFolder(policy) {
  const company = sanitizeFolderName(policy?.company || 'Unknown');
  const label = sanitizeFolderName(policy?.policyNumber || policy?.id || 'Policy');
  return path.join(DOCUMENTS_BASE, 'Insurance Policies', company, label);
}

function resolveFilePath(policy, filename) {
  const primary = path.join(getPolicyFolder(policy), filename);
  if (fs.existsSync(primary)) return primary;
  const legacy = path.join(getLegacyPolicyFolder(policy), filename);
  if (fs.existsSync(legacy)) return legacy;
  return primary;
}

function rowToPolicy(r) {
  const coverage = parseCoverageJson(r.coverage_json);
  return {
    id: r.id,
    company: r.company || '',
    brokerName: r.brokerName || '',
    brokerContactNumber: r.brokerContactNumber || '',
    brokerEmail: r.brokerEmail || '',
    insuranceProvider: r.insuranceProvider || '',
    policyNumber: r.policyNumber || '',
    amount: Number(r.amount || 0),
    dateOfOpening: r.dateOfOpening || '',
    dateOfRenewal: r.dateOfRenewal || '',
    insuranceType: r.insuranceType || '',
    location: r.location || '',
    coverage,
    totalSumAssured: Number(r.totalSumAssured || getTotal(coverage) || 0),
    policyCopyFilename: r.policyCopyFilename || null,
    createdAt: r.createdAt || '',
    updatedAt: r.updatedAt || '',
    version: Number(r.version || 1),
  };
}

function createRouter(broadcast) {
  const router = express.Router();

  router.get('/', hasPermission('insurance.view'), (_req, res) => {
    try {
      const rows = db.prepare('SELECT * FROM insurance_policies ORDER BY dateOfRenewal ASC, createdAt DESC').all();
      res.json((Array.isArray(rows) ? rows : []).map(rowToPolicy));
    } catch (e) {
      res.status(500).json({ success: false, error: e.message || 'Failed to load insurance policies' });
    }
  });

  router.get('/alerts/expiring', hasPermission('insurance.view'), (_req, res) => {
    try {
      const policies = db.prepare('SELECT * FROM insurance_policies').all().map(rowToPolicy);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const oneMonth = new Date(today);
      oneMonth.setDate(oneMonth.getDate() + 30);
      const withDays = policies.map((p) => {
        const d = new Date(`${p.dateOfRenewal}T00:00:00`);
        const daysToRenewal = Number.isNaN(d.getTime()) ? null : Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return { ...p, daysToRenewal };
      });
      const expiringSoon = withDays.filter((p) => p.daysToRenewal != null && p.daysToRenewal >= 0 && p.daysToRenewal <= 30);
      const overdue = withDays.filter((p) => p.daysToRenewal != null && p.daysToRenewal < 0);
      res.json({ expiringSoon, overdue });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message || 'Failed to load alerts' });
    }
  });

  router.post('/', hasPermission('insurance.create'), (req, res) => {
    const p = req.body || {};
    const id = p.id && /^[a-zA-Z0-9_-]+$/.test(p.id) ? p.id : `ins_${Math.random().toString(36).slice(2, 11)}`;
    const idCheck = validateId(id, 'Insurance Policy ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const dateOfOpening = toIsoDate(p.dateOfOpening);
    if (!dateOfOpening) return res.status(400).json({ success: false, error: 'Date of Opening is required.' });
    const dateOfRenewal = addOneYearIso(dateOfOpening);
    const coverage = normalizeCoverage(p.coverage);
    const total = getTotal(coverage);
    const now = new Date().toISOString();
    try {
      db.prepare(`
        INSERT INTO insurance_policies
        (id, company, brokerName, brokerContactNumber, brokerEmail, insuranceProvider, policyNumber, amount, dateOfOpening, dateOfRenewal, insuranceType, location, coverage_json, totalSumAssured, policyCopyFilename, createdAt, updatedAt, version)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        idCheck.value,
        String(p.company || '').trim(),
        String(p.brokerName || '').trim(),
        String(p.brokerContactNumber || '').trim(),
        String(p.brokerEmail || '').trim(),
        String(p.insuranceProvider || '').trim(),
        String(p.policyNumber || '').trim(),
        total,
        dateOfOpening,
        dateOfRenewal,
        String(p.insuranceType || '').trim(),
        String(p.location || '').trim(),
        JSON.stringify(coverage),
        total,
        null,
        now,
        now,
        1
      );
      const userId = req.user && req.user.id;
      auditLog(db, userId, 'INSURANCE_POLICY_CREATED', idCheck.value, { policyNumber: p.policyNumber, company: p.company });
      broadcast();
      return res.status(201).json({ success: true, id: idCheck.value, dateOfRenewal, version: 1 });
    } catch (e) {
      if (/UNIQUE constraint failed|SQLITE_CONSTRAINT/.test(e.message || '')) {
        return res.status(409).json({ success: false, error: 'Insurance policy already exists.' });
      }
      return res.status(500).json({ success: false, error: e.message || 'Failed to create insurance policy' });
    }
  });

  router.put('/:id', hasPermission('insurance.edit'), (req, res) => {
    const idCheck = validateId(req.params?.id, 'Insurance Policy ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const p = req.body || {};
    const existing = db.prepare('SELECT id, version, policyCopyFilename FROM insurance_policies WHERE id = ?').get(idCheck.value);
    if (!existing) return res.status(404).json({ success: false, error: 'Insurance policy not found' });
    const version = Number(p.version);
    if (!Number.isInteger(version) || version < 1) return res.status(400).json({ success: false, error: 'Version is required for update' });
    const dateOfOpening = toIsoDate(p.dateOfOpening);
    if (!dateOfOpening) return res.status(400).json({ success: false, error: 'Date of Opening is required.' });
    const dateOfRenewal = addOneYearIso(dateOfOpening);
    const coverage = normalizeCoverage(p.coverage);
    const total = getTotal(coverage);
    const now = new Date().toISOString();
    const result = db.prepare(`
      UPDATE insurance_policies SET
        company=?, brokerName=?, brokerContactNumber=?, brokerEmail=?, insuranceProvider=?, policyNumber=?, amount=?,
        dateOfOpening=?, dateOfRenewal=?, insuranceType=?, location=?, coverage_json=?, totalSumAssured=?, updatedAt=?, version = version + 1
      WHERE id=? AND version=?
    `).run(
      String(p.company || '').trim(),
      String(p.brokerName || '').trim(),
      String(p.brokerContactNumber || '').trim(),
      String(p.brokerEmail || '').trim(),
      String(p.insuranceProvider || '').trim(),
      String(p.policyNumber || '').trim(),
      total,
      dateOfOpening,
      dateOfRenewal,
      String(p.insuranceType || '').trim(),
      String(p.location || '').trim(),
      JSON.stringify(coverage),
      total,
      now,
      idCheck.value,
      version
    );
    if (result.changes === 0) return res.status(409).json({ success: false, error: 'Insurance policy was modified by another user. Please reload and try again.' });
    const versionRow = db.prepare('SELECT version FROM insurance_policies WHERE id = ?').get(idCheck.value);
    const userId = req.user && req.user.id;
    auditLog(db, userId, 'INSURANCE_POLICY_UPDATED', idCheck.value, { policyNumber: p.policyNumber, company: p.company });
    broadcast();
    res.json({ success: true, version: Number(versionRow?.version || version + 1), dateOfRenewal });
  });

  router.delete('/:id', hasPermission('insurance.delete'), (req, res) => {
    const idCheck = validateId(req.params?.id, 'Insurance Policy ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const row = db.prepare('SELECT id, company, policyNumber FROM insurance_policies WHERE id = ?').get(idCheck.value);
    if (!row) return res.status(404).json({ success: false, error: 'Insurance policy not found' });
    const folder = getPolicyFolder(row);
    const legacyFolder = getLegacyPolicyFolder(row);
    try { if (fs.existsSync(folder)) fse.removeSync(folder); } catch (_) {}
    try { if (fs.existsSync(legacyFolder)) fse.removeSync(legacyFolder); } catch (_) {}
    db.prepare('DELETE FROM insurance_policies WHERE id = ?').run(idCheck.value);
    const userId = req.user && req.user.id;
    auditLog(db, userId, 'INSURANCE_POLICY_DELETED', idCheck.value, { policyNumber: row.policyNumber, company: row.company });
    broadcast();
    res.json({ success: true });
  });

  router.get('/:id/files/:filename', hasPermission('insurance.view'), (req, res) => {
    const idCheck = validateId(req.params?.id, 'Insurance Policy ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const filename = sanitizeFilename(req.params?.filename);
    if (!filename) return res.status(400).json({ success: false, error: 'Invalid filename' });
    const row = db.prepare('SELECT id, company, policyNumber FROM insurance_policies WHERE id = ?').get(idCheck.value);
    if (!row) return res.status(404).json({ success: false, error: 'Insurance policy not found' });
    const full = resolveFilePath(row, filename);
    if (!fs.existsSync(full)) return res.status(404).json({ success: false, error: 'File not found' });
    return res.download(full, filename);
  });

  router.post('/:id/files', hasPermission('insurance.edit'), insuranceMulterDisk.single('file'), async (req, res) => {
    const idCheck = validateId(req.params?.id, 'Insurance Policy ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    if (!req.file || !req.file.path) return res.status(400).json({ success: false, error: 'No file uploaded' });
    const row = db.prepare('SELECT id, company, policyNumber, policyCopyFilename FROM insurance_policies WHERE id = ?').get(idCheck.value);
    if (!row) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(404).json({ success: false, error: 'Insurance policy not found' });
    }

    const original = sanitizeFilename(req.file.originalname || path.basename(req.file.path) || 'upload');
    const ext = path.extname(original || '').toLowerCase();
    if (!INSURANCE_ALLOWED_EXTENSIONS.includes(ext)) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(400).json({ success: false, error: `Unsupported file type '${ext || ''}'. Allowed: ${INSURANCE_ALLOWED_EXTENSIONS.join(', ')}` });
    }
    const baseName = sanitizeForPrefix(path.basename(original || 'upload', ext)) || 'policy_copy';
    const unique = `POLICY_COPY_${baseName}_${Date.now()}${ext}`;
    const folder = getPolicyFolder(row);
    const dest = path.join(folder, unique);
    try {
      if (row.policyCopyFilename) {
        const oldPrimary = path.join(folder, row.policyCopyFilename);
        const oldLegacy = path.join(getLegacyPolicyFolder(row), row.policyCopyFilename);
        if (fs.existsSync(oldPrimary)) fs.unlinkSync(oldPrimary);
        if (fs.existsSync(oldLegacy)) fs.unlinkSync(oldLegacy);
      }
      await fse.move(req.file.path, dest, { overwrite: true });
      const now = new Date().toISOString();
      db.prepare('UPDATE insurance_policies SET policyCopyFilename = ?, updatedAt = ?, version = version + 1 WHERE id = ?').run(unique, now, idCheck.value);
      const userId = req.user && req.user.id;
      const userName = getUserName(db, userId);
      auditLog(db, userId, 'INSURANCE_POLICY_DOCUMENT_UPLOADED', idCheck.value, { filename: unique, policyNumber: row.policyNumber, userName });
      broadcast();
      return res.json({ success: true, filename: unique });
    } catch (e) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(500).json({ success: false, error: 'Failed to upload file' });
    }
  });

  router.delete('/:id/files/:filename', hasPermission('insurance.edit'), (req, res) => {
    const idCheck = validateId(req.params?.id, 'Insurance Policy ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const filename = sanitizeFilename(req.params?.filename);
    if (!filename) return res.status(400).json({ success: false, error: 'Invalid filename' });
    const row = db.prepare('SELECT id, company, policyNumber, policyCopyFilename FROM insurance_policies WHERE id = ?').get(idCheck.value);
    if (!row) return res.status(404).json({ success: false, error: 'Insurance policy not found' });
    const full = resolveFilePath(row, filename);
    if (!fs.existsSync(full)) return res.status(404).json({ success: false, error: 'File not found' });
    try {
      fs.unlinkSync(full);
      if (row.policyCopyFilename === filename) {
        db.prepare('UPDATE insurance_policies SET policyCopyFilename = NULL, updatedAt = ?, version = version + 1 WHERE id = ?').run(new Date().toISOString(), idCheck.value);
      }
      const userId = req.user && req.user.id;
      const userName = getUserName(db, userId);
      auditLog(db, userId, 'INSURANCE_POLICY_DOCUMENT_DELETED', idCheck.value, { filename, policyNumber: row.policyNumber, userName });
      broadcast();
      return res.json({ success: true });
    } catch (e) {
      return res.status(500).json({ success: false, error: 'Failed to delete file' });
    }
  });

  return router;
}

module.exports = createRouter;
