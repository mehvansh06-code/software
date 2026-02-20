const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DB_PATH = path.join(ROOT, 'ledger.db');
const WAL_PATH = path.join(ROOT, 'ledger.db-wal');
const SHM_PATH = path.join(ROOT, 'ledger.db-shm');
const BACKUP_DIR = path.join(ROOT, 'backups');

function arg(name) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return '';
}

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

function resolveBackupFile() {
  const fromArg = arg('--file');
  if (fromArg) return path.isAbsolute(fromArg) ? fromArg : path.resolve(ROOT, fromArg);
  if (!fs.existsSync(BACKUP_DIR)) return '';
  const files = fs.readdirSync(BACKUP_DIR)
    .filter((f) => /^ledger-\d{4}-\d{2}-\d{2}(_\d{2}-\d{2}-\d{2})?\.db$/.test(f))
    .map((f) => path.join(BACKUP_DIR, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0] || '';
}

function rmIfExists(p) {
  try {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch (_) {}
}

function main() {
  const confirm = String(process.env.RESTORE_CONFIRM || '').toUpperCase();
  if (confirm !== 'YES') {
    console.error('Restore blocked. Run with RESTORE_CONFIRM=YES');
    console.error('Example: set RESTORE_CONFIRM=YES && npm run restore:db -- --file backups\\ledger-YYYY-MM-DD_HH-mm-ss.db');
    process.exit(1);
  }

  const source = resolveBackupFile();
  if (!source || !fs.existsSync(source)) {
    console.error('Backup file not found. Pass --file or keep backups in /backups.');
    process.exit(1);
  }

  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

  try {
    if (fs.existsSync(DB_PATH)) {
      const safety = path.join(BACKUP_DIR, `ledger-pre-restore-${ts()}.db`);
      fs.copyFileSync(DB_PATH, safety);
      console.log(`Safety backup created: ${safety}`);
    }

    // WAL/SHM should not survive a restore.
    rmIfExists(WAL_PATH);
    rmIfExists(SHM_PATH);
    fs.copyFileSync(source, DB_PATH);
    rmIfExists(WAL_PATH);
    rmIfExists(SHM_PATH);

    console.log(`Restore completed from: ${source}`);
    console.log('Start/restart backend now.');
  } catch (e) {
    console.error('Restore failed:', e.message);
    process.exit(1);
  }
}

main();

