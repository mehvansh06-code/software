const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const IMPORT_DOCS_BASE = process.env.SHIPMENT_DOCS_BASE || path.join(PROJECT_ROOT, 'Import Shipment Documents');
const EXPORT_DOCS_BASE = process.env.EXPORT_SHIPMENT_DOCS_BASE || path.join(PROJECT_ROOT, 'Export Shipment Documents');
const COMPANY_FOLDER = { GFPL: 'Gujarat Flotex Pvt Ltd', GTEX: 'GTEX Fabrics Pvt Ltd' };

module.exports = {
  IMPORT_DOCS_BASE,
  EXPORT_DOCS_BASE,
  COMPANY_FOLDER,
};
