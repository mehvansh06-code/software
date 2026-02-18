/**
 * Validate document.xml from a docx: check tag balance (every open tag has a close).
 * Run: node server/scripts/validate-docx-xml.js path/to/file.docx
 */
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

const docxPath = process.argv[2];
if (!docxPath || !fs.existsSync(docxPath)) {
  console.error('Usage: node validate-docx-xml.js <path-to-docx>');
  process.exit(1);
}

const content = fs.readFileSync(docxPath, 'binary');
const z = new PizZip(content);
const xml = z.files['word/document.xml'] ? z.files['word/document.xml'].asText() : null;
if (!xml) {
  console.error('No word/document.xml');
  process.exit(1);
}

// Count open vs close for critical tags
const tags = ['w:p', 'w:r', 'w:t', 'w:tc', 'w:tr', 'w:tbl', 'w:rPr', 'w:tblPr', 'w:proofErr'];
const results = {};
for (const tag of tags) {
  const open = (xml.match(new RegExp('<' + tag.replace(':', '\\:') + '[\\s/>]', 'g')) || []).length;
  const selfClose = (xml.match(new RegExp('<' + tag.replace(':', '\\:') + '[^>]*/>', 'g')) || []).length;
  const close = (xml.match(new RegExp('</' + tag.replace(':', '\\:') + '>', 'g')) || []).length;
  // w:proofErr is self-closing
  const opens = open; // opening tags (including self-closing for proofErr)
  results[tag] = { open: opens, selfClose, close };
}
console.log('Tag counts (open/selfClose/close):', JSON.stringify(results, null, 2));

// Check for obvious broken XML: unescaped & in text
const badAmp = xml.match(/<w:t[^>]*>[^<]*&(?!amp;|lt;|gt;|quot;|apos;)[^<]*<\/w:t>/g);
if (badAmp && badAmp.length) {
  console.log('Possible unescaped & in w:t:', badAmp.length, badAmp[0].slice(0, 80));
}

// Try to parse as XML with a simple stack (only w: tags)
const openTagRe = /<(w:[\w]+)(?:\s[^>]*)?(?:\/>|>)/g;
const closeTagRe = /<\/(w:[\w]+)>/g;
let match;
const stack = [];
const openTagOnlyRe = /<(w:[\w]+)(?:\s[^>]*)?>/g;
while ((match = openTagOnlyRe.exec(xml)) !== null) {
  const full = match[0];
  if (full.endsWith('/>')) continue; // self-closing
  stack.push(match[1]);
}
let closeMatch;
const closeTagOnlyRe = /<\/(w:[\w]+)>/g;
while ((closeMatch = closeTagOnlyRe.exec(xml)) !== null) {
  const tag = closeMatch[1];
  if (stack.length && stack[stack.length - 1] === tag) {
    stack.pop();
  } else {
    console.log('Unmatched close tag or wrong order:', tag, 'at position', closeMatch.index);
  }
}
if (stack.length) {
  console.log('Unclosed tags at end:', stack.slice(-20));
} else {
  console.log('Tag stack balanced (open/close).');
}
