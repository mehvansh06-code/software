/**
 * Create a minimal .docx with exactly 10 placeholders from README.txt, each in a single run.
 * Tag names match server/templates/bank-payment/README.txt exactly.
 * Used to verify docxtemplater works without Word split-run or corruption issues.
 */
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

const OUT_DIR = path.join(__dirname, '../templates/bank-payment');
const TEMPLATE_NAME = 'test-10-placeholders.docx';

/** 10 placeholder tags from README.txt (exact spelling and underscores) */
const PLACEHOLDERS = [
  'date',
  'beneficiary_name',
  'beneficiary_address',
  'beneficiary_country',
  'beneficiary_account',
  'bank_name',
  'bank_swift',
  'invoice_no',
  'amount',
  'amount_in_words',
];

/** 14 tags from the one-page GFPL remittance form (single run each = no merge needed) */
const GFPL_14_TAGS = [
  'currency_and_amount',
  'beneficiary_name',
  'beneficiary_address',
  'beneficiary_country',
  'iban',
  'beneficiary_account',
  'bank_swift',
  'bank_name',
  'bank_address',
  'purpose',
  'port_loading',
  'port_discharge',
  'hsn_code',
  'document_list',
];

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const WORD_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>
`;

function buildDocumentXml(tagList = PLACEHOLDERS) {
  const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const paras = tagList.map(
    (tag) => `<w:p xmlns:w="${ns}"><w:r><w:t>${tag}: {${tag}}</w:t></w:r></w:p>`
  );
  const body = paras.join('\n    ') +
    '\n    <w:sectPr xmlns:w="' + ns + '"><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${ns}">
  <w:body>
    ${body}
  </w:body>
</w:document>`;
}

function createMinimalDocx(use14Tags = false) {
  const zip = new PizZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.file('_rels/.rels', RELS);
  zip.file('word/_rels/document.xml.rels', WORD_RELS);
  zip.file('word/document.xml', buildDocumentXml(use14Tags ? GFPL_14_TAGS : PLACEHOLDERS));
  const buffer = zip.generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  const filePath = path.join(OUT_DIR, use14Tags ? 'test-14-gfpl-tags.docx' : TEMPLATE_NAME);
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

if (require.main === module) {
  const filePath = createMinimalDocx();
  console.log('Created:', filePath);
  console.log('Placeholders:', PLACEHOLDERS.join(', '));
}

module.exports = { createMinimalDocx, buildDocumentXml, TEMPLATE_NAME, OUT_DIR, PLACEHOLDERS, GFPL_14_TAGS };
