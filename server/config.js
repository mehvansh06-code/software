const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');

// UNC base paths for Open Folder on client PCs (override via env if needed)
const IMPORT_BASE = process.env.SHIPMENT_DOCS_BASE || process.env.IMPORT_BASE || '\\\\LAPTOP-RMPRPKLJ\\Import Shipment Documents';
const EXPORT_BASE = process.env.EXPORT_SHIPMENT_DOCS_BASE || process.env.EXPORT_BASE || '\\\\LAPTOP-RMPRPKLJ\\Export Shipment Documents';

const IMPORT_DOCS_BASE = IMPORT_BASE;
const EXPORT_DOCS_BASE = EXPORT_BASE;
const COMPANY_FOLDER = { GFPL: 'Gujarat Flotex Pvt Ltd', GTEX: 'GTEX Fabrics Pvt Ltd' };

module.exports = {
  IMPORT_DOCS_BASE,
  EXPORT_DOCS_BASE,
  COMPANY_FOLDER,
};
