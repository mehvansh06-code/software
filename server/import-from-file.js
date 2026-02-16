/**
 * Import data from Excel files in a folder.
 * Usage: node server/import-from-file.js [folderPath]
 * Default folder: ./data (relative to project root)
 *
 * Place Excel files in the folder and name them (or use sheet names):
 *   - suppliers.xlsx / suppliers_*.xlsx  -> import suppliers
 *   - buyers.xlsx / buyers_*.xlsx        -> import buyers
 *   - materials.xlsx / materials_*.xlsx -> import materials
 *
 * Column names: same as the app (Name, Country, Address, Bank Name, Account Holder, etc.)
 */

const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const db = require('./db');

const PROJECT_ROOT = path.join(__dirname, '..');
const DEFAULT_FOLDER = path.join(PROJECT_ROOT, 'data');

function getFolderOrFile() {
  const arg = process.argv[2];
  if (!arg) return { folder: DEFAULT_FOLDER, singleFile: null };
  const resolved = path.isAbsolute(arg) ? arg : path.join(PROJECT_ROOT, arg);
  const stat = fs.existsSync(resolved) && fs.statSync(resolved);
  if (stat && stat.isFile()) return { folder: path.dirname(resolved), singleFile: resolved };
  return { folder: resolved, singleFile: null };
}

function listExcelFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir);
  return files
    .filter((f) => /\.(xlsx|xls)$/i.test(f))
    .map((f) => path.join(dir, f));
}

function sheetToRows(filePath) {
  const buf = fs.readFileSync(filePath);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const first = wb.SheetNames[0];
  if (!first) return [];
  const ws = wb.Sheets[first];
  return XLSX.utils.sheet_to_json(ws);
}

function inferType(filePath) {
  const base = path.basename(filePath, path.extname(filePath)).toLowerCase();
  if (base.includes('supplier')) return 'suppliers';
  if (base.includes('buyer')) return 'buyers';
  if (base.includes('material')) return 'materials';
  return null;
}

function mapToSupplier(r) {
  return {
    name: r.Name ?? r.name ?? r['Supplier Name'] ?? '',
    address: r.Address ?? r.address ?? '',
    country: r.Country ?? r.country ?? '',
    bankName: r['Bank Name'] ?? r.bankName ?? r.Bank ?? '',
    accountHolderName: r['Account Holder'] ?? r['A/C Holder'] ?? r.accountHolderName ?? '',
    accountNumber: r['Account Number'] ?? r.accountNumber ?? r.account_number ?? null,
    swiftCode: r.SWIFT ?? r.Swift ?? r.swiftCode ?? r['SWIFT Code'] ?? '',
    bankAddress: r['Bank Address'] ?? r.bankAddress ?? '',
    contactPerson: r['Contact Person'] ?? r.contactPerson ?? r['Contact Name'] ?? '',
    contactDetails: (r['Contact Number'] || r['Contact Email'] ? [r['Contact Number'], r['Contact Email']].filter(Boolean).join(' / ') : null) || null,
  };
}

function mapToBuyer(r) {
  return {
    name: r.Name ?? r.name ?? r['Legal Name'] ?? r['Buyer Name'] ?? '',
    address: r.Address ?? r.address ?? r['Billing Address'] ?? '',
    country: r.Country ?? r.country ?? '',
    bankName: r['Bank Name'] ?? r.bankName ?? r.Bank ?? '',
    accountHolderName: r['Account Holder'] ?? r['A/C Holder'] ?? r.accountHolderName ?? r.AccountHolder ?? '',
    accountNumber: r['Account Number'] ?? r.accountNumber ?? r.account_number ?? null,
    swiftCode: r.SWIFT ?? r.Swift ?? r.swiftCode ?? r['SWIFT Code'] ?? '',
    bankAddress: r['Bank Address'] ?? r.bankAddress ?? '',
    contactPerson: r['Contact Person'] ?? r.contactPerson ?? r['Contact Name'] ?? '',
    contactDetails: (r['Contact Number'] || r['Contact Email'] ? [r['Contact Number'], r['Contact Email']].filter(Boolean).join(' / ') : null) || null,
    salesPersonName: r['Sales Person Name'] ?? r.salesPersonName ?? r['Sales Person'] ?? '',
    salesPersonContact: r['Sales Person Contact'] ?? r.salesPersonContact ?? r.salesPersonMobile ?? '',
  };
}

function mapToMaterial(r) {
  return {
    name: r.Name ?? r.name ?? r['Material Name'] ?? '',
    description: r.Description ?? r.description ?? null,
    hsnCode: r['HSN Code'] ?? r.hsnCode ?? r.HSN ?? null,
    unit: r.Unit ?? r.unit ?? 'KGS',
    type: r.Type ?? r.type ?? null,
  };
}

function importSuppliers(rows) {
  const filtered = rows.map(mapToSupplier).filter((r) => r.name && r.country);
  if (filtered.length === 0) return 0;
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT OR REPLACE INTO suppliers (id, name, address, country, bankName, accountHolderName, accountNumber, swiftCode, bankAddress, contactPerson, contactDetails, status, requestedBy, createdAt, hasIntermediaryBank, intermediaryBankName, intermediaryAccountHolderName, intermediaryAccountNumber, intermediarySwiftCode, intermediaryBankAddress) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  for (const r of filtered) {
    const id = 's_' + Math.random().toString(36).slice(2, 11);
    insert.run(
      id,
      r.name,
      r.address || '',
      r.country,
      r.bankName || '',
      r.accountHolderName || '',
      r.accountNumber || null,
      r.swiftCode || '',
      r.bankAddress || '',
      r.contactPerson || '',
      r.contactDetails || null,
      'APPROVED',
      'File import',
      now,
      0,
      null,
      null,
      null,
      null,
      null
    );
  }
  return filtered.length;
}

function importBuyers(rows) {
  const filtered = rows.map(mapToBuyer).filter((r) => r.name && r.country);
  if (filtered.length === 0) return 0;
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO buyers (id, name, address, country, bankName, accountHolderName, accountNumber, swiftCode, bankAddress, contactPerson, contactDetails, salesPersonName, salesPersonContact, hasConsignee, status, requestedBy, createdAt, consignees_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  for (const r of filtered) {
    const id = 'b_' + Math.random().toString(36).slice(2, 11);
    stmt.run(
      id,
      r.name,
      r.address || '',
      r.country,
      r.bankName || '',
      r.accountHolderName || '',
      r.accountNumber || null,
      r.swiftCode || '',
      r.bankAddress || '',
      r.contactPerson || '',
      r.contactDetails || '',
      r.salesPersonName || '',
      r.salesPersonContact || '',
      0,
      'APPROVED',
      'File import',
      now,
      null
    );
  }
  return filtered.length;
}

function importMaterials(rows) {
  const filtered = rows.map(mapToMaterial).filter((r) => r.name && r.name.trim());
  if (filtered.length === 0) return 0;
  for (const r of filtered) {
    const id = 'm_' + Math.random().toString(36).slice(2, 11);
    db.prepare('INSERT OR REPLACE INTO materials VALUES (?,?,?,?,?,?)').run(
      id,
      r.name,
      r.description || null,
      r.hsnCode || null,
      r.unit || 'KGS',
      r.type || null
    );
  }
  return filtered.length;
}

function main() {
  const { folder, singleFile } = getFolderOrFile();
  if (singleFile) console.log('Import file:', singleFile);
  else console.log('Import folder:', folder);

  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
    console.log('Created folder. Place Excel files (suppliers.xlsx, buyers.xlsx, materials.xlsx) there and run again.');
    process.exit(0);
    return;
  }

  const files = singleFile ? [singleFile] : listExcelFiles(folder);
  if (files.length === 0) {
    console.log('No .xlsx or .xls files found in', folder);
    console.log('Place files named e.g. suppliers.xlsx, buyers.xlsx, materials.xlsx and run again.');
    console.log('Or run: node server/import-from-file.js "path/to/your/file.xlsx"');
    process.exit(1);
  }

  let totalSuppliers = 0;
  let totalBuyers = 0;
  let totalMaterials = 0;

  for (const filePath of files) {
    const type = inferType(filePath);
    if (!type) {
      console.log('Skip (unknown type):', path.basename(filePath));
      continue;
    }
    const raw = sheetToRows(filePath);
    if (raw.length === 0) {
      console.log('Skip (no rows):', path.basename(filePath));
      continue;
    }
    try {
      if (type === 'suppliers') {
        const n = importSuppliers(raw);
        totalSuppliers += n;
        console.log('Imported', n, 'supplier(s) from', path.basename(filePath));
      } else if (type === 'buyers') {
        const n = importBuyers(raw);
        totalBuyers += n;
        console.log('Imported', n, 'buyer(s) from', path.basename(filePath));
      } else if (type === 'materials') {
        const n = importMaterials(raw);
        totalMaterials += n;
        console.log('Imported', n, 'material(s) from', path.basename(filePath));
      }
    } catch (e) {
      console.error('Error importing', path.basename(filePath), e.message);
    }
  }

  console.log('Done. Total: suppliers', totalSuppliers, ', buyers', totalBuyers, ', materials', totalMaterials);
}

main();
