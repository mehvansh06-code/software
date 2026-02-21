const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'ledger.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

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
    intermediaryBankAddress TEXT,
    version INTEGER DEFAULT 1
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
    type TEXT,
    version INTEGER DEFAULT 1
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
    createdAt TEXT,
    version INTEGER DEFAULT 1
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
    licenceObligationQuantity REAL,
    containerNumber TEXT,
    blNumber TEXT,
    blDate TEXT,
    beNumber TEXT,
    beDate TEXT,
    shippingLine TEXT,
    shipmentMode TEXT,
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
    machineryInstallationDate TEXT,
    importValidityDate TEXT,
    expiryDate TEXT,
    dutySaved REAL,
    eoRequired REAL,
    eoFulfilled REAL,
    company TEXT,
    status TEXT,
    version INTEGER DEFAULT 1
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
    remarks TEXT,
    version INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS user_sessions (
    userId TEXT PRIMARY KEY,
    sessionId TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    lastActivityAt TEXT NOT NULL,
    expiresAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS shipment_installments (
    id TEXT PRIMARY KEY,
    shipmentId TEXT NOT NULL,
    kind TEXT NOT NULL,
    dueDate TEXT NOT NULL,
    plannedAmountFC REAL NOT NULL,
    currency TEXT NOT NULL,
    notes TEXT,
    sortOrder INTEGER DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    FOREIGN KEY(shipmentId) REFERENCES shipments(id) ON DELETE CASCADE
  );
`);

function runMigration(sql, label) {
  try {
    db.exec(sql);
  } catch (e) {
    if (!/duplicate column name|already exists/i.test(e.message)) console.warn('Migration', label, e.message);
  }
}

runMigration('ALTER TABLE shipments ADD COLUMN expectedArrivalDate TEXT', 'expectedArrivalDate');
runMigration('ALTER TABLE shipments ADD COLUMN items_json TEXT', 'items_json');
runMigration('ALTER TABLE suppliers ADD COLUMN hasIntermediaryBank INTEGER', 'hasIntermediaryBank');
runMigration('ALTER TABLE suppliers ADD COLUMN intermediaryBankName TEXT', 'intermediaryBankName');
runMigration('ALTER TABLE suppliers ADD COLUMN intermediaryAccountHolderName TEXT', 'intermediaryAccountHolderName');
runMigration('ALTER TABLE suppliers ADD COLUMN intermediarySwiftCode TEXT', 'intermediarySwiftCode');
runMigration('ALTER TABLE suppliers ADD COLUMN intermediaryBankAddress TEXT', 'intermediaryBankAddress');
runMigration('ALTER TABLE suppliers ADD COLUMN intermediaryAccountNumber TEXT', 'suppliers.intermediaryAccountNumber');
runMigration('ALTER TABLE shipments ADD COLUMN invoiceDate TEXT', 'invoiceDate');
runMigration('ALTER TABLE shipments ADD COLUMN freightCharges REAL', 'freightCharges');
runMigration('ALTER TABLE shipments ADD COLUMN otherCharges REAL', 'otherCharges');
runMigration('ALTER TABLE shipments ADD COLUMN documentsFolderPath TEXT', 'documentsFolderPath');
runMigration('ALTER TABLE shipments ADD COLUMN remarks TEXT', 'remarks');
runMigration('ALTER TABLE shipments ADD COLUMN paymentTerm TEXT', 'paymentTerm');
runMigration('ALTER TABLE shipments ADD COLUMN isLC INTEGER', 'shipments.isLC');
runMigration('ALTER TABLE shipments ADD COLUMN lcReferenceNumber TEXT', 'shipments.lcReferenceNumber');
runMigration('ALTER TABLE shipments ADD COLUMN lcOpeningDate TEXT', 'shipments.lcOpeningDate');
runMigration('ALTER TABLE shipments ADD COLUMN fileStatus TEXT', 'shipments.fileStatus');
runMigration('ALTER TABLE shipments ADD COLUMN consigneeId TEXT', 'shipments.consigneeId');
runMigration('ALTER TABLE shipments ADD COLUMN lcSettled INTEGER', 'shipments.lcSettled');
runMigration('ALTER TABLE shipments ADD COLUMN licenceObligationQuantity REAL', 'shipments.licenceObligationQuantity');
runMigration('ALTER TABLE shipments ADD COLUMN shipperSealNumber TEXT', 'shipments.shipperSealNumber');
runMigration('ALTER TABLE shipments ADD COLUMN lineSealNumber TEXT', 'shipments.lineSealNumber');
runMigration('ALTER TABLE shipments ADD COLUMN sbNo TEXT', 'shipments.sbNo');
runMigration('ALTER TABLE shipments ADD COLUMN sbDate TEXT', 'shipments.sbDate');
runMigration('ALTER TABLE shipments ADD COLUMN shipmentMode TEXT', 'shipments.shipmentMode');
runMigration('ALTER TABLE licences ADD COLUMN importValidityDate TEXT', 'licences.importValidityDate');
runMigration('ALTER TABLE licences ADD COLUMN machineryInstallationDate TEXT', 'licences.machineryInstallationDate');
runMigration('CREATE INDEX IF NOT EXISTS idx_shipments_lc_reference ON shipments(lcReferenceNumber) WHERE lcReferenceNumber IS NOT NULL', 'idx_shipments_lc_reference');
runMigration('ALTER TABLE buyers ADD COLUMN consignees_json TEXT', 'buyers.consignees_json');
runMigration('ALTER TABLE shipments ADD COLUMN version INTEGER DEFAULT 1', 'shipments.version');
runMigration('ALTER TABLE shipments ADD COLUMN epcgLicenceId TEXT', 'shipments.epcgLicenceId');
runMigration('ALTER TABLE shipments ADD COLUMN advLicenceId TEXT', 'shipments.advLicenceId');
runMigration('ALTER TABLE lcs ADD COLUMN buyerId TEXT', 'lcs.buyerId');
runMigration('ALTER TABLE lcs ADD COLUMN shipments_json TEXT', 'lcs.shipments_json');
runMigration('ALTER TABLE lcs ADD COLUMN balanceAmount REAL', 'lcs.balanceAmount');
runMigration('ALTER TABLE shipments ADD COLUMN dbk REAL', 'shipments.dbk');
runMigration('ALTER TABLE shipments ADD COLUMN rodtep REAL', 'shipments.rodtep');
runMigration('ALTER TABLE shipments ADD COLUMN scripNo TEXT', 'shipments.scripNo');
runMigration('ALTER TABLE shipments ADD COLUMN dutyPenalty REAL', 'shipments.dutyPenalty');
runMigration('ALTER TABLE shipments ADD COLUMN dutyFine REAL', 'shipments.dutyFine');
runMigration('ALTER TABLE licences ADD COLUMN amountImportUSD REAL', 'licences.amountImportUSD');
runMigration('ALTER TABLE licences ADD COLUMN amountImportINR REAL', 'licences.amountImportINR');
runMigration('ALTER TABLE licences ADD COLUMN importProducts_json TEXT', 'licences.importProducts_json');
runMigration('ALTER TABLE licences ADD COLUMN exportProducts_json TEXT', 'licences.exportProducts_json');
runMigration('ALTER TABLE shipments ADD COLUMN licenceImportLines_json TEXT', 'shipments.licenceImportLines_json');
runMigration('ALTER TABLE shipments ADD COLUMN licenceExportLines_json TEXT', 'shipments.licenceExportLines_json');
runMigration('ALTER TABLE shipments ADD COLUMN linkedLcId TEXT', 'shipments.linkedLcId');
runMigration('ALTER TABLE shipments ADD COLUMN licence_allocations_json TEXT', 'shipments.licence_allocations_json');
runMigration('ALTER TABLE suppliers ADD COLUMN accountNumber TEXT', 'suppliers.accountNumber');
runMigration('ALTER TABLE buyers ADD COLUMN accountNumber TEXT', 'buyers.accountNumber');
runMigration('ALTER TABLE suppliers ADD COLUMN version INTEGER DEFAULT 1', 'suppliers.version');
runMigration('ALTER TABLE buyers ADD COLUMN version INTEGER DEFAULT 1', 'buyers.version');
runMigration('ALTER TABLE licences ADD COLUMN version INTEGER DEFAULT 1', 'licences.version');
runMigration('ALTER TABLE lcs ADD COLUMN version INTEGER DEFAULT 1', 'lcs.version');
runMigration('ALTER TABLE materials ADD COLUMN version INTEGER DEFAULT 1', 'materials.version');
runMigration('UPDATE suppliers SET version = 1 WHERE version IS NULL', 'suppliers.version_backfill');
runMigration('UPDATE buyers SET version = 1 WHERE version IS NULL', 'buyers.version_backfill');
runMigration('UPDATE licences SET version = 1 WHERE version IS NULL', 'licences.version_backfill');
runMigration('UPDATE lcs SET version = 1 WHERE version IS NULL', 'lcs.version_backfill');
runMigration('UPDATE materials SET version = 1 WHERE version IS NULL', 'materials.version_backfill');

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

runMigration(`
  CREATE TABLE IF NOT EXISTS shipment_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shipmentId TEXT NOT NULL,
    productId TEXT,
    productName TEXT,
    description TEXT,
    hsnCode TEXT,
    quantity REAL,
    unit TEXT,
    rate REAL,
    amount REAL,
    productType TEXT,
    sortOrder INTEGER DEFAULT 0,
    FOREIGN KEY(shipmentId) REFERENCES shipments(id) ON DELETE CASCADE
  )
`, 'shipment_items');

runMigration(`
  CREATE TABLE IF NOT EXISTS shipment_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shipmentId TEXT NOT NULL,
    status TEXT,
    date TEXT,
    location TEXT,
    remarks TEXT,
    updatedBy TEXT,
    sortOrder INTEGER DEFAULT 0,
    FOREIGN KEY(shipmentId) REFERENCES shipments(id) ON DELETE CASCADE
  )
`, 'shipment_history');

runMigration('CREATE INDEX IF NOT EXISTS idx_shipment_items_shipmentId ON shipment_items(shipmentId)', 'idx_shipment_items');
runMigration('CREATE INDEX IF NOT EXISTS idx_shipment_history_shipmentId ON shipment_history(shipmentId)', 'idx_shipment_history');
runMigration('CREATE INDEX IF NOT EXISTS idx_shipments_supplierId ON shipments(supplierId)', 'idx_shipments_supplierId');
runMigration('CREATE INDEX IF NOT EXISTS idx_shipments_buyerId ON shipments(buyerId)', 'idx_shipments_buyerId');
runMigration('CREATE INDEX IF NOT EXISTS idx_shipments_company ON shipments(company)', 'idx_shipments_company');
runMigration('CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status)', 'idx_shipments_status');
runMigration('CREATE INDEX IF NOT EXISTS idx_shipments_createdAt ON shipments(createdAt)', 'idx_shipments_createdAt');
runMigration('CREATE INDEX IF NOT EXISTS idx_shipments_invoiceDate ON shipments(invoiceDate)', 'idx_shipments_invoiceDate');
runMigration('CREATE INDEX IF NOT EXISTS idx_lc_transactions_lcId_date ON lc_transactions(lcId, date)', 'idx_lc_transactions_lcId_date');
runMigration('CREATE INDEX IF NOT EXISTS idx_lc_transactions_shipmentId ON lc_transactions(shipmentId)', 'idx_lc_transactions_shipmentId');
runMigration('CREATE INDEX IF NOT EXISTS idx_user_sessions_expiresAt ON user_sessions(expiresAt)', 'idx_user_sessions_expiresAt');
runMigration('CREATE TABLE IF NOT EXISTS shipment_installments (id TEXT PRIMARY KEY, shipmentId TEXT NOT NULL, kind TEXT NOT NULL, dueDate TEXT NOT NULL, plannedAmountFC REAL NOT NULL, currency TEXT NOT NULL, notes TEXT, sortOrder INTEGER DEFAULT 0, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, FOREIGN KEY(shipmentId) REFERENCES shipments(id) ON DELETE CASCADE)', 'shipment_installments');
runMigration('CREATE INDEX IF NOT EXISTS idx_shipment_installments_shipment ON shipment_installments(shipmentId)', 'idx_shipment_installments_shipment');
runMigration('CREATE INDEX IF NOT EXISTS idx_shipment_installments_dueDate ON shipment_installments(dueDate)', 'idx_shipment_installments_dueDate');
runMigration('CREATE INDEX IF NOT EXISTS idx_shipment_installments_kind_dueDate ON shipment_installments(kind, dueDate)', 'idx_shipment_installments_kind_dueDate');

// Sales Indent domain: domestic buyers (India) and indent product master
runMigration(`
  CREATE TABLE IF NOT EXISTS domestic_buyers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    billingAddress TEXT,
    state TEXT,
    gstNo TEXT,
    mobile TEXT,
    salesPersonName TEXT,
    salesPersonMobile TEXT,
    salesPersonEmail TEXT,
    paymentTerms TEXT,
    createdAt TEXT,
    version INTEGER DEFAULT 1
  )
`, 'domestic_buyers');
runMigration(`
  CREATE TABLE IF NOT EXISTS domestic_buyer_sites (
    id TEXT PRIMARY KEY,
    domesticBuyerId TEXT NOT NULL,
    siteName TEXT,
    shippingAddress TEXT,
    FOREIGN KEY(domesticBuyerId) REFERENCES domestic_buyers(id) ON DELETE CASCADE
  )
`, 'domestic_buyer_sites');
runMigration(`
  CREATE TABLE IF NOT EXISTS indent_products (
    id TEXT PRIMARY KEY,
    quality TEXT NOT NULL,
    description TEXT,
    designNo TEXT,
    shadeNo TEXT,
    hsnCode TEXT,
    unit TEXT DEFAULT 'MTR',
    rateInr REAL DEFAULT 0,
    rateUsd REAL DEFAULT 0,
    rateGbp REAL DEFAULT 0,
    version INTEGER DEFAULT 1
  )
`, 'indent_products');
runMigration('ALTER TABLE domestic_buyers ADD COLUMN version INTEGER DEFAULT 1', 'domestic_buyers.version');
runMigration('ALTER TABLE indent_products ADD COLUMN version INTEGER DEFAULT 1', 'indent_products.version');
runMigration('UPDATE domestic_buyers SET version = 1 WHERE version IS NULL', 'domestic_buyers.version_backfill');
runMigration('UPDATE indent_products SET version = 1 WHERE version IS NULL', 'indent_products.version_backfill');
runMigration('CREATE INDEX IF NOT EXISTS idx_domestic_buyer_sites_buyerId ON domestic_buyer_sites(domesticBuyerId)', 'idx_domestic_buyer_sites');
runMigration('CREATE INDEX IF NOT EXISTS idx_indent_products_quality ON indent_products(quality)', 'idx_indent_products_quality');

runMigration(`
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    invoiceNumber TEXT NOT NULL,
    shipmentId TEXT,
    docType TEXT NOT NULL,
    fileName TEXT NOT NULL,
    filePath TEXT NOT NULL,
    createdAt TEXT NOT NULL
  )
`, 'documents');
runMigration('CREATE INDEX IF NOT EXISTS idx_documents_invoiceNumber ON documents(invoiceNumber)', 'idx_documents_invoice');
runMigration('CREATE INDEX IF NOT EXISTS idx_documents_shipmentId ON documents(shipmentId)', 'idx_documents_shipment');
runMigration(`
  CREATE TABLE IF NOT EXISTS bank_payment_postings (
    id TEXT PRIMARY KEY,
    batchId TEXT NOT NULL UNIQUE,
    payload_json TEXT,
    createdBy TEXT,
    createdAt TEXT NOT NULL
  )
`, 'bank_payment_postings');
runMigration('CREATE INDEX IF NOT EXISTS idx_bank_payment_postings_createdAt ON bank_payment_postings(createdAt)', 'idx_bank_payment_postings_createdAt');

// Removed: migrateJsonToNormalized() — no longer syncing items_json/history_json into normalized tables on startup.
// Items and history are written only to shipment_items and shipment_history; items_json is no longer used.

function runMany(sql, rows) {
  rows.forEach((row) => db.prepare(sql).run(...row));
}

function getShipmentValues(s, folderPath) {
  const productId = (s.items && s.items[0]) ? s.items[0].productId : s.productId;
  const rate = (s.items && s.items[0]) ? s.items[0].rate : s.rate;
  const quantity = (s.items && s.items[0]) ? s.items[0].quantity : s.quantity;
  return {
    id: s.id,
    supplierId: s.supplierId || null,
    buyerId: s.buyerId || null,
    productId: productId ?? null,
    invoiceNumber: s.invoiceNumber ?? null,
    company: s.company ?? null,
    amount: s.amount ?? null,
    currency: s.currency ?? null,
    exchangeRate: (s.exchangeRate != null && s.exchangeRate !== '') ? s.exchangeRate : 1,
    rate: rate ?? null,
    quantity: quantity ?? null,
    status: s.status ?? null,
    expectedShipmentDate: s.expectedShipmentDate ?? null,
    createdAt: s.createdAt ?? null,
    fobValueFC: s.fobValueFC ?? 0,
    fobValueINR: s.fobValueINR ?? 0,
    invoiceValueINR: s.invoiceValueINR ?? 0,
    isUnderLC: s.isUnderLC ? 1 : 0,
    lcNumber: s.lcNumber || null,
    lcAmount: s.lcAmount ?? 0,
    lcDate: s.lcDate || null,
    isUnderLicence: s.isUnderLicence ? 1 : 0,
    linkedLicenceId: s.linkedLicenceId || null,
    epcgLicenceId: s.epcgLicenceId || null,
    advLicenceId: s.advLicenceId || null,
    licenceObligationAmount: s.licenceObligationAmount ?? 0,
    licenceObligationQuantity: s.licenceObligationQuantity ?? null,
    containerNumber: s.containerNumber || null,
    blNumber: s.blNumber || null,
    blDate: s.blDate || null,
    beNumber: s.beNumber || null,
    beDate: s.beDate || null,
    shippingLine: s.shippingLine || null,
    shipmentMode: s.shipmentMode || 'SEA',
    portCode: s.portCode || null,
    portOfLoading: s.portOfLoading || null,
    portOfDischarge: s.portOfDischarge || null,
    assessedValue: s.assessedValue ?? 0,
    dutyBCD: s.dutyBCD ?? 0,
    dutySWS: s.dutySWS ?? 0,
    dutyINT: s.dutyINT ?? 0,
    dutyPenalty: s.dutyPenalty ?? null,
    dutyFine: s.dutyFine ?? null,
    gst: s.gst ?? 0,
    trackingUrl: s.trackingUrl || null,
    incoTerm: s.incoTerm || 'FOB',
    paymentDueDate: s.paymentDueDate || null,
    paymentTerm: s.paymentTerm || null,
    expectedArrivalDate: s.expectedArrivalDate ?? null,
    invoiceDate: s.invoiceDate || null,
    freightCharges: s.freightCharges ?? null,
    otherCharges: s.otherCharges ?? null,
    documents_json: typeof s.documents === 'string' ? s.documents : JSON.stringify(s.documents || {}),
    history_json: typeof s.history === 'string' ? s.history : JSON.stringify(s.history || []),
    payments_json: typeof s.payments === 'string' ? s.payments : JSON.stringify(s.payments || []),
    items_json: null,
    documentsFolderPath: folderPath ?? null,
    remarks: s.remarks ?? null,
    consigneeId: s.consigneeId ?? null,
    lcSettled: s.lcSettled ? 1 : 0,
    shipperSealNumber: s.shipperSealNumber || null,
    lineSealNumber: s.lineSealNumber || null,
    sbNo: s.sbNo || null,
    sbDate: s.sbDate || null,
    dbk: s.dbk ?? null,
    rodtep: s.rodtep ?? null,
    scripNo: s.scripNo || null,
    licenceImportLines_json: Array.isArray(s.licenceImportLines) ? JSON.stringify(s.licenceImportLines) : null,
    licenceExportLines_json: Array.isArray(s.licenceExportLines) ? JSON.stringify(s.licenceExportLines) : null,
    linkedLcId: s.linkedLcId || null,
    licence_allocations_json: Array.isArray(s.licenceAllocations) && s.licenceAllocations.length > 0 ? JSON.stringify(s.licenceAllocations) : null,
  };
}

/** Named-parameter INSERT for shipments; use with .run(getShipmentValues(s, folderPath)). */
const SHIPMENT_INSERT_SQL = `
  INSERT INTO shipments (
    id, supplierId, buyerId, productId, invoiceNumber, company, amount, currency, exchangeRate, rate, quantity,
    status, expectedShipmentDate, createdAt, fobValueFC, fobValueINR, invoiceValueINR,
    isUnderLC, lcNumber, lcAmount, lcDate, linkedLcId, isUnderLicence, linkedLicenceId, epcgLicenceId, advLicenceId,
    licenceObligationAmount, licenceObligationQuantity, containerNumber, blNumber, blDate, beNumber, beDate, shippingLine, shipmentMode,
    portCode, portOfLoading, portOfDischarge, assessedValue, dutyBCD, dutySWS, dutyINT, dutyPenalty, dutyFine, gst, trackingUrl,
    incoTerm, paymentDueDate, paymentTerm, expectedArrivalDate, invoiceDate, freightCharges, otherCharges,
    documents_json, history_json, payments_json, items_json, documentsFolderPath, remarks, consigneeId, lcSettled,
    shipperSealNumber, lineSealNumber, sbNo, sbDate, dbk, rodtep, scripNo, licenceImportLines_json, licenceExportLines_json, licence_allocations_json
  ) VALUES (
    :id, :supplierId, :buyerId, :productId, :invoiceNumber, :company, :amount, :currency, :exchangeRate, :rate, :quantity,
    :status, :expectedShipmentDate, :createdAt, :fobValueFC, :fobValueINR, :invoiceValueINR,
    :isUnderLC, :lcNumber, :lcAmount, :lcDate, :linkedLcId, :isUnderLicence, :linkedLicenceId, :epcgLicenceId, :advLicenceId,
    :licenceObligationAmount, :licenceObligationQuantity, :containerNumber, :blNumber, :blDate, :beNumber, :beDate, :shippingLine, :shipmentMode,
    :portCode, :portOfLoading, :portOfDischarge, :assessedValue, :dutyBCD, :dutySWS, :dutyINT, :dutyPenalty, :dutyFine, :gst, :trackingUrl,
    :incoTerm, :paymentDueDate, :paymentTerm, :expectedArrivalDate, :invoiceDate, :freightCharges, :otherCharges,
    :documents_json, :history_json, :payments_json, :items_json, :documentsFolderPath, :remarks, :consigneeId, :lcSettled,
    :shipperSealNumber, :lineSealNumber, :sbNo, :sbDate, :dbk, :rodtep, :scripNo, :licenceImportLines_json, :licenceExportLines_json, :licence_allocations_json
  )`;

const SHIPMENT_INSERT_OR_REPLACE_SQL = SHIPMENT_INSERT_SQL.replace('INSERT INTO', 'INSERT OR REPLACE INTO');

function seedDummyData() {
  const hasSuppliers = db.prepare('SELECT COUNT(*) as c FROM suppliers').get().c > 0;
  if (hasSuppliers) return;
  const now = new Date().toISOString();
  const daysAgo = (d) => new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const daysFuture = (d) => new Date(Date.now() + d * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  runMany(`INSERT INTO suppliers (id, name, address, country, bankName, accountHolderName, accountNumber, swiftCode, bankAddress, contactPerson, contactDetails, status, requestedBy, createdAt, hasIntermediaryBank, intermediaryBankName, intermediaryAccountHolderName, intermediaryAccountNumber, intermediarySwiftCode, intermediaryBankAddress) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    ['s1', 'Shenzhen Global Textiles', 'Industrial Zone A, Shenzhen', 'China', 'Bank of China', 'Shenzhen Global Textiles Ltd', null, 'BKCHCNBJ', 'Shenzhen', 'Li Wei', 'liwei@szglobal.com', 'APPROVED', 'Admin', now, 0, null, null, null, null, null],
    ['s2', 'Berlin Polymers GmbH', 'Hauptstrasse 10, Berlin', 'Germany', 'Deutsche Bank', 'Berlin Polymers GmbH', null, 'DEUTDEDB', 'Berlin', 'Hans Mueller', 'hans@berlinpolymers.de', 'APPROVED', 'Admin', now, 0, null, null, null, null, null],
    ['s3', 'Tokyo Synthetics Co', 'Shinjuku 1-2-3, Tokyo', 'Japan', 'MUFG Bank', 'Tokyo Synthetics Co Ltd', null, 'BOTKJPJT', 'Tokyo', 'Yuki Tanaka', 'yuki@tokyosyn.co.jp', 'APPROVED', 'Admin', now, 1, 'Mizuho Bank', 'Tokyo Synthetics Co Ltd', null, 'MHCBJPJT', 'Tokyo Branch'],
    ['s4', 'Mumbai Dyestuffs Pvt Ltd', 'Andheri East, Mumbai', 'India', 'HDFC Bank', 'Mumbai Dyestuffs Pvt Ltd', null, 'HDFCINBB', 'Mumbai', 'Raj Patel', 'raj@mumbaidye.com', 'APPROVED', 'Admin', now, 0, null, null, null, null, null],
    ['s5', 'Istanbul Loom Co', 'Taksim Square, Istanbul', 'Turkey', 'Turkiye Is Bankasi', 'Istanbul Loom Co', null, 'ISBKTRIS', 'Istanbul', 'Mehmet Yilmaz', 'mehmet@istanbulloom.com', 'PENDING', 'Admin', now, 0, null, null, null, null, null],
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
  runMany('INSERT INTO buyers (id, name, address, country, bankName, accountHolderName, accountNumber, swiftCode, bankAddress, contactPerson, contactDetails, salesPersonName, salesPersonContact, hasConsignee, status, requestedBy, createdAt, consignees_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
    ['b1', 'London Fashion Hub', '22 Savile Row, London', 'United Kingdom', 'Barclays Bank', 'London Fashion Hub PLC', null, 'BARCGB22XXX', 'Canary Wharf, London', 'James Miller', 'james@londonfashion.co.uk', 'Rahul Sharma', '9876543210', 1, 'APPROVED', 'Rahul Sharma', now, null],
    ['b2', 'NY Trends Inc', '5th Avenue, New York', 'USA', 'Chase Bank', 'NY Trends Inc', null, 'CHASUS33XXX', 'Manhattan, NY', 'Sarah Jessica', 'sarah@nytrends.com', 'J P Tosniwal', '9988776655', 0, 'APPROVED', 'J P Tosniwal', now, null],
    ['b3', 'Dubai Textile Trading', 'Sheikh Zayed Road, Dubai', 'UAE', 'Emirates NBD', 'Dubai Textile Trading LLC', null, 'EBILAEAD', 'Dubai', 'Omar Hassan', 'omar@dubaitextile.ae', 'Sales Team', '9123456789', 0, 'APPROVED', 'Admin', now, null],
  ]);
  runMany('INSERT INTO licences (id, number, type, issueDate, importValidityDate, expiryDate, dutySaved, eoRequired, eoFulfilled, company, status) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [
    ['lic1', '0310224567', 'ADVANCE', daysAgo(200), daysFuture(90), daysFuture(90), 1000000, 6000000, 500000, 'GFPL', 'ACTIVE'],
    ['lic2', '0310224568', 'ADVANCE', daysAgo(180), daysFuture(120), daysFuture(120), 1200000, 7000000, 2000000, 'GFPL', 'ACTIVE'],
    ['lic3', '0310224569', 'EPCG', daysAgo(150), daysFuture(200), daysFuture(200), 800000, 5000000, 1500000, 'GTEX', 'ACTIVE'],
    ['lic4', '0310224570', 'EPCG', daysAgo(100), daysFuture(250), daysFuture(250), 900000, 5500000, 0, 'GFPL', 'ACTIVE'],
  ]);
  runMany('INSERT INTO lcs VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [
    ['lc1', 'LC/IMP/24/0100', 'State Bank of India', 's1', 50000, 'USD', daysAgo(30), daysFuture(60), daysFuture(90), 'GFPL', 'OPEN', 'Q4 Cotton import'],
    ['lc2', 'LC/IMP/24/0101', 'HDFC Bank', 's2', 35000, 'EUR', daysAgo(15), daysFuture(75), daysFuture(105), 'GFPL', 'OPEN', 'Polymer batch'],
    ['lc3', 'LC/IMP/24/0102', 'ICICI Bank', 's3', 42000, 'USD', daysAgo(7), daysFuture(30), daysFuture(60), 'GTEX', 'OPEN', 'Synthetic yarn'],
  ]);
  const item1 = [{ productId: 'm1', productName: 'Cotton Yarn 40s', hsnCode: '5205', quantity: 5000, unit: 'KGS', rate: 3.5, amount: 17500, productType: 'RAW_MATERIAL' }];
  const item2 = [{ productId: 'm2', productName: 'Polyester Staple Fiber', hsnCode: '5503', quantity: 10000, unit: 'KGS', rate: 1.2, amount: 12000, productType: 'RAW_MATERIAL' }];
  const item3 = [{ productId: 'mp1', productName: 'Cotton Yarn 40s', hsnCode: '5205', quantity: 2000, unit: 'KGS', rate: 5, amount: 10000, productType: 'RAW_MATERIAL' }];
  const item4 = [{ productId: 'mp1', productName: 'Cotton Yarn 40s', hsnCode: '5205', quantity: 3000, unit: 'KGS', rate: 5, amount: 15000, productType: 'RAW_MATERIAL' }];
  const hist = [{ status: 'ORDERED', date: now, location: 'System Origin', remarks: 'Order placed' }];
  const shipRows = [
    { id: 'sh1', supplierId: 's1', buyerId: null, productId: 'm1', invoiceNumber: 'INV/IMP/24/001', company: 'GFPL', amount: 17500, currency: 'USD', exchangeRate: 84, rate: 3.5, quantity: 5000, status: 'IN_TRANSIT', expectedShipmentDate: daysAgo(5), createdAt: now, fobValueFC: 17500, fobValueINR: 1470000, invoiceValueINR: 1470000, isUnderLC: 1, lcNumber: 'LC/IMP/24/0100', lcAmount: 0, lcDate: daysAgo(30), isUnderLicence: 1, linkedLicenceId: 'lic1', licenceObligationAmount: 50000, containerNumber: null, blNumber: null, blDate: null, beNumber: null, beDate: null, shippingLine: null, portCode: 'Shanghai', portOfLoading: 'Mundra', portOfDischarge: 'Mundra', assessedValue: 0, dutyBCD: 0, dutySWS: 0, dutyINT: 0, gst: 0, trackingUrl: null, incoTerm: 'FOB', paymentDueDate: daysFuture(30), expectedArrivalDate: daysFuture(25), invoiceDate: daysAgo(10), freightCharges: null, otherCharges: null, documents: {}, history: hist, payments: [], items: item1 },
    { id: 'sh2', supplierId: 's2', buyerId: null, productId: 'm2', invoiceNumber: 'INV/IMP/24/002', company: 'GFPL', amount: 12000, currency: 'EUR', exchangeRate: 90, rate: 1.2, quantity: 10000, status: 'ORDERED', expectedShipmentDate: null, createdAt: now, fobValueFC: 12000, fobValueINR: 1080000, invoiceValueINR: 1080000, isUnderLC: 1, lcNumber: 'LC/IMP/24/0101', lcAmount: 0, lcDate: daysAgo(15), isUnderLicence: 1, linkedLicenceId: 'lic2', licenceObligationAmount: 0, containerNumber: null, blNumber: null, blDate: null, beNumber: null, beDate: null, shippingLine: null, portCode: 'Hamburg', portOfLoading: 'Mundra', portOfDischarge: 'Mundra', assessedValue: 0, dutyBCD: 0, dutySWS: 0, dutyINT: 0, gst: 0, trackingUrl: null, incoTerm: 'CIF', paymentDueDate: daysFuture(45), expectedArrivalDate: null, invoiceDate: daysAgo(3), freightCharges: 500, otherCharges: 200, documents: {}, history: hist, payments: [], items: item2 },
    { id: 'sh3', supplierId: null, buyerId: 'b1', productId: 'mp1', invoiceNumber: 'INV/EXP/24/001', company: 'GFPL', amount: 10000, currency: 'GBP', exchangeRate: 106.5, rate: 5, quantity: 2000, status: 'ORDERED', expectedShipmentDate: null, createdAt: now, fobValueFC: 10000, fobValueINR: 1065000, invoiceValueINR: 1065000, isUnderLC: 0, lcNumber: null, lcAmount: 0, lcDate: null, isUnderLicence: 1, linkedLicenceId: 'lic1', licenceObligationAmount: 0, containerNumber: null, blNumber: null, blDate: null, beNumber: null, beDate: null, shippingLine: null, portCode: 'Mundra', portOfLoading: 'Southampton', portOfDischarge: 'Southampton', assessedValue: 0, dutyBCD: 0, dutySWS: 0, dutyINT: 0, gst: 0, trackingUrl: null, incoTerm: 'FOB', paymentDueDate: daysFuture(14), expectedArrivalDate: null, invoiceDate: daysAgo(2), freightCharges: null, otherCharges: null, documents: {}, history: hist, payments: [], items: item3 },
    { id: 'sh4', supplierId: null, buyerId: 'b2', productId: 'mp1', invoiceNumber: 'INV/EXP/24/002', company: 'GTEX', amount: 15000, currency: 'USD', exchangeRate: 84, rate: 5, quantity: 3000, status: 'LOADING', expectedShipmentDate: null, createdAt: now, fobValueFC: 15000, fobValueINR: 1260000, invoiceValueINR: 1260000, isUnderLC: 0, lcNumber: null, lcAmount: 0, lcDate: null, isUnderLicence: 1, linkedLicenceId: 'lic3', licenceObligationAmount: 0, containerNumber: null, blNumber: null, blDate: null, beNumber: null, beDate: null, shippingLine: null, portCode: 'Mundra', portOfLoading: 'New York', portOfDischarge: 'New York', assessedValue: 0, dutyBCD: 0, dutySWS: 0, dutyINT: 0, gst: 0, trackingUrl: null, incoTerm: 'CIF', paymentDueDate: daysFuture(21), expectedArrivalDate: null, invoiceDate: daysAgo(1), freightCharges: null, otherCharges: null, documents: {}, history: hist, payments: [], items: item4 },
  ];
  shipRows.forEach((s) => {
    db.prepare(SHIPMENT_INSERT_SQL).run(getShipmentValues(s, null));
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
  runMany(`INSERT OR IGNORE INTO suppliers (id, name, address, country, bankName, accountHolderName, accountNumber, swiftCode, bankAddress, contactPerson, contactDetails, status, requestedBy, createdAt, hasIntermediaryBank, intermediaryBankName, intermediaryAccountHolderName, intermediaryAccountNumber, intermediarySwiftCode, intermediaryBankAddress) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    ['s10', 'Vietnam Cotton Co', 'Ho Chi Minh City', 'Vietnam', 'Vietcombank', 'Vietnam Cotton Co Ltd', null, 'VCBCVNVX', 'HCMC', 'Nguyen Van', 'nguyen@vncotton.vn', 'APPROVED', 'Admin', now, 0, null, null, null, null, null],
    ['s11', 'Pakistan Yarn Mills', 'Karachi', 'Pakistan', 'HBL', 'Pakistan Yarn Mills Ltd', null, 'HABBPKKA', 'Karachi', 'Ali Khan', 'ali@pk yarn.com', 'APPROVED', 'Admin', now, 0, null, null, null, null, null],
  ]);
  runMany('INSERT OR IGNORE INTO products VALUES (?,?,?,?,?,?,?)', [
    ['p10', 's10', 'Combed Cotton 30s', 'Vietnam origin', '5205', 'KGS', 'RAW_MATERIAL'],
    ['p11', 's11', 'Ring Spun Yarn', '40s', '5206', 'KGS', 'RAW_MATERIAL'],
  ]);
  runMany('INSERT OR IGNORE INTO materials VALUES (?,?,?,?,?,?)', [
    ['m10', 'Combed Cotton 30s', 'Vietnam', '5205', 'KGS', 'RAW_MATERIAL'],
    ['m11', 'Ring Spun Yarn 40s', 'Pakistan', '5206', 'KGS', 'RAW_MATERIAL'],
  ]);
  runMany('INSERT OR IGNORE INTO buyers (id, name, address, country, bankName, accountHolderName, accountNumber, swiftCode, bankAddress, contactPerson, contactDetails, salesPersonName, salesPersonContact, hasConsignee, status, requestedBy, createdAt, consignees_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
    ['b10', 'Berlin Textiles GmbH', 'Berlin', 'Germany', 'Commerzbank', 'Berlin Textiles GmbH', null, 'COBADEFF', 'Berlin', 'Klaus Weber', 'klaus@berlintextiles.de', 'Sales', '9111223344', 0, 'APPROVED', 'Admin', now, null],
  ]);
  runMany('INSERT OR IGNORE INTO licences (id, number, type, issueDate, importValidityDate, expiryDate, dutySaved, eoRequired, eoFulfilled, company, status) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [
    ['lic10', '0310224571', 'ADVANCE', daysAgo(90), daysFuture(180), daysFuture(180), 1100000, 6500000, 800000, 'GFPL', 'ACTIVE'],
    ['lic11', '0310224572', 'EPCG', daysAgo(60), daysFuture(220), daysFuture(220), 850000, 5200000, 600000, 'GTEX', 'ACTIVE'],
  ]);
  runMany('INSERT OR IGNORE INTO lcs VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [
    ['lc10', 'LC/IMP/24/0103', 'Axis Bank', 's10', 28000, 'USD', daysAgo(10), daysFuture(50), daysFuture(80), 'GFPL', 'OPEN', 'Vietnam cotton'],
    ['lc11', 'LC/IMP/24/0104', 'Kotak Bank', 's11', 32000, 'USD', daysAgo(5), daysFuture(45), daysFuture(75), 'GTEX', 'OPEN', 'Pakistan yarn'],
  ]);
  const hist = [{ status: 'ORDERED', date: now, location: 'System Origin', remarks: 'Order placed' }];
  const shipSqlAdd = `
  INSERT OR IGNORE INTO shipments (
    id, supplierId, buyerId, productId, invoiceNumber, company, amount, currency, exchangeRate, rate, quantity,
    status, expectedShipmentDate, createdAt, fobValueFC, fobValueINR, invoiceValueINR,
    isUnderLC, lcNumber, lcAmount, lcDate, isUnderLicence, linkedLicenceId, epcgLicenceId, advLicenceId,
    licenceObligationAmount, licenceObligationQuantity, containerNumber, blNumber, blDate, beNumber, beDate, shippingLine,
    portCode, portOfLoading, portOfDischarge, assessedValue, dutyBCD, dutySWS, dutyINT, gst, trackingUrl,
    incoTerm, paymentDueDate, expectedArrivalDate, invoiceDate, freightCharges, otherCharges,
    documents_json, history_json, payments_json, items_json, documentsFolderPath, remarks, consigneeId, lcSettled,
    shipperSealNumber, lineSealNumber
  ) VALUES (
    :id, :supplierId, :buyerId, :productId, :invoiceNumber, :company, :amount, :currency, :exchangeRate, :rate, :quantity,
    :status, :expectedShipmentDate, :createdAt, :fobValueFC, :fobValueINR, :invoiceValueINR,
    :isUnderLC, :lcNumber, :lcAmount, :lcDate, :isUnderLicence, :linkedLicenceId, :epcgLicenceId, :advLicenceId,
    :licenceObligationAmount, :licenceObligationQuantity, :containerNumber, :blNumber, :blDate, :beNumber, :beDate, :shippingLine,
    :portCode, :portOfLoading, :portOfDischarge, :assessedValue, :dutyBCD, :dutySWS, :dutyINT, :gst, :trackingUrl,
    :incoTerm, :paymentDueDate, :expectedArrivalDate, :invoiceDate, :freightCharges, :otherCharges,
    :documents_json, :history_json, :payments_json, :items_json, :documentsFolderPath, :remarks, :consigneeId, :lcSettled,
    :shipperSealNumber, :lineSealNumber
  )`;
  const item5 = [{ productId: 'm10', productName: 'Combed Cotton 30s', hsnCode: '5205', quantity: 8000, unit: 'KGS', rate: 3.2, amount: 25600, productType: 'RAW_MATERIAL' }];
  const item6 = [{ productId: 'm11', productName: 'Ring Spun Yarn 40s', hsnCode: '5206', quantity: 5000, unit: 'KGS', rate: 4.0, amount: 20000, productType: 'RAW_MATERIAL' }];
  const item7 = [{ productId: 'mp2', productName: 'Polyester Staple Fiber', hsnCode: '5503', quantity: 4000, unit: 'KGS', rate: 1.5, amount: 6000, productType: 'RAW_MATERIAL' }];
  [
    { id: 'sh10', supplierId: 's10', buyerId: null, productId: 'm10', invoiceNumber: 'INV/IMP/24/010', company: 'GFPL', amount: 25600, currency: 'USD', exchangeRate: 84, rate: 3.2, quantity: 8000, status: 'IN_TRANSIT', expectedShipmentDate: daysAgo(2), createdAt: now, fobValueFC: 25600, fobValueINR: 2150400, invoiceValueINR: 2150400, isUnderLC: 1, lcNumber: 'LC/IMP/24/0103', lcAmount: 0, lcDate: daysAgo(10), isUnderLicence: 1, linkedLicenceId: 'lic10', licenceObligationAmount: 0, containerNumber: null, blNumber: null, blDate: null, beNumber: null, beDate: null, shippingLine: null, portCode: 'Ho Chi Minh', portOfLoading: 'Mundra', portOfDischarge: 'Mundra', assessedValue: 0, dutyBCD: 0, dutySWS: 0, dutyINT: 0, gst: 0, trackingUrl: null, incoTerm: 'FOB', paymentDueDate: daysFuture(20), expectedArrivalDate: daysFuture(18), invoiceDate: daysAgo(5), freightCharges: null, otherCharges: null, documents: {}, history: hist, payments: [], items: item5 },
    { id: 'sh11', supplierId: 's11', buyerId: null, productId: 'm11', invoiceNumber: 'INV/IMP/24/011', company: 'GTEX', amount: 20000, currency: 'USD', exchangeRate: 84, rate: 4, quantity: 5000, status: 'ORDERED', expectedShipmentDate: null, createdAt: now, fobValueFC: 20000, fobValueINR: 1680000, invoiceValueINR: 1680000, isUnderLC: 1, lcNumber: 'LC/IMP/24/0104', lcAmount: 0, lcDate: daysAgo(5), isUnderLicence: 1, linkedLicenceId: 'lic11', licenceObligationAmount: 0, containerNumber: null, blNumber: null, blDate: null, beNumber: null, beDate: null, shippingLine: null, portCode: 'Karachi', portOfLoading: 'Mundra', portOfDischarge: 'Mundra', assessedValue: 0, dutyBCD: 0, dutySWS: 0, dutyINT: 0, gst: 0, trackingUrl: null, incoTerm: 'CIF', paymentDueDate: daysFuture(35), expectedArrivalDate: null, invoiceDate: daysAgo(1), freightCharges: 300, otherCharges: 100, documents: {}, history: hist, payments: [], items: item6 },
    { id: 'sh12', supplierId: null, buyerId: 'b1', productId: 'mp2', invoiceNumber: 'INV/EXP/24/010', company: 'GFPL', amount: 6000, currency: 'USD', exchangeRate: 84, rate: 1.5, quantity: 4000, status: 'LOADING', expectedShipmentDate: null, createdAt: now, fobValueFC: 6000, fobValueINR: 504000, invoiceValueINR: 504000, isUnderLC: 0, lcNumber: null, lcAmount: 0, lcDate: null, isUnderLicence: 1, linkedLicenceId: 'lic1', licenceObligationAmount: 0, containerNumber: null, blNumber: null, blDate: null, beNumber: null, beDate: null, shippingLine: null, portCode: 'Mundra', portOfLoading: 'London', portOfDischarge: 'London', assessedValue: 0, dutyBCD: 0, dutySWS: 0, dutyINT: 0, gst: 0, trackingUrl: null, incoTerm: 'FOB', paymentDueDate: daysFuture(10), expectedArrivalDate: null, invoiceDate: daysAgo(0), freightCharges: null, otherCharges: null, documents: {}, history: hist, payments: [], items: item7 },
  ].forEach((s) => {
    db.prepare(shipSqlAdd).run(getShipmentValues(s, null));
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
  const linkedLic = (lic != null && lic.id != null) ? lic.id : null;
  const item1 = [{ productId: mat.id, productName: mat.name, hsnCode: mat.hsnCode || '', quantity: 1000, unit: 'KGS', rate: 5, amount: 5000, productType: 'RAW_MATERIAL' }];
  const s1 = {
    id: 'shseed1', supplierId: sup.id, buyerId: null, productId: mat.id, invoiceNumber: 'INV/IMP/SEED/001', company: 'GFPL',
    amount: 5000, currency: 'USD', exchangeRate: 84, rate: 5, quantity: 1000, status: 'IN_TRANSIT', expectedShipmentDate: daysAgo(3), createdAt: now,
    fobValueFC: 5000, fobValueINR: 420000, invoiceValueINR: 420000, isUnderLC: 0, lcNumber: null, lcAmount: 0, lcDate: null,
    isUnderLicence: lic ? 1 : 0, linkedLicenceId: linkedLic, licenceObligationAmount: 0,
    containerNumber: null, blNumber: null, blDate: null, beNumber: null, beDate: null, shippingLine: null,
    portCode: 'Mundra', portOfLoading: 'Mundra', portOfDischarge: 'Mundra',
    assessedValue: 0, dutyBCD: 0, dutySWS: 0, dutyINT: 0, gst: 0, trackingUrl: null,
    incoTerm: 'FOB', paymentDueDate: daysFuture(14), expectedArrivalDate: daysFuture(12), invoiceDate: daysAgo(5), freightCharges: null, otherCharges: null,
    documents: {}, history: hist, payments: [], items: item1
  };
  db.prepare(SHIPMENT_INSERT_SQL).run(getShipmentValues(s1, null));
  if (buy) {
    const item2 = [{ productId: mat.id, productName: mat.name, hsnCode: mat.hsnCode || '', quantity: 500, unit: 'KGS', rate: 8, amount: 4000, productType: 'RAW_MATERIAL' }];
    const s2 = {
      id: 'shseed2', supplierId: null, buyerId: buy.id, productId: mat.id, invoiceNumber: 'INV/EXP/SEED/001', company: 'GFPL',
      amount: 4000, currency: 'USD', exchangeRate: 84, rate: 8, quantity: 500, status: 'ORDERED', expectedShipmentDate: null, createdAt: now,
      fobValueFC: 4000, fobValueINR: 336000, invoiceValueINR: 336000, isUnderLC: 0, lcNumber: null, lcAmount: 0, lcDate: null,
      isUnderLicence: lic ? 1 : 0, linkedLicenceId: linkedLic, licenceObligationAmount: 0,
      containerNumber: null, blNumber: null, blDate: null, beNumber: null, beDate: null, shippingLine: null,
      portCode: 'Mundra', portOfLoading: 'Mundra', portOfDischarge: 'Port',
      assessedValue: 0, dutyBCD: 0, dutySWS: 0, dutyINT: 0, gst: 0, trackingUrl: null,
      incoTerm: 'FOB', paymentDueDate: daysFuture(7), expectedArrivalDate: null, invoiceDate: daysAgo(1), freightCharges: null, otherCharges: null,
      documents: {}, history: hist, payments: [], items: item2
    };
    db.prepare(SHIPMENT_INSERT_SQL).run(getShipmentValues(s2, null));
  }
  console.log('Added minimal sample shipments (none existed).');
}

// Sample data seeding disabled — use scripts/clear-sample-data.js to clear DB; DB starts empty on fresh install
// seedDummyData();
// seedAdditionalData();
// ensureMinimalShipments();

// Permission system: users table, permissions column, audit_logs, backfill
try {
  const { runPermissionMigration } = require('./migrations/permissionMigration');
  runPermissionMigration(db);
} catch (e) {
  console.warn('Permission migration:', e.message);
}

module.exports = db;
module.exports.getShipmentValues = getShipmentValues;
module.exports.SHIPMENT_INSERT_OR_REPLACE_SQL = SHIPMENT_INSERT_OR_REPLACE_SQL;
