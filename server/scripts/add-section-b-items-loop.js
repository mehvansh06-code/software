/**
 * Add docxtemplater items loop to SECTION B table: wrap the data row with {#items} ... {/items}
 * so one row is output per product. Run on bank payment templates (GFPL and GTEX).
 *
 * Usage: node server/scripts/add-section-b-items-loop.js [path-to.docx]
 *   If no path given, processes both templates in server/templates/bank-payment/
 */
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

const BANK_PAYMENT_DIR = path.join(__dirname, '../templates/bank-payment');

const ITEMS_OPEN = '{#items}';
const ITEMS_CLOSE = '{/items}';

/** Return true if this row XML looks like the SECTION B data row (has invoice_no, goods_desc, quantity, amount) */
function isSectionBDataRow(rowXml) {
  const hasInvoiceNo = /invoice[\s\S]*?_no|invoice_no/.test(rowXml);
  const hasGoodsDesc = /goods[\s\S]*?_desc|goods_desc/.test(rowXml);
  const hasQuantity = /quantity/.test(rowXml);
  const hasAmount = /amount/.test(rowXml);
  return hasGoodsDesc && hasQuantity && hasAmount && (hasInvoiceNo || /invoice/.test(rowXml));
}

/** Insert {#items} at start of first paragraph of first cell in row */
function insertLoopOpen(rowXml) {
  const runTag = '<w:r><w:rPr></w:rPr><w:t>' + ITEMS_OPEN + '</w:t></w:r>';
  const firstCellStart = rowXml.indexOf('<w:tc>');
  if (firstCellStart === -1) return rowXml;
  const firstCell = rowXml.substring(firstCellStart, rowXml.indexOf('</w:tc>', firstCellStart) + '</w:tc>'.length);
  const afterPPr = firstCell.indexOf('</w:pPr>');
  if (afterPPr === -1) return rowXml;
  const insertPos = firstCellStart + afterPPr + '</w:pPr>'.length;
  const before = rowXml.substring(0, insertPos);
  const after = rowXml.substring(insertPos);
  return before + runTag + after;
}

/** Insert {/items} at end of last paragraph of last cell in row */
function insertLoopClose(rowXml) {
  const runTag = '<w:r><w:rPr></w:rPr><w:t>' + ITEMS_CLOSE + '</w:t></w:r>';
  const lastTcClose = rowXml.lastIndexOf('</w:tc>');
  if (lastTcClose === -1) return rowXml;
  const lastTcStart = rowXml.lastIndexOf('<w:tc>', lastTcClose);
  const lastCell = rowXml.substring(lastTcStart, lastTcClose + '</w:tc>'.length);
  const lastPClose = lastCell.lastIndexOf('</w:p>');
  if (lastPClose === -1) return rowXml;
  const insertPos = lastTcStart + lastPClose;
  const before = rowXml.substring(0, insertPos);
  const after = rowXml.substring(insertPos);
  return before + runTag + after;
}

function addItemsLoopToDocx(filePath) {
  const content = fs.readFileSync(filePath, 'binary');
  const zip = new PizZip(content);
  const entry = zip.files['word/document.xml'];
  if (!entry) {
    console.warn('  No word/document.xml');
    return false;
  }
  let xml = entry.asText();

  if (xml.indexOf(ITEMS_OPEN) !== -1 && xml.indexOf(ITEMS_CLOSE) !== -1) {
    console.log('  Already has items loop, skip');
    return true;
  }

  const trRegex = /<w:tr\s[^>]*>([\s\S]*?)<\/w:tr>/g;
  let match;
  let replaced = false;
  while ((match = trRegex.exec(xml)) !== null) {
    const rowXml = match[1];
    if (!isSectionBDataRow(rowXml)) continue;
    let newRow = insertLoopOpen(rowXml);
    newRow = insertLoopClose(newRow);
    const fullRow = '<w:tr' + match[0].substring(4, match[0].indexOf('>') + 1) + newRow + '</w:tr>';
    xml = xml.substring(0, match.index) + fullRow + xml.substring(match.index + match[0].length);
    replaced = true;
    console.log('  Wrapped SECTION B data row with {#items} ... {/items}');
    break;
  }

  if (!replaced) {
    console.warn('  SECTION B data row not found (no row with invoice_no, goods_desc, quantity, amount)');
    return false;
  }

  zip.file('word/document.xml', xml);
  const out = zip.generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
  const dir = path.dirname(filePath);
  const base = path.basename(filePath, '.docx');
  const tempPath = path.join(dir, base + '_temp_loop.docx');
  fs.writeFileSync(tempPath, out);
  try {
    fs.renameSync(tempPath, filePath);
  } catch (e) {
    const fixedPath = path.join(dir, base + '_with_items_loop.docx');
    fs.renameSync(tempPath, fixedPath);
    console.log('  Original locked. Wrote:', path.basename(fixedPath));
    console.log('  Replace original with this file after closing it in Word.');
    return true;
  }
  return true;
}

function main() {
  const argPath = process.argv[2];
  const files = [];

  if (argPath) {
    const p = path.resolve(argPath);
    if (!fs.existsSync(p)) {
      console.error('File not found:', p);
      process.exit(1);
    }
    if (!p.toLowerCase().endsWith('.docx')) {
      console.error('Not a .docx file:', p);
      process.exit(1);
    }
    files.push(p);
  } else {
    if (!fs.existsSync(BANK_PAYMENT_DIR)) {
      console.error('Directory not found:', BANK_PAYMENT_DIR);
      process.exit(1);
    }
    const list = fs.readdirSync(BANK_PAYMENT_DIR);
    list.forEach((name) => {
      if (name.toLowerCase().endsWith('.docx')) {
        files.push(path.join(BANK_PAYMENT_DIR, name));
      }
    });
  }

  if (files.length === 0) {
    console.log('No .docx files found.');
    process.exit(0);
  }

  console.log('Adding SECTION B items loop to', files.length, 'template(s)...');
  files.forEach((f) => {
    console.log(path.basename(f));
    addItemsLoopToDocx(f);
  });
  console.log('Done.');
}

main();
