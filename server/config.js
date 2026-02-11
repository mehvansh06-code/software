const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');

/** Use env path as-is; only trim and normalize slashes. Do not add extra backslashes. */
function normalizeUncBase(envValue) {
  if (envValue == null || typeof envValue !== 'string') return null;
  const s = envValue.trim().replace(/\//g, '\\');
  return s.length === 0 ? null : s;
}

// UNC base paths for Open Folder: strictly prefer IP-based paths from .env (e.g. \\192.168.1.70\Import Shipment Documents)
const IMPORT_BASE_RAW = process.env.SHIPMENT_DOCS_BASE || process.env.IMPORT_BASE;
const EXPORT_BASE_RAW = process.env.EXPORT_SHIPMENT_DOCS_BASE || process.env.EXPORT_BASE;
const IMPORT_DOCS_BASE = IMPORT_BASE_RAW ? normalizeUncBase(IMPORT_BASE_RAW) : '\\\\LAPTOP-RMPRPKLJ\\Import Shipment Documents';
const EXPORT_DOCS_BASE = EXPORT_BASE_RAW ? normalizeUncBase(EXPORT_BASE_RAW) : '\\\\LAPTOP-RMPRPKLJ\\Export Shipment Documents';
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
  COMPANY_FOLDER,
  INDENT_COMPANY_DB,
};
