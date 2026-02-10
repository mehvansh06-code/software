const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');

const DB_PATH = path.join(__dirname, 'ledger.db');
const port = 3001;

// Import and export use separate roots — do not mix.
// Import: e.g. <project>/Import Shipment Documents
const IMPORT_DOCS_BASE = process.env.SHIPMENT_DOCS_BASE || path.join(__dirname, 'Import Shipment Documents');
// Export: e.g. D:\software\Export Shipment Documents (set EXPORT_SHIPMENT_DOCS_BASE to override)
const EXPORT_DOCS_BASE = process.env.EXPORT_SHIPMENT_DOCS_BASE || path.join(__dirname, 'Export Shipment Documents');
// Under each base, one subfolder per company — do not mix companies.
const COMPANY_FOLDER = { GFPL: 'Gujarat Flotex Pvt Ltd', GTEX: 'GTEX Fabrics Pvt Ltd' };

function createDbWrapper(nativeDb) {
  const save = () => {
    try {
      const data = nativeDb.export();
      fs.writeFileSync(DB_PATH, Buffer.from(data));
    } catch (e) {
      console.warn('Could not persist ledger.db:', e.message);
    }
  };

  return {
    exec(sql) {
      nativeDb.exec(sql);
    },
    prepare(sql) {
      const stmt = nativeDb.prepare(sql);
      return {
        run: (...args) => {
          stmt.bind(args.length ? args : null);
          stmt.step();
          stmt.reset();
          stmt.free();
          save();
        },
        get: (...args) => {
          stmt.bind(args.length ? args : null);
          const hasRow = stmt.step();
          const row = hasRow ? stmt.getAsObject() : undefined;
          stmt.free();
          return row;
        },
        all: (...args) => {
          stmt.bind(args.length ? args : null);
          const rows = [];
          while (stmt.step()) rows.push(stmt.getAsObject());
          stmt.free();
          return rows;
        }
      };
    }
  };
}

async function start() {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  let nativeDb;
  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    nativeDb = new SQL.Database(new Uint8Array(buf));
  } else {
    nativeDb = new SQL.Database();
  }
  const db = createDbWrapper(nativeDb);

  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });
  const broadcast = () => {
    const msg = JSON.stringify({ type: 'data-changed' });
    wss.clients.forEach((client) => {
      if (client.readyState === 1) client.send(msg);
    });
  };

  // --- Security & robustness ---
  const MAX_ID_LENGTH = 128;
  const SAFE_ID_REGEX = /^[a-zA-Z0-9_\-\.]+$/;
  function validateId(id, label) {
    if (id == null || typeof id !== 'string') return { valid: false, message: (label || 'ID') + ' is required' };
    const trimmed = id.trim();
    if (trimmed === '' || trimmed === 'undefined' || trimmed === 'null') return { valid: false, message: 'Invalid ' + (label || 'ID') };
    if (trimmed.length > MAX_ID_LENGTH) return { valid: false, message: (label || 'ID') + ' too long' };
    if (trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) return { valid: false, message: (label || 'ID') + ' contains invalid characters' };
    if (!SAFE_ID_REGEX.test(trimmed)) return { valid: false, message: (label || 'ID') + ' contains invalid characters' };
    return { valid: true, value: trimmed };
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

  db.exec(`
  CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT,
    country TEXT,
    bankName TEXT,
    accountHolderName TEXT,
    swiftCode TEXT,
    bankAddress TEXT,
    contactPerson TEXT,
    contactDetails TEXT,
    status TEXT DEFAULT 'PENDING',
    requestedBy TEXT,
    createdAt TEXT,
    hasIntermediaryBank INTEGER,
    intermediaryBankName TEXT,
    intermediaryAccountHolderName TEXT,
    intermediarySwiftCode TEXT,
    intermediaryBankAddress TEXT
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    supplierId TEXT,
    name TEXT,
    description TEXT,
    hsnCode TEXT,
    unit TEXT,
    type TEXT,
    FOREIGN KEY(supplierId) REFERENCES suppliers(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS materials (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    hsnCode TEXT,
    unit TEXT DEFAULT 'KGS',
    type TEXT
  );

  CREATE TABLE IF NOT EXISTS buyers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT,
    country TEXT,
    bankName TEXT,
    accountHolderName TEXT,
    swiftCode TEXT,
    bankAddress TEXT,
    contactPerson TEXT,
    contactDetails TEXT,
    salesPersonName TEXT,
    salesPersonContact TEXT,
    hasConsignee INTEGER,
    status TEXT DEFAULT 'PENDING',
    requestedBy TEXT,
    createdAt TEXT
  );

  CREATE TABLE IF NOT EXISTS shipments (
    id TEXT PRIMARY KEY,
    supplierId TEXT,
    buyerId TEXT,
    productId TEXT,
    invoiceNumber TEXT UNIQUE,
    company TEXT,
    amount REAL,
    currency TEXT,
    exchangeRate REAL,
    rate REAL,
    quantity REAL,
    status TEXT,
    expectedShipmentDate TEXT,
    createdAt TEXT,
    fobValueFC REAL,
    fobValueINR REAL,
    invoiceValueINR REAL,
    isUnderLC INTEGER,
    lcNumber TEXT,
    lcAmount REAL,
    lcDate TEXT,
    isUnderLicence INTEGER,
    linkedLicenceId TEXT,
    licenceObligationAmount REAL,
    containerNumber TEXT,
    blNumber TEXT,
    blDate TEXT,
    beNumber TEXT,
    beDate TEXT,
    shippingLine TEXT,
    portCode TEXT,
    portOfLoading TEXT,
    portOfDischarge TEXT,
    assessedValue REAL,
    dutyBCD REAL,
    dutySWS REAL,
    dutyINT REAL,
    gst REAL,
    trackingUrl TEXT,
    incoTerm TEXT,
    paymentDueDate TEXT,
    expectedArrivalDate TEXT,
    documents_json TEXT,
    history_json TEXT,
    payments_json TEXT,
    items_json TEXT
  );

  CREATE TABLE IF NOT EXISTS licences (
    id TEXT PRIMARY KEY,
    number TEXT UNIQUE,
    type TEXT,
    issueDate TEXT,
    expiryDate TEXT,
    dutySaved REAL,
    eoRequired REAL,
    eoFulfilled REAL,
    company TEXT,
    status TEXT
  );

  CREATE TABLE IF NOT EXISTS lcs (
    id TEXT PRIMARY KEY,
    lcNumber TEXT UNIQUE,
    issuingBank TEXT,
    supplierId TEXT,
    amount REAL,
    currency TEXT,
    issueDate TEXT,
    expiryDate TEXT,
    maturityDate TEXT,
    company TEXT,
    status TEXT,
    remarks TEXT
  );
`);

  const runMigration = (sql, label) => {
    try {
      db.exec(sql);
    } catch (e) {
      if (!/duplicate column name|already exists/i.test(e.message)) console.warn('Migration', label, e.message);
    }
  };
  runMigration('ALTER TABLE shipments ADD COLUMN expectedArrivalDate TEXT', 'expectedArrivalDate');
  runMigration('ALTER TABLE shipments ADD COLUMN items_json TEXT', 'items_json');
  runMigration('ALTER TABLE suppliers ADD COLUMN hasIntermediaryBank INTEGER', 'hasIntermediaryBank');
  runMigration('ALTER TABLE suppliers ADD COLUMN intermediaryBankName TEXT', 'intermediaryBankName');
  runMigration('ALTER TABLE suppliers ADD COLUMN intermediaryAccountHolderName TEXT', 'intermediaryAccountHolderName');
  runMigration('ALTER TABLE suppliers ADD COLUMN intermediarySwiftCode TEXT', 'intermediarySwiftCode');
  runMigration('ALTER TABLE suppliers ADD COLUMN intermediaryBankAddress TEXT', 'intermediaryBankAddress');
  runMigration('ALTER TABLE shipments ADD COLUMN invoiceDate TEXT', 'invoiceDate');
  runMigration('ALTER TABLE shipments ADD COLUMN freightCharges REAL', 'freightCharges');
  runMigration('ALTER TABLE shipments ADD COLUMN otherCharges REAL', 'otherCharges');
  runMigration('ALTER TABLE shipments ADD COLUMN documentsFolderPath TEXT', 'documentsFolderPath');
  runMigration('ALTER TABLE shipments ADD COLUMN remarks TEXT', 'remarks');
  runMigration('ALTER TABLE shipments ADD COLUMN isLC INTEGER', 'shipments.isLC');
  runMigration('ALTER TABLE shipments ADD COLUMN lcReferenceNumber TEXT', 'shipments.lcReferenceNumber');
  runMigration('ALTER TABLE shipments ADD COLUMN lcOpeningDate TEXT', 'shipments.lcOpeningDate');
  runMigration('ALTER TABLE shipments ADD COLUMN fileStatus TEXT', 'shipments.fileStatus');
  runMigration('CREATE INDEX IF NOT EXISTS idx_shipments_lc_reference ON shipments(lcReferenceNumber) WHERE lcReferenceNumber IS NOT NULL', 'idx_shipments_lc_reference');
  runMigration('ALTER TABLE lcs ADD COLUMN buyerId TEXT', 'lcs.buyerId');
  runMigration('ALTER TABLE lcs ADD COLUMN shipments_json TEXT', 'lcs.shipments_json');
  runMigration('ALTER TABLE lcs ADD COLUMN balanceAmount REAL', 'lcs.balanceAmount');
  db.exec(`
  CREATE TABLE IF NOT EXISTS lc_transactions (
    id TEXT PRIMARY KEY,
    lcId TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL,
    date TEXT NOT NULL,
    type TEXT NOT NULL,
    shipmentId TEXT,
    createdAt TEXT NOT NULL
  )
  `);
  function sanitizeFolderName(str) {
    if (!str || typeof str !== 'string') return 'Unknown';
    return str.replace(/[/\\:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim() || 'Unknown';
  }
  /** Reject values that are JSON or invalid path (e.g. corrupted DB had items_json in documentsFolderPath). */
  function isValidDocumentsFolderPath(p) {
    if (!p || typeof p !== 'string') return false;
    if (p.length < 10 || p.length > 600) return false;
    if (/[\{\[\"]/.test(p) || p.indexOf('productId') !== -1) return false;
    return true;
  }
  /** Get folder path for a shipment row; recompute and fix DB if stored value is invalid or wrong type (Import vs Export). Never throws. */
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
  // Build path: <base> / <company subfolder> / <PartnerName_InvoiceNo>. Import and export bases are separate; companies are not mixed. Never throws.
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

  /** When shipment is saved with isUnderLC and lcNumber: find LC by lcNumber; if found add shipment to LC and deduct balance; if not create Draft LC and link. */
  function linkShipmentToLC(shipment) {
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
      const ins = db.prepare(`INSERT INTO lcs (id, lcNumber, issuingBank, supplierId, buyerId, amount, balanceAmount, currency, issueDate, expiryDate, maturityDate, company, status, remarks, shipments_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      ins.run(
        newId, lcRef, '—', isExport ? null : (shipment.supplierId || null), isExport ? (shipment.buyerId || null) : null,
        shipmentValue, 0, shipment.currency || 'USD', now, now, now, shipment.company || 'GFPL', 'DRAFT', 'Auto-created from shipment',
        JSON.stringify([shipmentId])
      );
    } catch (e) {
      if (/no such column/.test(e.message)) {
        db.prepare(`INSERT OR REPLACE INTO lcs (id, lcNumber, issuingBank, supplierId, buyerId, amount, currency, issueDate, expiryDate, maturityDate, company, status, remarks) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          newId, lcRef, '—', isExport ? null : (shipment.supplierId || null), isExport ? (shipment.buyerId || null) : null,
          shipmentValue, shipment.currency || 'USD', now, now, now, shipment.company || 'GFPL', 'DRAFT', 'Auto-created from shipment'
        );
      } else throw e;
    }
    broadcast();
  }

  /** When LC status is set to HONORED/PAID: create transaction record(s), mark linked shipments as payment complete. */
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

  // Create base and company subfolders at startup (import and export separate; one subfolder per company).
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

  function runMany(sql, rows) {
    rows.forEach((row) => db.prepare(sql).run(...row));
  }
  function seedDummyData() {
    const hasSuppliers = db.prepare('SELECT COUNT(*) as c FROM suppliers').get().c > 0;
    if (hasSuppliers) return;
    const now = new Date().toISOString();
    const daysAgo = (d) => new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const daysFuture = (d) => new Date(Date.now() + d * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    runMany(`INSERT INTO suppliers VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
      ['s1', 'Shenzhen Global Textiles', 'Industrial Zone A, Shenzhen', 'China', 'Bank of China', 'Shenzhen Global Textiles Ltd', 'BKCHCNBJ', 'Shenzhen', 'Li Wei', 'liwei@szglobal.com', 'APPROVED', 'Admin', now, 0, null, null, null, null],
      ['s2', 'Berlin Polymers GmbH', 'Hauptstrasse 10, Berlin', 'Germany', 'Deutsche Bank', 'Berlin Polymers GmbH', 'DEUTDEDB', 'Berlin', 'Hans Mueller', 'hans@berlinpolymers.de', 'APPROVED', 'Admin', now, 0, null, null, null, null],
      ['s3', 'Tokyo Synthetics Co', 'Shinjuku 1-2-3, Tokyo', 'Japan', 'MUFG Bank', 'Tokyo Synthetics Co Ltd', 'BOTKJPJT', 'Tokyo', 'Yuki Tanaka', 'yuki@tokyosyn.co.jp', 'APPROVED', 'Admin', now, 1, 'Mizuho Bank', 'Tokyo Synthetics Co Ltd', 'MHCBJPJT', 'Tokyo Branch'],
      ['s4', 'Mumbai Dyestuffs Pvt Ltd', 'Andheri East, Mumbai', 'India', 'HDFC Bank', 'Mumbai Dyestuffs Pvt Ltd', 'HDFCINBB', 'Mumbai', 'Raj Patel', 'raj@mumbaidye.com', 'APPROVED', 'Admin', now, 0, null, null, null, null],
      ['s5', 'Istanbul Loom Co', 'Taksim Square, Istanbul', 'Turkey', 'Turkiye Is Bankasi', 'Istanbul Loom Co', 'ISBKTRIS', 'Istanbul', 'Mehmet Yilmaz', 'mehmet@istanbulloom.com', 'PENDING', 'Admin', now, 0, null, null, null, null],
    ]);
    runMany('INSERT INTO products VALUES (?,?,?,?,?,?,?)', [
      ['p1', 's1', 'Premium Cotton Yarn', '40s count', '5205', 'KGS', 'RAW_MATERIAL'],
      ['p2', 's1', 'Polyester Staple Fiber', '1.2D', '5503', 'KGS', 'RAW_MATERIAL'],
      ['p3', 's2', 'Nylon Textured Yarn', '70D', '5402', 'KGS', 'RAW_MATERIAL'],
      ['p4', 's3', 'Viscose Rayon', '30s', '5403', 'KGS', 'RAW_MATERIAL'],
      ['p5', 's4', 'Reactive Dyes Red', 'Liquid', '3204', 'LTR', 'RAW_MATERIAL'],
    ]);
    runMany('INSERT INTO materials VALUES (?,?,?,?,?,?)', [
      ['m1', 'Cotton Yarn 40s', 'Combed cotton', '5205', 'KGS', 'RAW_MATERIAL'],
      ['m2', 'Polyester Staple Fiber', '1.2 Denier', '5503', 'KGS', 'RAW_MATERIAL'],
      ['m3', 'Nylon Textured Yarn', '70D', '5402', 'KGS', 'RAW_MATERIAL'],
      ['m4', 'Viscose Rayon Yarn', '30s', '5403', 'KGS', 'RAW_MATERIAL'],
      ['m5', 'Reactive Dyes Red', 'Liquid dye', '3204', 'LTR', 'RAW_MATERIAL'],
      ['m6', 'Caustic Soda Flakes', 'Industrial grade', '2815', 'KGS', 'RAW_MATERIAL'],
      ['m7', 'Industrial Weaving Loom', 'Auto loom', '8448', 'NOS', 'CAPITAL_GOOD'],
      ['m8', 'Spandex Elastic Yarn', '40D', '5404', 'KGS', 'RAW_MATERIAL'],
    ]);
    runMany('INSERT INTO buyers VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
      ['b1', 'London Fashion Hub', '22 Savile Row, London', 'United Kingdom', 'Barclays Bank', 'London Fashion Hub PLC', 'BARCGB22XXX', 'Canary Wharf, London', 'James Miller', 'james@londonfashion.co.uk', 'Rahul Sharma', '9876543210', 1, 'APPROVED', 'Rahul Sharma', now],
      ['b2', 'NY Trends Inc', '5th Avenue, New York', 'USA', 'Chase Bank', 'NY Trends Inc', 'CHASUS33XXX', 'Manhattan, NY', 'Sarah Jessica', 'sarah@nytrends.com', 'J P Tosniwal', '9988776655', 0, 'APPROVED', 'J P Tosniwal', now],
      ['b3', 'Dubai Textile Trading', 'Sheikh Zayed Road, Dubai', 'UAE', 'Emirates NBD', 'Dubai Textile Trading LLC', 'EBILAEAD', 'Dubai', 'Omar Hassan', 'omar@dubaitextile.ae', 'Sales Team', '9123456789', 0, 'APPROVED', 'Admin', now],
    ]);
    runMany('INSERT INTO licences VALUES (?,?,?,?,?,?,?,?,?,?)', [
      ['lic1', '0310224567', 'ADVANCE', daysAgo(200), daysFuture(90), 1000000, 6000000, 500000, 'GFPL', 'ACTIVE'],
      ['lic2', '0310224568', 'ADVANCE', daysAgo(180), daysFuture(120), 1200000, 7000000, 2000000, 'GFPL', 'ACTIVE'],
      ['lic3', '0310224569', 'EPCG', daysAgo(150), daysFuture(200), 800000, 5000000, 1500000, 'GTEX', 'ACTIVE'],
      ['lic4', '0310224570', 'EPCG', daysAgo(100), daysFuture(250), 900000, 5500000, 0, 'GFPL', 'ACTIVE'],
    ]);
    runMany('INSERT INTO lcs VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [
      ['lc1', 'LC/IMP/24/0100', 'State Bank of India', 's1', 50000, 'USD', daysAgo(30), daysFuture(60), daysFuture(90), 'GFPL', 'OPEN', 'Q4 Cotton import'],
      ['lc2', 'LC/IMP/24/0101', 'HDFC Bank', 's2', 35000, 'EUR', daysAgo(15), daysFuture(75), daysFuture(105), 'GFPL', 'OPEN', 'Polymer batch'],
      ['lc3', 'LC/IMP/24/0102', 'ICICI Bank', 's3', 42000, 'USD', daysAgo(7), daysFuture(30), daysFuture(60), 'GTEX', 'OPEN', 'Synthetic yarn'],
    ]);
    const item1 = [{ productId: 'm1', productName: 'Cotton Yarn 40s', hsnCode: '5205', quantity: 5000, unit: 'KGS', rate: 3.5, amount: 17500, productType: 'RAW_MATERIAL' }];
    const item2 = [{ productId: 'm2', productName: 'Polyester Staple Fiber', hsnCode: '5503', quantity: 10000, unit: 'KGS', rate: 1.2, amount: 12000, productType: 'RAW_MATERIAL' }];
    const item3 = [{ productId: 'mp1', productName: 'Cotton Yarn 40s', hsnCode: '5205', quantity: 2000, unit: 'KGS', rate: 5, amount: 10000, productType: 'RAW_MATERIAL' }];
    const hist = [{ status: 'ORDERED', date: now, location: 'System Origin', remarks: 'Order placed' }];
    const shipSql = `INSERT INTO shipments (
      id, supplierId, buyerId, productId, invoiceNumber, company, amount, currency, exchangeRate, rate, quantity,
      status, expectedShipmentDate, createdAt, fobValueFC, fobValueINR, invoiceValueINR,
      isUnderLC, lcNumber, lcAmount, lcDate, isUnderLicence, linkedLicenceId,
      licenceObligationAmount, containerNumber, blNumber, blDate, beNumber, beDate, shippingLine,
      portCode, portOfLoading, portOfDischarge, assessedValue, dutyBCD, dutySWS, dutyINT, gst, trackingUrl,
      incoTerm, paymentDueDate, expectedArrivalDate, invoiceDate, freightCharges, otherCharges,
      documents_json, history_json, payments_json, items_json, documentsFolderPath
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
    const shipRows = [
      ['sh1', 's1', null, 'm1', 'INV/IMP/24/001', 'GFPL', 17500, 'USD', 84, 3.5, 5000, 'IN_TRANSIT', daysAgo(5), now, 17500, 1470000, 1470000, 1, 'LC/IMP/24/0100', 0, daysAgo(30), 1, 'lic1', 50000, null, null, null, null, null, null, 'Shanghai', 'Mundra', 'Mundra', 0, 0, 0, 0, 0, null, 'FOB', daysFuture(30), daysFuture(25), daysAgo(10), null, null, '{}', JSON.stringify(hist), '[]', JSON.stringify(item1), null, null],
      ['sh2', 's2', null, 'm2', 'INV/IMP/24/002', 'GFPL', 12000, 'EUR', 90, 1.2, 10000, 'ORDERED', null, now, 12000, 1080000, 1080000, 1, 'LC/IMP/24/0101', 0, daysAgo(15), 1, 'lic2', 0, null, null, null, null, null, null, 'Hamburg', 'Mundra', 'Mundra', 0, 0, 0, 0, 0, null, 'CIF', daysFuture(45), null, daysAgo(3), 500, 200, '{}', JSON.stringify(hist), '[]', JSON.stringify(item2), null, null],
      ['sh3', null, 'b1', 'mp1', 'INV/EXP/24/001', 'GFPL', 10000, 'GBP', 106.5, 5, 2000, 'ORDERED', null, now, 10000, 1065000, 1065000, 0, null, 0, null, 1, 'lic1', 0, null, null, null, null, null, null, 'Mundra', 'Southampton', 'Southampton', 0, 0, 0, 0, 0, null, 'FOB', daysFuture(14), null, daysAgo(2), null, null, '{}', JSON.stringify(hist), '[]', JSON.stringify(item3), null, null],
      ['sh4', null, 'b2', 'mp1', 'INV/EXP/24/002', 'GTEX', 15000, 'USD', 84, 5, 3000, 'LOADING', null, now, 15000, 1260000, 1260000, 0, null, 0, null, 1, 'lic3', 0, null, null, null, null, null, null, 'Mundra', 'New York', 'New York', 0, 0, 0, 0, 0, null, 'CIF', daysFuture(21), null, daysAgo(1), null, null, '{}', JSON.stringify(hist), '[]', JSON.stringify([{ productId: 'mp1', productName: 'Cotton Yarn 40s', hsnCode: '5205', quantity: 3000, unit: 'KGS', rate: 5, amount: 15000, productType: 'RAW_MATERIAL' }]), null, null],
    ];
    shipRows.forEach((row) => {
      const r = row.map(v => v === undefined ? null : v);
      while (r.length < 50) r.push(null);
      db.prepare(shipSql).run(...r.slice(0, 50));
    });
    console.log('Seeded sample data: vendors, materials, buyers, licences, LCs, shipments.');
  }
  function seedAdditionalData() {
    const hasSuppliers = db.prepare('SELECT COUNT(*) as c FROM suppliers').get().c > 0;
    if (!hasSuppliers) return;
    const hasExtra = db.prepare('SELECT 1 FROM suppliers WHERE id = ?').get('s10');
    if (hasExtra) return;
    const now = new Date().toISOString();
    const daysAgo = (d) => new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const daysFuture = (d) => new Date(Date.now() + d * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    runMany(`INSERT OR IGNORE INTO suppliers VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
      ['s10', 'Vietnam Cotton Co', 'Ho Chi Minh City', 'Vietnam', 'Vietcombank', 'Vietnam Cotton Co Ltd', 'VCBCVNVX', 'HCMC', 'Nguyen Van', 'nguyen@vncotton.vn', 'APPROVED', 'Admin', now, 0, null, null, null, null],
      ['s11', 'Pakistan Yarn Mills', 'Karachi', 'Pakistan', 'HBL', 'Pakistan Yarn Mills Ltd', 'HABBPKKA', 'Karachi', 'Ali Khan', 'ali@pk yarn.com', 'APPROVED', 'Admin', now, 0, null, null, null, null],
    ]);
    runMany('INSERT OR IGNORE INTO products VALUES (?,?,?,?,?,?,?)', [
      ['p10', 's10', 'Combed Cotton 30s', 'Vietnam origin', '5205', 'KGS', 'RAW_MATERIAL'],
      ['p11', 's11', 'Ring Spun Yarn', '40s', '5206', 'KGS', 'RAW_MATERIAL'],
    ]);
    runMany('INSERT OR IGNORE INTO materials VALUES (?,?,?,?,?,?)', [
      ['m10', 'Combed Cotton 30s', 'Vietnam', '5205', 'KGS', 'RAW_MATERIAL'],
      ['m11', 'Ring Spun Yarn 40s', 'Pakistan', '5206', 'KGS', 'RAW_MATERIAL'],
    ]);
    runMany('INSERT OR IGNORE INTO buyers VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
      ['b10', 'Berlin Textiles GmbH', 'Berlin', 'Germany', 'Commerzbank', 'Berlin Textiles GmbH', 'COBADEFF', 'Berlin', 'Klaus Weber', 'klaus@berlintextiles.de', 'Sales', '9111223344', 0, 'APPROVED', 'Admin', now],
    ]);
    runMany('INSERT OR IGNORE INTO licences VALUES (?,?,?,?,?,?,?,?,?,?)', [
      ['lic10', '0310224571', 'ADVANCE', daysAgo(90), daysFuture(180), 1100000, 6500000, 800000, 'GFPL', 'ACTIVE'],
      ['lic11', '0310224572', 'EPCG', daysAgo(60), daysFuture(220), 850000, 5200000, 600000, 'GTEX', 'ACTIVE'],
    ]);
    runMany('INSERT OR IGNORE INTO lcs VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [
      ['lc10', 'LC/IMP/24/0103', 'Axis Bank', 's10', 28000, 'USD', daysAgo(10), daysFuture(50), daysFuture(80), 'GFPL', 'OPEN', 'Vietnam cotton'],
      ['lc11', 'LC/IMP/24/0104', 'Kotak Bank', 's11', 32000, 'USD', daysAgo(5), daysFuture(45), daysFuture(75), 'GTEX', 'OPEN', 'Pakistan yarn'],
    ]);
    const hist = [{ status: 'ORDERED', date: now, location: 'System Origin', remarks: 'Order placed' }];
    const shipSqlAdd = `INSERT OR IGNORE INTO shipments (
      id, supplierId, buyerId, productId, invoiceNumber, company, amount, currency, exchangeRate, rate, quantity,
      status, expectedShipmentDate, createdAt, fobValueFC, fobValueINR, invoiceValueINR,
      isUnderLC, lcNumber, lcAmount, lcDate, isUnderLicence, linkedLicenceId,
      licenceObligationAmount, containerNumber, blNumber, blDate, beNumber, beDate, shippingLine,
      portCode, portOfLoading, portOfDischarge, assessedValue, dutyBCD, dutySWS, dutyINT, gst, trackingUrl,
      incoTerm, paymentDueDate, expectedArrivalDate, invoiceDate, freightCharges, otherCharges,
      documents_json, history_json, payments_json, items_json
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
    const item5 = [{ productId: 'm10', productName: 'Combed Cotton 30s', hsnCode: '5205', quantity: 8000, unit: 'KGS', rate: 3.2, amount: 25600, productType: 'RAW_MATERIAL' }];
    const item6 = [{ productId: 'm11', productName: 'Ring Spun Yarn 40s', hsnCode: '5206', quantity: 5000, unit: 'KGS', rate: 4.0, amount: 20000, productType: 'RAW_MATERIAL' }];
    const item7 = [{ productId: 'mp2', productName: 'Polyester Staple Fiber', hsnCode: '5503', quantity: 4000, unit: 'KGS', rate: 1.5, amount: 6000, productType: 'RAW_MATERIAL' }];
    [
      ['sh10', 's10', null, 'm10', 'INV/IMP/24/010', 'GFPL', 25600, 'USD', 84, 3.2, 8000, 'IN_TRANSIT', daysAgo(2), now, 25600, 2150400, 2150400, 1, 'LC/IMP/24/0103', 0, daysAgo(10), 1, 'lic10', 0, null, null, null, null, null, null, 'Ho Chi Minh', 'Mundra', 'Mundra', 0, 0, 0, 0, 0, null, 'FOB', daysFuture(20), daysFuture(18), daysAgo(5), null, null, '{}', JSON.stringify(hist), '[]', JSON.stringify(item5), null],
      ['sh11', 's11', null, 'm11', 'INV/IMP/24/011', 'GTEX', 20000, 'USD', 84, 4, 5000, 'ORDERED', null, now, 20000, 1680000, 1680000, 1, 'LC/IMP/24/0104', 0, daysAgo(5), 1, 'lic11', 0, null, null, null, null, null, null, 'Karachi', 'Mundra', 'Mundra', 0, 0, 0, 0, 0, null, 'CIF', daysFuture(35), null, daysAgo(1), 300, 100, '{}', JSON.stringify(hist), '[]', JSON.stringify(item6), null],
      ['sh12', null, 'b1', 'mp2', 'INV/EXP/24/010', 'GFPL', 6000, 'USD', 84, 1.5, 4000, 'LOADING', null, now, 6000, 504000, 504000, 0, null, 0, null, 1, 'lic1', 0, null, null, null, null, null, null, 'Mundra', 'London', 'London', 0, 0, 0, 0, 0, null, 'FOB', daysFuture(10), null, daysAgo(0), null, null, '{}', JSON.stringify(hist), '[]', JSON.stringify(item7), null],
    ].forEach((row) => {
      const r = row.map(v => v === undefined ? null : v);
      while (r.length < 49) r.push(null);
      db.prepare(shipSqlAdd).run(...r.slice(0, 49));
    });
    console.log('Added extra sample data (vendors, LCs, licences, shipments).');
  }
  function ensureMinimalShipments() {
    const shipCount = db.prepare('SELECT COUNT(*) as c FROM shipments').get().c;
    if (shipCount > 0) return;
    const sup = db.prepare('SELECT id FROM suppliers LIMIT 1').get();
    const buy = db.prepare('SELECT id FROM buyers LIMIT 1').get();
    const lic = db.prepare('SELECT id FROM licences LIMIT 1').get();
    const mat = db.prepare('SELECT id, name, hsnCode FROM materials LIMIT 1').get();
    if (!sup || !mat) return;
    const now = new Date().toISOString();
    const daysAgo = (d) => new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const daysFuture = (d) => new Date(Date.now() + d * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const hist = [{ status: 'ORDERED', date: now, location: 'System Origin', remarks: 'Order placed' }];
    const item = [{ productId: mat.id, productName: mat.name, hsnCode: mat.hsnCode || '', quantity: 1000, unit: 'KGS', rate: 5, amount: 5000, productType: 'RAW_MATERIAL' }];
    const shipSql = `INSERT INTO shipments (
      id, supplierId, buyerId, productId, invoiceNumber, company, amount, currency, exchangeRate, rate, quantity,
      status, expectedShipmentDate, createdAt, fobValueFC, fobValueINR, invoiceValueINR,
      isUnderLC, lcNumber, lcAmount, lcDate, isUnderLicence, linkedLicenceId,
      licenceObligationAmount, containerNumber, blNumber, blDate, beNumber, beDate, shippingLine,
      portCode, portOfLoading, portOfDischarge, assessedValue, dutyBCD, dutySWS, dutyINT, gst, trackingUrl,
      incoTerm, paymentDueDate, expectedArrivalDate, invoiceDate, freightCharges, otherCharges,
      documents_json, history_json, payments_json, items_json, documentsFolderPath
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
    const linkedLic = (lic != null && lic.id != null) ? lic.id : null;
    const row1 = [];
    row1[0]= 'shseed1'; row1[1]= sup.id; row1[2]= null; row1[3]= mat.id; row1[4]= 'INV/IMP/SEED/001'; row1[5]= 'GFPL'; row1[6]= 5000; row1[7]= 'USD'; row1[8]= 84; row1[9]= 5; row1[10]= 1000;
    row1[11]= 'IN_TRANSIT'; row1[12]= daysAgo(3); row1[13]= now; row1[14]= 5000; row1[15]= 420000; row1[16]= 420000; row1[17]= 0; row1[18]= null; row1[19]= 0; row1[20]= null;
    row1[21]= lic ? 1 : 0; row1[22]= linkedLic; row1[23]= 0; row1[24]= null; row1[25]= null; row1[26]= null; row1[27]= null; row1[28]= null; row1[29]= null;
    row1[30]= 'Mundra'; row1[31]= 'Mundra'; row1[32]= 'Mundra'; row1[33]= 0; row1[34]= 0; row1[35]= 0; row1[36]= 0; row1[37]= 0; row1[38]= null;
    row1[39]= 'FOB'; row1[40]= daysFuture(14); row1[41]= daysFuture(12); row1[42]= daysAgo(5); row1[43]= null; row1[44]= null; row1[45]= null;
    row1[46]= '{}'; row1[47]= JSON.stringify(hist); row1[48]= '[]'; row1[49]= JSON.stringify(item); row1[50]= null;
    const vals1 = row1.slice(0, 51).map(v => v === undefined ? null : v);
    db.prepare(shipSql).run(...vals1);
    if (buy) {
      const item2 = [{ productId: mat.id, productName: mat.name, hsnCode: mat.hsnCode || '', quantity: 500, unit: 'KGS', rate: 8, amount: 4000, productType: 'RAW_MATERIAL' }];
      let row2 = ['shseed2', null, buy.id, mat.id, 'INV/EXP/SEED/001', 'GFPL', 4000, 'USD', 84, 8, 500, 'ORDERED', null, now, 4000, 336000, 336000, 0, null, 0, null, lic ? 1 : 0, linkedLic, 0, null, null, null, null, null, null, 'Mundra', 'Mundra', 'Port', 0, 0, 0, 0, 0, null, 'FOB', daysFuture(7), null, daysAgo(1), null, null, null, '{}', JSON.stringify(hist), '[]', JSON.stringify(item2), null];
      row2 = row2.slice(0, 51).map(v => v === undefined ? null : v);
      while (row2.length < 51) row2.push(null);
      db.prepare(shipSql).run(...row2.slice(0, 51));
    }
    console.log('Added minimal sample shipments (none existed).');
  }
  seedDummyData();
  seedAdditionalData();
  ensureMinimalShipments();

  app.get('/api/materials', (req, res) => {
    res.json(db.prepare('SELECT * FROM materials').all());
  });

  app.post('/api/materials', (req, res) => {
    const m = req.body;
    if (!m || typeof m !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    const idCheck = validateId(m.id, 'Material ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    db.prepare('INSERT OR REPLACE INTO materials VALUES (?,?,?,?,?,?)').run(idCheck.value, m.name, m.description || null, m.hsnCode || null, m.unit || 'KGS', m.type || null);
    res.json({ success: true });
    broadcast();
  });

  app.put('/api/materials/:id', (req, res) => {
    const idCheck = validateId(req.params && req.params.id, 'Material ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const m = req.body;
    if (!m || typeof m !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    db.prepare('UPDATE materials SET name=?, description=?, hsnCode=?, unit=?, type=? WHERE id=?').run(m.name, m.description || null, m.hsnCode || null, m.unit || 'KGS', m.type || null, idCheck.value);
    res.json({ success: true });
    broadcast();
  });

  app.get('/api/suppliers', (req, res) => {
    const rows = db.prepare('SELECT * FROM suppliers').all();
    rows.forEach(s => s.products = db.prepare('SELECT * FROM products WHERE supplierId = ?').all(s.id));
    res.json(rows);
  });

  app.post('/api/suppliers', (req, res) => {
    const s = req.body;
    if (!s || typeof s !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    const idCheck = validateId(s.id, 'Supplier ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const insert = db.prepare(`INSERT OR REPLACE INTO suppliers VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    insert.run(idCheck.value, s.name, s.address, s.country, s.bankName, s.accountHolderName, s.swiftCode, s.bankAddress, s.contactPerson, s.contactDetails, s.status, s.requestedBy, s.createdAt, s.hasIntermediaryBank ? 1 : 0, s.intermediaryBankName || null, s.intermediaryAccountHolderName || null, s.intermediarySwiftCode || null, s.intermediaryBankAddress || null);

    if (s.products && Array.isArray(s.products)) {
      db.prepare('DELETE FROM products WHERE supplierId = ?').run(idCheck.value);
      const prodStmt = db.prepare(`INSERT INTO products VALUES (?,?,?,?,?,?,?)`);
      for (const p of s.products) {
        const pid = validateId(p && p.id, 'Product ID');
        if (pid.valid) prodStmt.run(pid.value, idCheck.value, p.name, p.description, p.hsnCode, p.unit, p.type);
      }
    }
    res.json({ success: true });
    broadcast();
  });

  app.put('/api/suppliers/:id', (req, res) => {
    const idCheck = validateId(req.params && req.params.id, 'Supplier ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const s = req.body;
    if (!s || typeof s !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    const insert = db.prepare(`INSERT OR REPLACE INTO suppliers VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    insert.run(idCheck.value, s.name, s.address, s.country, s.bankName, s.accountHolderName, s.swiftCode, s.bankAddress, s.contactPerson, s.contactDetails, s.status, s.requestedBy, s.createdAt, s.hasIntermediaryBank ? 1 : 0, s.intermediaryBankName || null, s.intermediaryAccountHolderName || null, s.intermediarySwiftCode || null, s.intermediaryBankAddress || null);
    if (s.products && Array.isArray(s.products)) {
      db.prepare('DELETE FROM products WHERE supplierId = ?').run(idCheck.value);
      const prodStmt = db.prepare(`INSERT INTO products VALUES (?,?,?,?,?,?,?)`);
      for (const p of s.products) {
        const pid = validateId(p && p.id, 'Product ID');
        if (pid.valid) prodStmt.run(pid.value, idCheck.value, p.name, p.description, p.hsnCode, p.unit, p.type);
      }
    }
    res.json({ success: true });
    broadcast();
  });

  function safeParseJson(str, fallback) {
    if (str == null || str === '') return fallback;
    try {
      const parsed = JSON.parse(str);
      return parsed != null ? parsed : fallback;
    } catch (_) {
      return fallback;
    }
  }

  app.get('/api/shipments', (req, res) => {
    const rows = db.prepare('SELECT * FROM shipments').all();
    res.json(rows.map(r => {
      const folderPath = isValidDocumentsFolderPath(r.documentsFolderPath) ? r.documentsFolderPath : null;
      const itemsFallback = r.productId ? [{ productId: r.productId, productName: '', quantity: r.quantity, rate: r.rate, amount: (r.quantity || 0) * (r.rate || 0) }] : [];
      return {
        ...r,
        isUnderLC: !!r.isUnderLC,
        isUnderLicence: !!r.isUnderLicence,
        documents: safeParseJson(r.documents_json, {}),
        history: safeParseJson(r.history_json, []),
        payments: safeParseJson(r.payments_json, []),
        items: r.items_json ? safeParseJson(r.items_json, itemsFallback) : itemsFallback,
        documentsFolderPath: folderPath
      };
    }));
  });

  app.get('/api/shipments/:id/documents-folder', (req, res) => {
    const send = (path, exists) => { if (!res.headersSent) res.status(200).json({ path: path ?? null, exists: !!exists }); };
    try {
      const idCheck = validateId(req.params && req.params.id, 'Shipment ID');
      if (!idCheck.valid) { if (!res.headersSent) res.status(400).json({ error: idCheck.message, path: null, exists: false }); return; }
      const id = idCheck.value;
      let row;
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

  app.get('/api/shipments/:id/documents-folder-files', (req, res) => {
    const sendFiles = (files) => { if (!res.headersSent) res.status(200).json({ files: Array.isArray(files) ? files : [] }); };
    try {
      const idCheck = validateId(req.params && req.params.id, 'Shipment ID');
      if (!idCheck.valid) { if (!res.headersSent) res.status(400).json({ error: idCheck.message, files: [] }); return; }
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

  function openFolderResponse(res, success, message, statusCode, debug) {
    if (res.headersSent) return res;
    const payload = { success: !!success, message: message || (success ? 'OK' : 'Error') };
    if (debug != null) payload.debug = debug;
    return res.status(statusCode == null ? 200 : statusCode).json(payload);
  }

  app.post('/api/shipments/:id/open-documents-folder', (req, res) => {
    const _log = (msg, data) => { try { require('http').request({ hostname: '127.0.0.1', port: 7242, path: '/ingest/6a4545ac-9fc1-409a-b304-e37dab664d41', method: 'POST', headers: { 'Content-Type': 'application/json' } }, () => {}).end(JSON.stringify({ location: 'server.js:open-documents-folder', message: msg, data: data || {}, timestamp: Date.now() })); } catch (_) {} };
    try {
      const idCheck = validateId(req.params && req.params.id, 'Shipment ID');
      if (!idCheck.valid) {
        _log('open-docs-folder invalid id', { id: req.params && req.params.id });
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
      _log('open-docs-folder entry', { id, rowExists: !!row, hasBodyShipment: !!(req.body && req.body.shipment) });
      let pathToOpenFromBody = null;
      if (!row && req.body && req.body.shipment) {
        const s = req.body.shipment;
        s.id = s.id || s._id || id;
        const productId = (s.items && s.items[0]) ? s.items[0].productId : s.productId;
        const rate = (s.items && s.items[0]) ? s.items[0].rate : s.rate;
        const quantity = (s.items && s.items[0]) ? s.items[0].quantity : s.quantity;
        let documentsFolderPath;
        try {
          documentsFolderPath = ensureShipmentDocumentsFolder(s);
          pathToOpenFromBody = documentsFolderPath;
        } catch (e) {
          return openFolderResponse(res, false, 'Could not resolve folder path: ' + e.message, 200, { detail: e.message });
        }
        const baseValues = [
          s.id, s.supplierId || null, s.buyerId || null, productId, s.invoiceNumber, s.company, s.amount, s.currency, s.exchangeRate || 1, rate, quantity,
          s.status, s.expectedShipmentDate || null, s.createdAt, s.fobValueFC ?? 0, s.fobValueINR ?? 0, s.invoiceValueINR ?? 0,
          s.isUnderLC ? 1 : 0, s.lcNumber || null, s.lcAmount || 0, s.lcDate || null,
          s.isUnderLicence ? 1 : 0, s.linkedLicenceId || null, s.licenceObligationAmount || 0,
          s.containerNumber || null, s.blNumber || null, s.blDate || null, s.beNumber || null, s.beDate || null,
          s.shippingLine || null, s.portCode || null, s.portOfLoading || null, s.portOfDischarge || null,
          s.assessedValue || 0, s.dutyBCD || 0, s.dutySWS || 0, s.dutyINT || 0, s.gst || 0, s.trackingUrl || null,
          s.incoTerm || 'FOB', s.paymentDueDate || null, s.expectedArrivalDate || null, s.invoiceDate || null, s.freightCharges ?? null, s.otherCharges ?? null,
          JSON.stringify(s.documents || {}), JSON.stringify(s.history || []), JSON.stringify(s.payments || []), JSON.stringify(s.items || []), documentsFolderPath
        ];
        try {
          const stmt51 = db.prepare(`
    INSERT OR REPLACE INTO shipments (
      id, supplierId, buyerId, productId, invoiceNumber, company, amount, currency, exchangeRate, rate, quantity,
      status, expectedShipmentDate, createdAt, fobValueFC, fobValueINR, invoiceValueINR,
      isUnderLC, lcNumber, lcAmount, lcDate, isUnderLicence, linkedLicenceId,
      licenceObligationAmount, containerNumber, blNumber, blDate, beNumber, beDate, shippingLine,
      portCode, portOfLoading, portOfDischarge, assessedValue, dutyBCD, dutySWS, dutyINT, gst, trackingUrl,
      incoTerm, paymentDueDate, expectedArrivalDate, invoiceDate, freightCharges, otherCharges,
      documents_json, history_json, payments_json, items_json, documentsFolderPath, remarks
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
          stmt51.run(...baseValues, s.remarks != null ? s.remarks : null);
        } catch (insertErr) {
          if (/remarks|column count|49|50|values for.*columns/.test(insertErr.message)) {
            try {
              const stmt50 = db.prepare(`
    INSERT OR REPLACE INTO shipments (
      id, supplierId, buyerId, productId, invoiceNumber, company, amount, currency, exchangeRate, rate, quantity,
      status, expectedShipmentDate, createdAt, fobValueFC, fobValueINR, invoiceValueINR,
      isUnderLC, lcNumber, lcAmount, lcDate, isUnderLicence, linkedLicenceId,
      licenceObligationAmount, containerNumber, blNumber, blDate, beNumber, beDate, shippingLine,
      portCode, portOfLoading, portOfDischarge, assessedValue, dutyBCD, dutySWS, dutyINT, gst, trackingUrl,
      incoTerm, paymentDueDate, expectedArrivalDate, invoiceDate, freightCharges, otherCharges,
      documents_json, history_json, payments_json, items_json, documentsFolderPath
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
              stmt50.run(...baseValues);
            } catch (stmt50Err) {
              console.warn('open-documents-folder insert fallback failed:', stmt50Err.message);
            }
          } else throw insertErr;
        }
        broadcast();
        row = db.prepare('SELECT * FROM shipments WHERE id = ?').get(id);
      }
      if (!row && !pathToOpenFromBody) {
        _log('open-docs-folder row not found', { id });
        return openFolderResponse(res, false, 'Shipment not found. Send the shipment in the request body to create it and open the folder.', 404, { id });
      }
      let folderPath = row ? getValidDocumentsFolderPath(row) : pathToOpenFromBody;
      _log('open-docs-folder after getValidPath', { folderPath: folderPath ? folderPath.substring(0, 80) : null, isString: typeof folderPath });
      if (!folderPath || typeof folderPath !== 'string') {
        return openFolderResponse(res, false, 'Documents folder path is missing or could not be resolved. Save the shipment with valid partner and invoice details.', 400, { pathMissing: true });
      }
      const cleanPath = path.normalize(folderPath);
      if (!fs.existsSync(cleanPath)) {
        try {
          fs.mkdirSync(cleanPath, { recursive: true });
        } catch (e) {
          return openFolderResponse(res, false, 'Folder could not be created: ' + e.message, 200, { path: cleanPath.substring(0, 100) });
        }
      }
      console.log('Opening path:', cleanPath);
      const isWin = process.platform === 'win32';
      try {
        if (isWin) {
          const safePath = '"' + cleanPath.replace(/"/g, '\\"') + '"';
          const cmd = 'start "" ' + safePath;
          _log('open-docs-folder exec win', { pathLen: cleanPath.length, hasSpaces: cleanPath.indexOf(' ') !== -1 });
          exec(cmd, { windowsHide: true }, (err) => {
            _log('open-docs-folder exec callback', { err: err ? err.message : null, headersSent: res.headersSent });
            if (!res.headersSent) {
              if (err) openFolderResponse(res, false, err.message || 'Failed to open folder', 200, { execError: err.message });
              else openFolderResponse(res, true, 'OK', 200, { path: cleanPath.substring(0, 80) });
            }
          });
        } else {
          const quotedPath = '"' + cleanPath.replace(/"/g, '\\"') + '"';
          const cmd = process.platform === 'darwin' ? 'open ' + quotedPath : 'xdg-open ' + quotedPath;
          exec(cmd, (err) => {
            if (!res.headersSent) {
              if (err) openFolderResponse(res, false, err.message || 'Failed to open folder', 200, { execError: err.message });
              else openFolderResponse(res, true, 'OK', 200);
            }
          });
        }
      } catch (execErr) {
        console.error('exec error:', execErr);
        if (!res.headersSent) openFolderResponse(res, false, execErr.message || 'Failed to open folder', 200, { execError: execErr.message });
      }
    } catch (err) {
      _log('open-docs-folder catch', { message: err.message });
      console.error('POST /open-documents-folder error:', err);
      if (!res.headersSent) {
        const safeMessage = /column count|values for.*columns|SQLITE_|syntax error/i.test(err.message)
          ? 'Could not save shipment. Please try again.'
          : (err.message || 'Internal server error');
        openFolderResponse(res, false, safeMessage, 200, { error: err.message });
      }
    }
  });

  app.get('/api/shipments/:id/open-documents-folder', (req, res) => {
    try {
      const idCheck = validateId(req.params && req.params.id, 'Shipment ID');
      if (!idCheck.valid) return openFolderResponse(res, false, idCheck.message, 400);
      const id = idCheck.value;
      let row;
      try {
        row = db.prepare('SELECT * FROM shipments WHERE id = ?').get(id);
      } catch (e) {
        return openFolderResponse(res, false, 'Database error. Try again.', 200);
      }
      if (!row) return openFolderResponse(res, false, 'Shipment not found', 404);
      let folderPath = getValidDocumentsFolderPath(row);
      if (!folderPath || typeof folderPath !== 'string') {
        return openFolderResponse(res, false, 'Documents folder path is missing or could not be resolved.', 400, { pathMissing: true });
      }
      const cleanPath = path.normalize(folderPath);
      if (!fs.existsSync(cleanPath)) {
        try { fs.mkdirSync(cleanPath, { recursive: true }); } catch (e) {
          return openFolderResponse(res, false, 'Folder could not be created: ' + e.message, 200);
        }
      }
      console.log('Opening path:', cleanPath);
      const isWin = process.platform === 'win32';
      if (isWin) {
        const safePath = '"' + cleanPath.replace(/"/g, '\\"') + '"';
        exec('start "" ' + safePath, { windowsHide: true }, (err) => {
          if (!res.headersSent) {
            if (err) openFolderResponse(res, false, err.message || 'Failed to open folder', 200);
            else openFolderResponse(res, true, 'OK', 200);
          }
        });
      } else {
        const quotedPath = '"' + cleanPath.replace(/"/g, '\\"') + '"';
        exec(process.platform === 'darwin' ? 'open ' + quotedPath : 'xdg-open ' + quotedPath, (err) => {
          if (!res.headersSent) {
            if (err) openFolderResponse(res, false, err.message || 'Failed to open folder', 200);
            else openFolderResponse(res, true, 'OK', 200);
          }
        });
      }
    } catch (err) {
      console.error('GET /open-documents-folder error:', err);
      if (!res.headersSent) openFolderResponse(res, false, err.message || 'Internal server error', 200);
    }
  });

  app.post('/api/shipments', (req, res) => {
    const s = req.body;
    if (!s || typeof s !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    const idCheck = validateId(s.id, 'Shipment ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const productId = (s.items && s.items[0]) ? s.items[0].productId : s.productId;
    const rate = (s.items && s.items[0]) ? s.items[0].rate : s.rate;
    const quantity = (s.items && s.items[0]) ? s.items[0].quantity : s.quantity;
    const documentsFolderPath = ensureShipmentDocumentsFolder(s);
    const stmt = db.prepare(`
    INSERT OR REPLACE INTO shipments (
      id, supplierId, buyerId, productId, invoiceNumber, company, amount, currency, exchangeRate, rate, quantity,
      status, expectedShipmentDate, createdAt, fobValueFC, fobValueINR, invoiceValueINR,
      isUnderLC, lcNumber, lcAmount, lcDate, isUnderLicence, linkedLicenceId,
      licenceObligationAmount, containerNumber, blNumber, blDate, beNumber, beDate, shippingLine,
      portCode, portOfLoading, portOfDischarge, assessedValue, dutyBCD, dutySWS, dutyINT, gst, trackingUrl,
      incoTerm, paymentDueDate, expectedArrivalDate, invoiceDate, freightCharges, otherCharges,
      documents_json, history_json, payments_json, items_json, documentsFolderPath
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
    stmt.run(
      idCheck.value, s.supplierId || null, s.buyerId || null, productId, s.invoiceNumber, s.company, s.amount, s.currency, s.exchangeRate || 1, rate, quantity,
      s.status, s.expectedShipmentDate || null, s.createdAt, s.fobValueFC, s.fobValueINR, s.invoiceValueINR,
      s.isUnderLC ? 1 : 0, s.lcNumber || null, s.lcAmount || 0, s.lcDate || null,
      s.isUnderLicence ? 1 : 0, s.linkedLicenceId || null, s.licenceObligationAmount || 0,
      s.containerNumber || null, s.blNumber || null, s.blDate || null, s.beNumber || null, s.beDate || null,
      s.shippingLine || null, s.portCode || null, s.portOfLoading || null, s.portOfDischarge || null,
      s.assessedValue || 0, s.dutyBCD || 0, s.dutySWS || 0, s.dutyINT || 0, s.gst || 0, s.trackingUrl || null,
      s.incoTerm || 'FOB', s.paymentDueDate || null, s.expectedArrivalDate || null, s.invoiceDate || null, s.freightCharges ?? null, s.otherCharges ?? null,
      JSON.stringify(s.documents || {}), JSON.stringify(s.history || []), JSON.stringify(s.payments || []), JSON.stringify(s.items || []), documentsFolderPath
    );
    linkShipmentToLC({ ...s, id: idCheck.value });
    res.json({ success: true });
    broadcast();
  });

  app.put('/api/shipments/:id', (req, res) => {
    const idCheck = validateId(req.params && req.params.id, 'Shipment ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const id = idCheck.value;
    const s = req.body;
    if (!s || typeof s !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    const existing = db.prepare('SELECT exchangeRate, remarks, isUnderLC, lcNumber, fileStatus FROM shipments WHERE id = ?').get(id);
    const stmt = db.prepare(`
    UPDATE shipments SET
      status=?, containerNumber=?, blNumber=?, blDate=?, beNumber=?, beDate=?,
      shippingLine=?, portCode=?, portOfLoading=?, portOfDischarge=?,
      assessedValue=?, dutyBCD=?, dutySWS=?, dutyINT=?, gst=?, trackingUrl=?,
      documents_json=?, history_json=?, payments_json=?, items_json=?,
      licenceObligationAmount=?, incoTerm=?, paymentDueDate=?, expectedArrivalDate=?,
      invoiceDate=?, freightCharges=?, otherCharges=?, exchangeRate=?, remarks=?,
      isUnderLC=?, lcNumber=?, lcAmount=?, lcDate=?, fileStatus=?
    WHERE id=?
  `);
    const allowedFileStatus = ['pending', 'clearing', 'ok'].includes(s.fileStatus) ? s.fileStatus : (existing?.fileStatus ?? null);
    stmt.run(
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
      id
    );
    linkShipmentToLC({ ...s, id });
    res.json({ success: true });
    broadcast();
  });

  app.get('/api/buyers', (req, res) => {
    res.json(db.prepare('SELECT * FROM buyers').all().map(b => ({ ...b, hasConsignee: !!b.hasConsignee })));
  });

  app.post('/api/buyers', (req, res) => {
    const b = req.body;
    if (!b || typeof b !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    const idCheck = validateId(b.id, 'Buyer ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const stmt = db.prepare(`INSERT OR REPLACE INTO buyers VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    stmt.run(idCheck.value, b.name, b.address, b.country, b.bankName, b.accountHolderName, b.swiftCode, b.bankAddress, b.contactPerson, b.contactDetails, b.salesPersonName, b.salesPersonContact, b.hasConsignee ? 1 : 0, b.status, b.requestedBy, b.createdAt);
    res.json({ success: true });
    broadcast();
  });

  app.put('/api/buyers/:id', (req, res) => {
    const idCheck = validateId(req.params && req.params.id, 'Buyer ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const b = req.body;
    if (!b || typeof b !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    const stmt = db.prepare(`INSERT OR REPLACE INTO buyers VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    stmt.run(idCheck.value, b.name, b.address, b.country, b.bankName, b.accountHolderName, b.swiftCode, b.bankAddress, b.contactPerson, b.contactDetails, b.salesPersonName, b.salesPersonContact, b.hasConsignee ? 1 : 0, b.status, b.requestedBy, b.createdAt);
    res.json({ success: true });
    broadcast();
  });

  app.get('/api/licences', (req, res) => {
    res.json(db.prepare('SELECT * FROM licences').all());
  });

  app.post('/api/licences', (req, res) => {
    const l = req.body;
    if (!l || typeof l !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    const idCheck = validateId(l.id, 'Licence ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const ins = db.prepare(`INSERT OR REPLACE INTO licences VALUES (?,?,?,?,?,?,?,?,?,?)`);
    ins.run(idCheck.value, l.number, l.type, l.issueDate, l.expiryDate, l.dutySaved, l.eoRequired, l.eoFulfilled, l.company, l.status);
    res.json({ success: true });
    broadcast();
  });

  app.put('/api/licences/:id', (req, res) => {
    const idCheck = validateId(req.params && req.params.id, 'Licence ID');
    if (!idCheck.valid) return res.status(400).json({ success: false, error: idCheck.message });
    const l = req.body;
    if (!l || typeof l !== 'object') return res.status(400).json({ success: false, error: 'Request body required' });
    db.prepare(`UPDATE licences SET eoFulfilled=?, status=? WHERE id=?`).run(l.eoFulfilled, l.status, idCheck.value);
    res.json({ success: true });
    broadcast();
  });

  app.get('/api/lcs', (req, res) => {
    const rows = db.prepare('SELECT * FROM lcs').all();
    res.json(rows.map(r => ({
      ...r,
      shipments: (() => { try { return JSON.parse(r.shipments_json || '[]'); } catch (_) { return []; } })(),
      balanceAmount: r.balanceAmount != null ? Number(r.balanceAmount) : (r.amount != null ? Number(r.amount) : undefined)
    })));
  });

  app.get('/api/lc-transactions', (req, res) => {
    try {
      res.json(db.prepare('SELECT * FROM lc_transactions ORDER BY createdAt DESC').all());
    } catch (e) {
      res.json([]);
    }
  });

  app.post('/api/lcs', (req, res) => {
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

  app.put('/api/lcs/:id', (req, res) => {
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
    // #region agent log
    try { require('http').request({ hostname: '127.0.0.1', port: 7242, path: '/ingest/6a4545ac-9fc1-409a-b304-e37dab664d41', method: 'POST', headers: { 'Content-Type': 'application/json' } }, () => {}).end(JSON.stringify({ location: 'server.js:404', message: 'not found', data: { path: pathStr }, timestamp: Date.now(), hypothesisId: 'H1' })); } catch (_) {}
    // #endregion
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
}

start().catch(err => {
  console.error(err);
  process.exit(1);
});
