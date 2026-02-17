/**
 * Convert double-brace placeholders {{ tag }} to single-brace { tag } in .docx templates
 * so they match the backend docxtemplater delimiters.
 * Usage:
 *   node server/scripts/fix-template-braces.js
 *     (processes all .docx in server/templates/bank-payment/)
 *   node server/scripts/fix-template-braces.js "path/to/template.docx"
 */
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

const BANK_PAYMENT_DIR = path.join(__dirname, '../templates/bank-payment');

function fixDocx(filePath) {
  const content = fs.readFileSync(filePath, 'binary');
  const zip = new PizZip(content);
  const entry = zip.files['word/document.xml'];
  if (!entry) {
    console.warn('  No word/document.xml, skip');
    return false;
  }
  let xml = entry.asText();
  const before = xml;
  xml = xml.replace(/\{\{/g, '{');
  xml = xml.replace(/\}\}/g, '}');
  // Fix duplicate braces split across Word runs (run "{", run "{" -> keep first, empty second)
  xml = xml.replace(/<w:t>\{<\/w:t><\/w:r>(<w:r[^>]*>)([\s\S]*?)<w:t>\{<\/w:t>/g, '<w:t>{</w:t></w:r>$1$2<w:t></w:t>');
  xml = xml.replace(/<w:t>\}<\/w:t><\/w:r>(<w:r[^>]*>)([\s\S]*?)<w:t>\}<\/w:t>/g, '<w:t>}</w:t></w:r>$1$2<w:t></w:t>');
  if (xml === before) {
    console.log('  No {{ or }} or split braces found, nothing changed');
    return true;
  }
  zip.file('word/document.xml', xml);
  const out = zip.generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
  const dir = path.dirname(filePath);
  const base = path.basename(filePath, '.docx');
  const tempPath = path.join(dir, base + '_temp.docx');
  fs.writeFileSync(tempPath, out);
  try {
    fs.renameSync(tempPath, filePath);
  } catch (e) {
    const fixedPath = path.join(dir, base + '_fixed.docx');
    fs.renameSync(tempPath, fixedPath);
    console.log('  Original is locked. Wrote fixed copy to:', path.basename(fixedPath));
    console.log('  Close the original in Word, then replace it with this file.');
    return true;
  }
  console.log('  Updated: double braces replaced with single braces');
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
    console.log('No .docx files found in', BANK_PAYMENT_DIR);
    console.log('Copy your template(s) there and run this script again, or pass a path:');
    console.log('  node server/scripts/fix-template-braces.js "C:\\path\\to\\template.docx"');
    process.exit(0);
  }

  console.log('Processing', files.length, 'file(s)...');
  files.forEach((f) => {
    console.log(path.basename(f));
    fixDocx(f);
  });
  console.log('Done.');
}

main();
