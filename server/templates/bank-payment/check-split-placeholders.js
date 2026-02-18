/**
 * Check word/document.xml for placeholders like {invoice_no} that are split
 * across multiple <w:r> runs with <w:proofErr> in between.
 */
const fs = require('fs');
const path = require('path');

function getTextContentOfRun(runXml) {
  const match = runXml.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/);
  return match ? match[1] : '';
}

function findSplitPlaceholders(xml) {
  const runRegex = /<w:r[\s>][\s\S]*?<\/w:r>/g;
  const runs = [];
  let runMatch;
  while ((runMatch = runRegex.exec(xml)) !== null) {
    runs.push({
      start: runMatch.index,
      end: runMatch.index + runMatch[0].length,
      text: getTextContentOfRun(runMatch[0]),
    });
  }

  const proofErrRegex = /<w:proofErr[^>]*\/?>/g;
  const proofErrs = [];
  let peMatch;
  while ((peMatch = proofErrRegex.exec(xml)) !== null) {
    proofErrs.push({ start: peMatch.index, end: peMatch.index + peMatch[0].length });
  }

  // Build logical text: concatenate all run texts in order. Track cumulative offset per run.
  let logicalIndex = 0;
  const runLogicalStart = [];
  for (const r of runs) {
    runLogicalStart.push(logicalIndex);
    logicalIndex += r.text.length;
  }
  const fullText = runs.map((r) => r.text).join('');

  // Find all placeholders in the reconstructed full text (with their character spans).
  // Word often uses spaces: { date }, { beneficiary_name }, etc.
  const placeholders = [];
  const re = /\{\s*[a-zA-Z0-9_]+\s*\}/g;
  let phMatch;
  while ((phMatch = re.exec(fullText)) !== null) {
    placeholders.push({ name: phMatch[0], start: phMatch.index, end: phMatch.index + phMatch[0].length });
  }

  // For each proofErr, find the run that ends immediately before it. The split boundary in logical text
  // is the start of the next run (the one that starts after the proofErr).
  const splitBoundaries = new Set();
  for (const pe of proofErrs) {
    let runIndexBefore = -1;
    for (let i = 0; i < runs.length; i++) {
      if (runs[i].end <= pe.start) runIndexBefore = i;
    }
    const runIndexAfter = runIndexBefore + 1;
    if (runIndexAfter < runs.length) {
      splitBoundaries.add(runLogicalStart[runIndexAfter]);
    }
  }

  // A placeholder is split if any split boundary falls strictly inside it
  const splitPlaceholders = new Set();
  for (const ph of placeholders) {
    for (const boundary of splitBoundaries) {
      if (boundary > ph.start && boundary < ph.end) {
        splitPlaceholders.add(ph.name);
        break;
      }
    }
  }

  const allNames = [...new Set(placeholders.map((p) => p.name))];
  return {
    split: Array.from(splitPlaceholders),
    allPlaceholders: allNames,
    proofErrCount: proofErrs.length,
    message: proofErrs.length === 0 ? 'No <w:proofErr> tags found.' : null,
  };
}

const dirs = [
  { name: 'ZHEJIANG FUSHENGDA.docx', path: path.join(__dirname, '_extract_fushengda', 'word', 'document.xml') },
  { name: 'templategtex.docx', path: path.join(__dirname, '_extract_gtex', 'word', 'document.xml') },
];

for (const { name, path: docPath } of dirs) {
  if (!fs.existsSync(docPath)) {
    console.log('\n' + name + ': (file not extracted - run extraction first)');
    continue;
  }
  const xml = fs.readFileSync(docPath, 'utf8');
  const result = findSplitPlaceholders(xml);
  console.log('\n=== ' + name + ' ===');
  console.log('  <w:proofErr> count: ' + (result.proofErrCount ?? 'N/A'));
  console.log('  All placeholders found in document: ' + result.allPlaceholders.length);
  if (result.split && result.split.length > 0) {
    console.log('  BROKEN/SPLIT placeholders (placeholder text split across runs with proofErr):');
    result.split.forEach((p) => console.log('    - ' + p));
  } else {
    console.log('  Broken/split placeholders: None detected.');
  }
  if (result.message) console.log('  Note: ' + result.message);
}
