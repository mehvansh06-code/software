const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');

/**
 * Folder structure for shipment documents:
 *   [Import Shipment Documents] or [Export Shipment Documents]   (two separate roots)
 *     └── [Gujarat Flotex Pvt Ltd] or [GTEX Fabrics Pvt Ltd]    (company)
 *           └── [PartnerName_InvoiceNo]                          (e.g. Reliance_87)
 *                 └── uploaded/scanned files
 * All uploads and scans for a shipment (from the shipment detail page) save into that shipment's folder.
 */
const DOCUMENTS_BASE = process.env.DOCUMENTS_BASE
  ? path.resolve(process.env.DOCUMENTS_BASE)
  : path.join(PROJECT_ROOT, 'documents');

/** Use env path as-is; only trim and normalize slashes. Do not add extra backslashes. */
function normalizeUncBase(envValue) {
  if (envValue == null || typeof envValue !== 'string') return null;
  const s = envValue.trim().replace(/\//g, '\\');
  return s.length === 0 ? null : s;
}

/** If path is relative (no leading \ or drive), resolve against PROJECT_ROOT. */
function resolveDocBase(envValue) {
  const s = normalizeUncBase(envValue);
  if (!s) return null;
  if (s.startsWith('\\\\') || /^[A-Za-z]:/.test(s)) return s; // UNC or absolute Windows path
  return path.resolve(PROJECT_ROOT, s);
}

// Two separate roots: Import and Export. Set via .env (e.g. IMPORT_BASE, EXPORT_BASE or SHIPMENT_DOCS_BASE / EXPORT_SHIPMENT_DOCS_BASE).
const IMPORT_BASE_RAW = process.env.SHIPMENT_DOCS_BASE || process.env.IMPORT_BASE;
const EXPORT_BASE_RAW = process.env.EXPORT_SHIPMENT_DOCS_BASE || process.env.EXPORT_BASE;
const LOCAL_IMPORT_DOCS = path.join(PROJECT_ROOT, 'documents', 'Import Shipment Documents');
const LOCAL_EXPORT_DOCS = path.join(PROJECT_ROOT, 'documents', 'Export Shipment Documents');
const IMPORT_DOCS_BASE = IMPORT_BASE_RAW ? resolveDocBase(IMPORT_BASE_RAW) : LOCAL_IMPORT_DOCS;
const EXPORT_DOCS_BASE = EXPORT_BASE_RAW ? resolveDocBase(EXPORT_BASE_RAW) : LOCAL_EXPORT_DOCS;
// Under each root: one folder per company (Gujarat Flotex, GTEX Fabrics).
const COMPANY_FOLDER = { GFPL: 'Gujarat Flotex Pvt Ltd', GTEX: 'GTEX Fabrics Pvt Ltd' };

/** Sales Indent: company master (name, address, GSTIN, IEC, bank details) */
const INDENT_COMPANY_DB = {
  'Gujarat Flotex Pvt. Ltd.': {
    address: '3rd Floor, Elanza Vertex, Behind Armieda, Sindhu Bhavan Road,\nPakwan Cross Road, Ahmedabad-380059, Gujarat (India)',
    gstin: '24AABCG4542P1ZF',
    iec: '2406000000',
    phone: '6358858231',
    bankDetails: {
      accountHolder: 'GUJARAT FLOTEX PVT LTD',
      bank: 'STATE BANK OF INDIA',
      branch: 'LAGHU UDHYOG, AHMEDABAD',
      acct: '30852691460',
      ifsc: 'SBIN0003993',
      swift: 'SBININBBA23',
    },
  },
  'GTEX Fabrics': {
    address: '3rd Floor, Elanza Vertex, Sindhu Bhavan Road,\nAhmedabad - 380054, Gujarat (India)',
    gstin: '24AAGCG4275J1ZG',
    iec: '2406000000',
    phone: '6358858231',
    bankDetails: {
      accountHolder: 'GTEX FABRICS PVT LTD',
      bank: 'STATE BANK OF INDIA',
      branch: 'LAGHU UDHYOG, AHMEDABAD',
      acct: '39092267695',
      ifsc: 'SBIN0003993',
      swift: 'SBININBBA23',
    },
  },
};

module.exports = {
  IMPORT_DOCS_BASE,
  EXPORT_DOCS_BASE,
  LOCAL_IMPORT_DOCS,
  LOCAL_EXPORT_DOCS,
  COMPANY_FOLDER,
  INDENT_COMPANY_DB,
  DOCUMENTS_BASE,
};
