const PizZip = require('pizzip');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '../templates/bank-payment/test-output');
const files = ['GTEX_multi_product.docx', 'GFPL_multi_product.docx', 'GFPL_single_product.docx'];
for (const name of files) {
  const p = path.join(dir, name);
  if (!fs.existsSync(p)) continue;
  const z = new PizZip(fs.readFileSync(p, 'binary'));
  const xml = z.files['word/document.xml'].asText();
  const openT = (xml.match(/<w:t[\s>]/g) || []).length;
  const closeT = (xml.match(/<\/w:t>/g) || []).length;
  console.log(name, 'w:t open', openT, 'close', closeT, openT === closeT ? 'OK' : 'IMBALANCE');
}
