const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

const docxPath = process.argv[2] || path.join(__dirname, '../templates/bank-payment/test-output/GTEX_single_product.docx');
const content = fs.readFileSync(docxPath, 'binary');
const z = new PizZip(content);
const xml = z.files['word/document.xml'] ? z.files['word/document.xml'].asText() : null;
if (!xml) {
  console.error('No word/document.xml in', docxPath);
  process.exit(1);
}
const outPath = path.join(path.dirname(docxPath), 'inspect-document.xml');
fs.writeFileSync(outPath, xml, 'utf8');
console.log('Wrote', outPath);
// Quick balance check: count w:p open vs close
const openP = (xml.match(/<w:p\s/g) || []).length;
const closeP = (xml.match(/<\/w:p>/g) || []).length;
const openR = (xml.match(/<w:r\s/g) || []).length;
const closeR = (xml.match(/<\/w:r>/g) || []).length;
console.log('Paragraphs: <w:p', openP, 'vs </w:p>', closeP);
console.log('Runs: <w:r', openR, 'vs </w:r>', closeR);
// Sample a run that we might have created (minimal run with just w:t)
const minimalRuns = xml.match(/<w:r><w:t>[^<]*<\/w:t><\/w:r>/g);
console.log('Minimal runs (no w:rPr):', minimalRuns ? minimalRuns.length : 0);
if (minimalRuns) console.log('Sample:', minimalRuns[0]);
