/**
 * Extract placeholder names from a .docx template (e.g. {{ name }}, { date }).
 * Usage: node server/scripts/extract-docx-placeholders.js [path-to.docx]
 */
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

const templatePath = process.argv[2] || path.join(__dirname, '../templates/bank-payment/ZHEJIANG FUSHENGDA.docx');

if (!fs.existsSync(templatePath)) {
  console.error('File not found:', templatePath);
  process.exit(1);
}

const content = fs.readFileSync(templatePath, 'binary');
const zip = new PizZip(content);
const documentXml = zip.files['word/document.xml'];
if (!documentXml) {
  console.error('No word/document.xml in docx');
  process.exit(1);
}

const xml = documentXml.asText();
const doubleBraces = [...xml.matchAll(/\{\{\s*([^}\s]+(?:\s+[^}\s]+)*)\s*\}\}/g)];
const singleBraces = [...xml.matchAll(/\{\s*([^}\s]+(?:\s+[^}\s]+)*)\s*\}/g)];

const tags = new Set();
doubleBraces.forEach((m) => tags.add(m[1].trim()));
singleBraces.forEach((m) => tags.add(m[1].trim()));

console.log('Placeholders found in template:');
[...tags].sort().forEach((t) => console.log('  ', t));
console.log('\nTotal:', tags.size);
