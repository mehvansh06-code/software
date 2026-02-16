/**
 * Clears all data from the SQLite ledger (sample and user data).
 * Run once to reset: node server/clear-sample-data.js
 * Order: child tables first (lc_transactions, shipment_items, shipment_history, then shipments, lcs, etc.)
 */
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'ledger.db');
const db = new Database(DB_PATH);

const tables = [
  'lc_transactions',
  'shipment_items',
  'shipment_history',
  'shipments',
  'lcs',
  'licences',
  'products',
  'materials',
  'buyers',
  'suppliers',
  'audit_logs'
];

db.exec('PRAGMA foreign_keys = OFF');
for (const table of tables) {
  try {
    db.prepare(`DELETE FROM ${table}`).run();
    console.log(`Cleared table: ${table}`);
  } catch (e) {
    console.warn(`Skip or error ${table}:`, e.message);
  }
}
db.exec('PRAGMA foreign_keys = ON');
db.close();
console.log('Done. All ledger data cleared. Restart the server and refresh the app (clear localStorage for FLOTEX_PERSISTENT_V1 if needed).');
