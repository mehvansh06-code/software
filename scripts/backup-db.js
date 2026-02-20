const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const ROOT = path.resolve(__dirname, '..');
const DB_PATH = path.join(ROOT, 'ledger.db');
const BACKUP_DIR = path.join(ROOT, 'backups');
const KEEP_DAYS = Number(process.env.BACKUP_KEEP_DAYS || 30);

function ts() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}_${hh}-${mi}-${ss}`;
}

function cleanupOldBackups(dir, keepDays) {
  const now = Date.now();
  const cutoff = now - keepDays * 24 * 60 * 60 * 1000;
  const files = fs.readdirSync(dir).filter((f) => /^ledger-\d{4}-\d{2}-\d{2}(_\d{2}-\d{2}-\d{2})?\.db$/.test(f));
  for (const file of files) {
    const full = path.join(dir, file);
    try {
      const stat = fs.statSync(full);
      if (stat.mtimeMs < cutoff) fs.unlinkSync(full);
    } catch (_) {}
  }
}

async function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`Database not found: ${DB_PATH}`);
    process.exit(1);
  }
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const out = path.join(BACKUP_DIR, `ledger-${ts()}.db`);
  const db = new Database(DB_PATH, { readonly: true });
  try {
    await db.backup(out);
    cleanupOldBackups(BACKUP_DIR, KEEP_DAYS);
    console.log(`Backup created: ${out}`);
    console.log(`Retention: ${KEEP_DAYS} day(s)`);
  } finally {
    db.close();
  }
}

main().catch((e) => {
  console.error('Backup failed:', e.message);
  process.exit(1);
});

