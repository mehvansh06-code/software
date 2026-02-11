require('dotenv').config();
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

require('./server/db');
const db = require('./server/db');
const { IMPORT_DOCS_BASE, EXPORT_DOCS_BASE, COMPANY_FOLDER } = require('./server/config');
const { verifyToken, JWT_SECRET } = require('./server/middleware');

const supplierRoutes = require('./server/routes/suppliers');
const materialRoutes = require('./server/routes/materials');
const shipmentRoutes = require('./server/routes/shipments');
const buyerRoutes = require('./server/routes/buyers');
const licenceRoutes = require('./server/routes/licences');
const lcRoutes = require('./server/routes/lcs');
const domesticBuyerRoutes = require('./server/routes/domesticBuyers');
const indentProductRoutes = require('./server/routes/indentProducts');
const indentRoutes = require('./server/routes/indent');

const port = 3001;
const app = express();
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

// Hardcoded admin user for Phase 1 (replace with DB lookup in production)
const ADMIN_USERS = [
  { id: '1', username: 'director', name: 'J P Tosniwal', role: 'MANAGEMENT' },
  { id: '2', username: 'checker', name: 'Sarah Accountant', role: 'CHECKER' },
  { id: '3', username: 'employee', name: 'Rahul Sharma', role: 'EXECUTIONER' },
];
const ADMIN_PASSWORD_HASH = bcrypt.hashSync('admin123', 10);

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Username and password required' });
  }
  const user = ADMIN_USERS.find((u) => u.username === username);
  if (!user || !bcrypt.compareSync(password, ADMIN_PASSWORD_HASH)) {
    return res.status(401).json({ success: false, error: 'Invalid username or password' });
  }
  const token = jwt.sign(
    { userId: user.id, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.json({ success: true, token, user: { id: user.id, username: user.username, name: user.name, role: user.role } });
});

app.get('/api/status', (req, res) => {
  res.json({ ok: true, message: 'Server is running' });
});

app.use(verifyToken);

app.use('/api/suppliers', supplierRoutes(broadcast));
app.use('/api/materials', materialRoutes(broadcast));
app.use('/api/shipments', shipmentRoutes(broadcast));
app.use('/api/buyers', buyerRoutes(broadcast));
app.use('/api/licences', licenceRoutes(broadcast));
app.use('/api/lcs', lcRoutes(broadcast));
app.use('/api/domestic-buyers', domesticBuyerRoutes(broadcast));
app.use('/api/indent-products', indentProductRoutes(broadcast));
app.use('/api/indent', indentRoutes());

app.get('/api/lc-transactions', (req, res) => {
  try {
    res.json(db.prepare('SELECT * FROM lc_transactions ORDER BY createdAt DESC').all());
  } catch (e) {
    res.json([]);
  }
});

app.get('/api/stats', (req, res) => {
  res.json({
    suppliers: db.prepare('SELECT COUNT(*) as c FROM suppliers').get().c,
    buyers: db.prepare('SELECT COUNT(*) as c FROM buyers').get().c,
    shipments: db.prepare('SELECT COUNT(*) as c FROM shipments').get().c,
    licences: db.prepare('SELECT COUNT(*) as c FROM licences').get().c,
    lcs: db.prepare('SELECT COUNT(*) as c FROM lcs').get().c,
    lastSync: new Date().toISOString()
  });
});

app.use((req, res) => {
  const pathStr = req.method + ' ' + (req.originalUrl || req.url);
  res.status(404).json({ success: false, message: 'Not found', path: pathStr });
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
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

const shutdown = () => {
  console.log('\nShutting down...');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
