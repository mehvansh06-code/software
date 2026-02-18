/**
 * Rebuild Bank Payment .docx templates programmatically so placeholders
 * are never split (one TextRun per placeholder). Uses the docx library.
 *
 * Run: node server/templates/bank-payment/rebuild-templates.js
 */
const fs = require('fs');
const path = require('path');
const xml2js = require('xml-js');
const PizZip = require('pizzip');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
} = require('docx');

const PLACEHOLDER_REGEX = /(\{\s*[a-zA-Z0-9_]+\s*\})/g;
const TEMPLATES_DIR = path.join(__dirname);
const OUTPUT_DIR = TEMPLATES_DIR;

function getTextFromRun(run) {
  if (!run.elements) return '';
  const t = run.elements.find((e) => e.name === 'w:t');
  if (!t || !t.elements) return '';
  return t.elements.filter((e) => e.type === 'text').map((e) => e.text).join('');
}

function getParagraphText(pEl) {
  if (!pEl.elements) return '';
  const runs = pEl.elements.filter((e) => e.name === 'w:r');
  return runs.map(getTextFromRun).join('');
}

/** Split text into segments: plain text and placeholders (each placeholder is one segment). */
function splitSegments(text) {
  if (!text || typeof text !== 'string') return [''];
  const parts = text.split(PLACEHOLDER_REGEX);
  return parts.filter((p) => p.length > 0);
}

function extractParagraphBlock(pEl) {
  const text = getParagraphText(pEl);
  return { type: 'paragraph', segments: splitSegments(text) };
}

function extractTableCellContent(tcEl) {
  const paragraphs = (tcEl.elements || []).filter((e) => e.name === 'w:p');
  const texts = paragraphs.map(getParagraphText);
  const fullText = texts.join('\n');
  return splitSegments(fullText);
}

function extractTableBlock(tblEl) {
  const rows = (tblEl.elements || []).filter((e) => e.name === 'w:tr');
  const rowCells = rows.map((tr) => {
    const cells = (tr.elements || []).filter((e) => e.name === 'w:tc');
    return cells.map(extractTableCellContent);
  });
  return { type: 'table', rows: rowCells };
}

function extractBodyBlocks(documentXml) {
  const js = xml2js.xml2js(documentXml, { compact: false, ignoreComment: true });
  const body = js.elements[0].elements.find((e) => e.name === 'w:body');
  if (!body || !body.elements) return [];
  const blocks = [];
  for (const el of body.elements) {
    if (el.name === 'w:p') {
      blocks.push(extractParagraphBlock(el));
    } else if (el.name === 'w:tbl') {
      blocks.push(extractTableBlock(el));
    }
  }
  return blocks;
}

function segmentsToParagraphChildren(segments) {
  return segments.map((s) => new TextRun(s));
}

function buildDocxFromBlocks(blocks) {
  const children = [];
  for (const block of blocks) {
    if (block.type === 'paragraph') {
      const runs = segmentsToParagraphChildren(block.segments);
      if (runs.length === 0) {
        children.push(new Paragraph({ children: [new TextRun('')] }));
      } else {
        children.push(new Paragraph({ children: runs }));
      }
    } else if (block.type === 'table') {
      const rows = block.rows.map((cellSegments) =>
        new TableRow({
          children: cellSegments.map((segments) =>
            new TableCell({
              children: [
                new Paragraph({
                  children: segmentsToParagraphChildren(segments),
                }),
              ],
            }),
          ),
        }),
      );
      children.push(
        new Table({
          rows,
          width: { size: 100, type: WidthType.PERCENTAGE },
        }),
      );
    }
  }
  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });
  return doc;
}

function readDocumentXmlFromDocx(docxPath) {
  const content = fs.readFileSync(docxPath, 'binary');
  const zip = new PizZip(content);
  const entry = zip.files['word/document.xml'];
  if (!entry) throw new Error('word/document.xml not found in ' + docxPath);
  return entry.asText();
}

async function main() {
  const templates = [
    { name: 'ZHEJIANG FUSHENGDA.docx' },
    { name: 'templategtex.docx' },
  ];

  for (const t of templates) {
    const docxPath = path.join(TEMPLATES_DIR, t.name);

    if (!fs.existsSync(docxPath)) {
      console.warn('Skip (template not found):', t.name);
      continue;
    }

    const documentXml = readDocumentXmlFromDocx(docxPath);
    const blocks = extractBodyBlocks(documentXml);
    console.log(t.name, ':', blocks.length, 'blocks (paragraphs + tables)');

    const doc = buildDocxFromBlocks(blocks);
    const buffer = await Packer.toBuffer(doc);

    const backupPath = path.join(TEMPLATES_DIR, t.name + '.backup');
    if (fs.existsSync(docxPath)) {
      fs.copyFileSync(docxPath, backupPath);
      console.log('Backed up to', path.basename(backupPath));
    }
    fs.writeFileSync(docxPath, buffer);
    console.log('Written:', docxPath);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
