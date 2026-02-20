require('dotenv').config();
const { validateEnv } = require('./server/envValidation');
validateEnv();

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, error: 'Too many login attempts. Please wait 15 minutes before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

require('./server/db');
const db = require('./server/db');
const { IMPORT_DOCS_BASE, EXPORT_DOCS_BASE, COMPANY_FOLDER, DOCUMENTS_BASE, AUDIT_ARCHIVE_DAYS } = require('./server/config');
const { exportAndArchive } = require('./server/services/auditService');
const { verifyToken, JWT_SECRET } = require('./server/middleware');
const { PRESETS, PERMISSION_GROUPS } = require('./server/constants/permissions');

// Auth middleware for /api: protect all /api except login and status
const authMiddleware = (req, res, next) => {
  const path = (req.originalUrl || req.url || '').split('?')[0];
  if (req.method === 'POST' && path === '/api/auth/login') return next();
  if (req.method === 'POST' && path === '/api/login') return next();
  if (req.method === 'GET' && path === '/api/status') return next();
  return verifyToken(req, res, next);
};

const supplierRoutes = require('./server/routes/suppliers');
const materialRoutes = require('./server/routes/materials');
const shipmentRoutes = require('./server/routes/shipments');
const buyerRoutes = require('./server/routes/buyers');
const licenceRoutes = require('./server/routes/licences');
const lcRoutes = require('./server/routes/lcs');
const domesticBuyerRoutes = require('./server/routes/domesticBuyers');
const indentProductRoutes = require('./server/routes/indentProducts');
const indentRoutes = require('./server/routes/indent');
const bankPaymentDocsRoutes = require('./server/routes/bankPaymentDocs');
const userRoutes = require('./server/routes/users');
const ocrRoutes = require('./server/routes/ocr');
const auditRoutes = require('./server/routes/audit');

const port = process.env.PORT || 3001;
const app = express();
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false
}));
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const broadcast = () => {
  const msg = JSON.stringify({ type: 'data-changed' });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(msg);
  });
};

function sanitizeFolderName(str) {
  if (!str || typeof str !== 'string') return 'Unknown';
  return str.replace(/[/\\:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim() || 'Unknown';
}

const LOGS_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

[IMPORT_DOCS_BASE, EXPORT_DOCS_BASE].forEach((base) => {
  try {
    if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });
    Object.values(COMPANY_FOLDER).forEach((name) => {
      const sub = path.join(base, sanitizeFolderName(name));
      if (!fs.existsSync(sub)) fs.mkdirSync(sub, { recursive: true });
    });
  } catch (e) {
    console.warn('Could not create document subfolders at', base, e.message);
  }
});
if (DOCUMENTS_BASE) {
  try {
    if (!fs.existsSync(DOCUMENTS_BASE)) fs.mkdirSync(DOCUMENTS_BASE, { recursive: true });
    Object.values(COMPANY_FOLDER).forEach((name) => {
      const sub = path.join(DOCUMENTS_BASE, sanitizeFolderName(name));
      if (!fs.existsSync(sub)) fs.mkdirSync(sub, { recursive: true });
    });
  } catch (e) {
    console.warn('Could not create documents base at', DOCUMENTS_BASE, e.message);
  }
}

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

const corsOrigin = process.env.CORS_ORIGIN || true;
app.use(cors({ origin: corsOrigin, credentials: false }));
app.use(express.json({ limit: '512kb' }));

// Login: .env ADMIN_USERNAME/ADMIN_PASSWORD or DB users only
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_PASSWORD_HASH = ADMIN_PASSWORD ? bcrypt.hashSync(ADMIN_PASSWORD, 10) : null;
const DEFAULT_ALLOWED_DOMAINS = ['IMPORT', 'EXPORT', 'LICENCE', 'SALES_INDENT'];

function handleLogin(req, res) {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Username and password required' });
  }
  // 1) Env admin takes precedence when set
  if (ADMIN_USERNAME && ADMIN_PASSWORD_HASH) {
    if (username !== ADMIN_USERNAME || !bcrypt.compareSync(password, ADMIN_PASSWORD_HASH)) {
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    }
    const user = { id: 'admin', username: ADMIN_USERNAME, name: 'Admin', role: 'MANAGEMENT', permissions: PRESETS.MANAGEMENT || [], allowedDomains: ['IMPORT', 'EXPORT', 'LICENCE', 'SALES_INDENT'] };
    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ success: true, token, user: { id: user.id, username: user.username, name: user.name, role: user.role, permissions: user.permissions, allowedDomains: user.allowedDomains } });
  }
  // 2) DB users (from permission migration)
  try {
    const row = db.prepare('SELECT id, username, name, role, permissions, passwordHash, allowedDomains FROM users WHERE username = ?').get(username);
    if (row && row.passwordHash && bcrypt.compareSync(password, row.passwordHash)) {
      let permissions = [];
      let allowedDomains = [];
      try {
        permissions = JSON.parse(row.permissions || '[]');
      } catch (_) {}
      try {
        allowedDomains = JSON.parse(row.allowedDomains || '[]');
      } catch (_) {}
      if (!Array.isArray(allowedDomains) || allowedDomains.length === 0) {
        allowedDomains = DEFAULT_ALLOWED_DOMAINS;
      }
      const user = { id: row.id, username: row.username, name: row.name, role: row.role, permissions, allowedDomains };
      const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
      return res.json({ success: true, token, user: { id: user.id, username: user.username, name: user.name, role: user.role, permissions, allowedDomains } });
    }
  } catch (_) {}
  return res.status(401).json({ success: false, error: 'Invalid username or password' });
}

app.post('/api/auth/login', loginLimiter, handleLogin);
app.post('/api/login', loginLimiter, handleLogin);

app.get('/api/status', (req, res) => {
  res.json({ ok: true, message: 'Server is running' });
});

app.use('/api', authMiddleware);

// Permission matrix UI: groups and role presets (no auth required for read-only constants)
app.get('/api/permission-groups', (req, res) => {
  res.json({
    groups: PERMISSION_GROUPS,
    presets: {
      VIEWER: PRESETS.VIEWER || [],
      CHECKER: PRESETS.CHECKER || [],
      MANAGEMENT: PRESETS.MANAGEMENT || [],
      EXECUTIONER: PRESETS.EXECUTIONER || PRESETS.VIEWER || [],
    },
  });
});

// Session sync: return current user with fresh permissions from DB
app.get('/api/auth/me', (req, res) => {
  const id = req.user && req.user.id;
  if (!id) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }
  try {
    const row = db.prepare('SELECT id, username, name, role, permissions, allowedDomains FROM users WHERE id = ?').get(id);
    if (row) {
      let permissions = [];
      let allowedDomains = [];
      try {
        permissions = JSON.parse(row.permissions || '[]');
      } catch (_) {}
      try {
        allowedDomains = JSON.parse(row.allowedDomains || '[]');
      } catch (_) {}
      if (!Array.isArray(allowedDomains) || allowedDomains.length === 0) {
        allowedDomains = DEFAULT_ALLOWED_DOMAINS;
      }
      return res.json({
        id: row.id,
        username: row.username,
        name: row.name,
        role: row.role,
        permissions,
        allowedDomains,
      });
    }
  } catch (_) {}
  // Not in DB (env admin or legacy): return from token + preset permissions
  const name = req.user.id === 'admin' && ADMIN_USERNAME ? ADMIN_USERNAME : req.user.id;
  const allowedDomains = req.user.allowedDomains || ['IMPORT', 'EXPORT', 'LICENCE', 'SALES_INDENT'];
  res.json({
    id: req.user.id,
    username: req.user.id === 'admin' && ADMIN_USERNAME ? ADMIN_USERNAME : req.user.id,
    name: req.user.id === 'admin' ? 'Admin' : name,
    role: req.user.role || 'VIEWER',
    permissions: req.user.permissions || [],
    allowedDomains,
  });
});

app.use('/api/suppliers', supplierRoutes(broadcast));
app.use('/api/materials', materialRoutes(broadcast));
app.use('/api/shipments', shipmentRoutes(broadcast));
app.use('/api/buyers', buyerRoutes(broadcast));
app.use('/api/licences', licenceRoutes(broadcast));
app.use('/api/lcs', lcRoutes(broadcast));
app.use('/api/domestic-buyers', domesticBuyerRoutes(broadcast));
app.use('/api/indent-products', indentProductRoutes(broadcast));
app.use('/api/indent', indentRoutes());
app.use('/api/bank-payment-docs', bankPaymentDocsRoutes());
app.use('/api/users', userRoutes());
app.use('/api/ocr', ocrRoutes);
app.use('/api/audit-logs', auditRoutes());

// Audit log export: every 10 days, export logs older than AUDIT_ARCHIVE_DAYS to CSV and remove from DB
const AUDIT_EXPORT_INTERVAL_MS = 10 * 24 * 60 * 60 * 1000;
setInterval(() => {
  exportAndArchive(db, {})
    .then((result) => {
      if (result.count > 0) {
        console.log(`Audit export: ${result.count} log(s) archived to ${result.filePath}`);
      }
    })
    .catch((e) => {
      console.error('Audit export-and-archive failed:', e.message);
    });
}, AUDIT_EXPORT_INTERVAL_MS);

app.get('/api/lc-transactions', (req, res, next) => {
  try {
    const rows = db.prepare('SELECT * FROM lc_transactions ORDER BY createdAt DESC').all();
    res.json(Array.isArray(rows) ? rows : []);
  } catch (e) {
    next(e);
  }
});

app.get('/api/stats', (req, res, next) => {
  try {
    const suppliers = db.prepare('SELECT COUNT(*) as c FROM suppliers').get();
    const buyers = db.prepare('SELECT COUNT(*) as c FROM buyers').get();
    const shipments = db.prepare('SELECT COUNT(*) as c FROM shipments').get();
    const licences = db.prepare('SELECT COUNT(*) as c FROM licences').get();
    const lcs = db.prepare('SELECT COUNT(*) as c FROM lcs').get();
    res.json({
      suppliers: (suppliers && typeof suppliers.c === 'number') ? suppliers.c : 0,
      buyers: (buyers && typeof buyers.c === 'number') ? buyers.c : 0,
      shipments: (shipments && typeof shipments.c === 'number') ? shipments.c : 0,
      licences: (licences && typeof licences.c === 'number') ? licences.c : 0,
      lcs: (lcs && typeof lcs.c === 'number') ? lcs.c : 0,
      lastSync: new Date().toISOString(),
    });
  } catch (e) {
    next(e);
  }
});

// 404 handler (must be after all routes)
app.use((req, res) => {
  const pathStr = req.method + ' ' + (req.originalUrl || req.url);
  res.status(404).json({ success: false, message: 'Not found', path: pathStr });
});

// Global error handler: catch sync throws and async rejections from route handlers
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.statusCode && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
  const message = err.message && typeof err.message === 'string' ? err.message : 'Internal server error';
  console.error('Unhandled error:', err);
  res.status(status).json({ success: false, message, error: process.env.NODE_ENV === 'development' ? (err.stack || undefined) : undefined });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nPort ${port} is already in use. Stop the other process first.`);
    console.error('In PowerShell run: Get-NetTCPConnection -LocalPort ' + port + ' -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }');
    console.error('Then run: node server.js\n');
    process.exit(1);
  }
  throw err;
});

server.listen(port, '0.0.0.0', () => {
  const os = require('os');
  const nets = os.networkInterfaces();
  let localIp = 'localhost';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        localIp = net.address;
        break;
      }
    }
  }
  console.log(`Gujarat Flotex SQL Backend running at http://localhost:${port}`);
  console.log(`Share with others on your network: http://${localIp}:${port} (API) and http://${localIp}:3000 (app)`);
});

function runDailyBackup() {
  const backupDir = path.join(__dirname, 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const backupPath = path.join(backupDir, `ledger-${date}.db`);
  try {
    db.backup(backupPath);
    console.log(`[Backup] Saved to ${backupPath}`);
  } catch (e) {
    console.error('[Backup] Failed:', e.message);
  }
}

// Run once on startup, then every 24 hours
runDailyBackup();
setInterval(runDailyBackup, 24 * 60 * 60 * 1000);

const shutdown = () => {
  console.log('\nShutting down...');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
