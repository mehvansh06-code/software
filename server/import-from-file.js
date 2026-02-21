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

function cellValueToString(value) {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object' && value && value.result != null) return cellValueToString(value.result);
  return String(value).trim();
}

function cellValueToPlain(value) {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'object' && value && value.result != null) return cellValueToPlain(value.result);
  return String(value);
}

function uniqueHeaders(rawHeaders) {
  const seen = new Map();
  return rawHeaders.map((raw, index) => {
    const base = (raw || `Column ${index + 1}`).trim() || `Column ${index + 1}`;
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}_${count}`;
  });
}

async function sheetToRows(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const firstName = Array.isArray(wb.SheetNames) ? wb.SheetNames[0] : '';
  if (!firstName) return [];
  const ws = wb.Sheets[firstName];
  if (!ws) return [];
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
  if (!Array.isArray(matrix) || matrix.length === 0) return [];
  const headerRow = Array.isArray(matrix[0]) ? matrix[0] : [];
  const rawHeaders = headerRow.map((v) => cellValueToString(v));
  const headers = uniqueHeaders(rawHeaders);

  const rows = [];
  for (let rowIndex = 1; rowIndex < matrix.length; rowIndex += 1) {
    const row = Array.isArray(matrix[rowIndex]) ? matrix[rowIndex] : [];
    const out = {};
    let hasAny = false;
    for (let col = 0; col < headers.length; col += 1) {
      const value = cellValueToPlain(row[col]);
      if (value !== '' && value != null) hasAny = true;
      out[headers[col]] = value;
    }
    if (hasAny) rows.push(out);
  }
  return rows;
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
  const findByName = db.prepare('SELECT id FROM suppliers WHERE name = ? LIMIT 1');
  const update = db.prepare(
    `UPDATE suppliers SET name=?, address=?, country=?, bankName=?, accountHolderName=?, accountNumber=?, swiftCode=?, bankAddress=?, contactPerson=?, contactDetails=?, status=?, requestedBy=?, createdAt=?, hasIntermediaryBank=?, intermediaryBankName=?, intermediaryAccountHolderName=?, intermediaryAccountNumber=?, intermediarySwiftCode=?, intermediaryBankAddress=? WHERE id=?`
  );
  const insert = db.prepare(
    `INSERT INTO suppliers (id, name, address, country, bankName, accountHolderName, accountNumber, swiftCode, bankAddress, contactPerson, contactDetails, status, requestedBy, createdAt, hasIntermediaryBank, intermediaryBankName, intermediaryAccountHolderName, intermediaryAccountNumber, intermediarySwiftCode, intermediaryBankAddress) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  for (const r of filtered) {
    const existing = findByName.get(r.name.trim());
    const id = existing ? existing.id : 's_' + Math.random().toString(36).slice(2, 11);
    const vals = [
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
      null,
    ];
    if (existing) {
      update.run(...vals, id);
    } else {
      insert.run(id, ...vals);
    }
  }
  return filtered.length;
}

function importBuyers(rows) {
  const filtered = rows.map(mapToBuyer).filter((r) => r.name && r.country);
  if (filtered.length === 0) return 0;
  const now = new Date().toISOString();
  const findByName = db.prepare('SELECT id FROM buyers WHERE name = ? LIMIT 1');
  const update = db.prepare(
    `UPDATE buyers SET name=?, address=?, country=?, bankName=?, accountHolderName=?, accountNumber=?, swiftCode=?, bankAddress=?, contactPerson=?, contactDetails=?, salesPersonName=?, salesPersonContact=?, hasConsignee=?, status=?, requestedBy=?, createdAt=?, consignees_json=? WHERE id=?`
  );
  const insert = db.prepare(
    `INSERT INTO buyers (id, name, address, country, bankName, accountHolderName, accountNumber, swiftCode, bankAddress, contactPerson, contactDetails, salesPersonName, salesPersonContact, hasConsignee, status, requestedBy, createdAt, consignees_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  for (const r of filtered) {
    const existing = findByName.get(r.name.trim());
    const id = existing ? existing.id : 'b_' + Math.random().toString(36).slice(2, 11);
    const vals = [
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
      null,
    ];
    if (existing) {
      update.run(...vals, id);
    } else {
      insert.run(id, ...vals);
    }
  }
  return filtered.length;
}

function importMaterials(rows) {
  const filtered = rows.map(mapToMaterial).filter((r) => r.name && r.name.trim());
  if (filtered.length === 0) return 0;
  const findByName = db.prepare('SELECT id FROM materials WHERE name = ? LIMIT 1');
  const update = db.prepare('UPDATE materials SET name=?, description=?, hsnCode=?, unit=?, type=? WHERE id=?');
  const insert = db.prepare('INSERT INTO materials (id, name, description, hsnCode, unit, type) VALUES (?,?,?,?,?,?)');
  for (const r of filtered) {
    const existing = findByName.get(r.name.trim());
    const id = existing ? existing.id : 'm_' + Math.random().toString(36).slice(2, 11);
    const name = r.name;
    const description = r.description || null;
    const hsnCode = r.hsnCode || null;
    const unit = r.unit || 'KGS';
    const type = r.type || null;
    if (existing) {
      update.run(name, description, hsnCode, unit, type, id);
    } else {
      insert.run(id, name, description, hsnCode, unit, type);
    }
  }
  return filtered.length;
}

async function main() {
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
    const raw = await sheetToRows(filePath);
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

main().catch((err) => {
  console.error('Import failed:', err && err.message ? err.message : err);
  process.exit(1);
});
