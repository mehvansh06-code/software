/**
 * Generate Bank Import Payment .docx from Word templates.
 * Uses docxtemplater with { variable } single-brace delimiters.
 * Merges split placeholders (Word runs) so tags are filled; only {vide certificate fix applied, no brace-collapse.
 */

const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const n2w = require('number-to-words');
const { BANK_PAYMENT_TEMPLATES, BANK_PAYMENT_TEMPLATES_DIR } = require('./config');

const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'CNY']);

function toTitleWords(input) {
  return String(input || '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/** Trim template tag names like "{ beneficiary_name }" so they resolve correctly. */
function normalizeTemplateTagName(tag) {
  return String(tag || '')
    .replace(/\u00A0/g, ' ')
    .trim()
    .replace(/\s*_\s*/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_');
}

function tagParser(tag) {
  const key = normalizeTemplateTagName(tag);
  return {
    get(scope) {
      if (!scope || key === '') return '';
      if (scope[key] != null) return scope[key];
      const lower = key.toLowerCase();
      if (scope[lower] != null) return scope[lower];
      const upper = key.toUpperCase();
      if (scope[upper] != null) return scope[upper];
      return '';
    },
  };
}

/** Map company_choice from client (display name or GFPL/GTEX) to template key. */
function resolveCompanyKey(companyChoice) {
  if (!companyChoice || typeof companyChoice !== 'string') return null;
  const s = companyChoice.trim().toUpperCase();
  if (s === 'GFPL' || s.includes('GUJARAT') || s.includes('FLOTEX')) return 'GFPL';
  if (s === 'GTEX' || s.includes('GTEX')) return 'GTEX';
  return null;
}

/** Build amount in words. */
function amountInWords(amtVal, currCode) {
  const code = String(currCode || 'USD').trim().toUpperCase() || 'USD';
  try {
    const raw = Number(amtVal);
    if (!Number.isFinite(raw) || raw < 0) return `${code} ${amtVal}`;

    let integerPart = Math.floor(raw);
    let decimalPart = Math.round((raw - integerPart) * 100);

    // Guard floating-point edge cases, e.g. 10.999999 -> 11.00
    if (decimalPart >= 100) {
      integerPart += 1;
      decimalPart = 0;
    }

    const integerWords = toTitleWords(n2w.toWords(integerPart));

    // Requested format: "USD Six Hundred Seventy Eight Only"
    if (ZERO_DECIMAL_CURRENCIES.has(code) || decimalPart === 0) {
      return `${code} ${integerWords} Only`;
    }

    // Requested format for cents: "USD Five Hundred And Cents Ninety Eight Only"
    const centsWords = toTitleWords(n2w.toWords(decimalPart));
    return `${code} ${integerWords} And Cents ${centsWords} Only`;
  } catch {
    return `${code} ${amtVal}`;
  }
}

/**
 * @param {object} data - Request body with template context fields
 * @returns {Promise<Buffer>}
 */
async function generateBankPaymentDocBuffer(data) {
  const companyKey = resolveCompanyKey(data.company_choice);
  if (!companyKey || !BANK_PAYMENT_TEMPLATES[companyKey]) {
    throw new Error('Invalid or missing company. Use GFPL or GTEX.');
  }

  // Each company uses its own correct template
  const templateName = BANK_PAYMENT_TEMPLATES[companyKey];
  const templatePath = path.join(BANK_PAYMENT_TEMPLATES_DIR, templateName);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templateName}. Place it in server/templates/bank-payment/`);
  }

  const rawAmount = data.raw_amount != null ? String(data.raw_amount).trim() : '';
  let amtVal = 0;
  if (rawAmount) {
    const n = Number(rawAmount.replace(/,/g, ''));
    if (Number.isNaN(n) || n <= 0) throw new Error('Remittance amount must be a number greater than 0.');
    amtVal = n;
  }

  const currCode = (data.currency || '').trim() || 'USD';
  const amtWords = amountInWords(amtVal, currCode);
  const amountFormatted = amtVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const invoiceAmount = (data.invoice_amount && String(data.invoice_amount).trim()) || amountFormatted;

  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const dateStr = `${dd}-${mm}-${yyyy}`;

  const empty = (v) => {
    if (v == null) return '';
    const s = String(v).trim();
    if (s === '' || s === 'undefined' || s === 'null') return '';
    return s;
  };

  const companyLabel = data.company_choice || (companyKey === 'GFPL' ? 'Gujarat Flotex Pvt Ltd' : 'GTEX Fabrics');
  const dateVal = data.date || dateStr;
  const invNo = empty(data.invoice_no);
  const invDate = empty(data.invoice_date);
  const shipDate = empty(data.shipment_date);
  const beneficiaryName = empty(data.beneficiary_name);
  const beneficiaryAddress = empty(data.beneficiary_address);
  const beneficiaryCountry = empty(data.beneficiary_country);
  const beneficiaryAccount = empty(data.beneficiary_account);
  const ibanVal = empty(data.iban || data.beneficiary_iban);
  const bankNameVal = empty(data.bank_name);
  const bankSwiftVal = empty(data.bank_swift);
  const bankAddressVal = empty(data.bank_address);
  const intermediaryBankNameVal = empty(data.intermediary_bank_name);
  const intermediaryBankSwiftVal = empty(data.intermediary_bank_swift);
  const intermediaryBankAddressVal = empty(data.intermediary_bank_address);
  const intermediaryBankCountryVal = empty(data.intermediary_bank_country);
  const portLoadingVal = empty(data.port_loading);
  const portDischargeVal = empty(data.port_discharge);
  const termVal = empty(data.term);
  const modeShipmentVal = empty(data.mode_shipment);
  const documentListVal = empty(data.document_list);

  let items = Array.isArray(data.items) && data.items.length > 0 ? data.items : null;
  if (!items) {
    const g = empty(data.goods_desc);
    const h = empty(data.hsn_code);
    const q = empty(data.quantity);
    const qParts = q ? q.split(/\s+/).filter(Boolean) : [];
    const qtyStr = qParts[0] || '';
    const unitStr = qParts.slice(1).join(' ') || 'KGS';
    const amtStr = (data.invoice_amount != null && String(data.invoice_amount).trim()) ? String(data.invoice_amount).trim() : amountFormatted;
    items = [{ description: g, goods_desc: g, hsn_code: h, quantity: qtyStr, unit: unitStr, quantity_and_unit: q || `${qtyStr} ${unitStr}`, amount: amtStr }];
  }

  const formatItemAmount = (val) => {
    if (val == null || val === '') return '0.00';
    const n = typeof val === 'number' ? val : parseFloat(String(val).replace(/,/g, ''));
    return Number.isNaN(n) ? String(val) : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const tableItems = items.map((it) => {
    const desc = empty(it.description || it.goods_desc);
    const hsn = empty(it.hsn_code);
    const qty = it.quantity != null ? String(it.quantity) : '';
    const u = empty(it.unit) || 'KGS';
    const qtyAndUnit = it.quantity_and_unit || (qty && u ? `${qty} ${u}` : empty(data.quantity));
    const amt = formatItemAmount(it.amount);
    const rowInvNo = empty(it.invoice_no) || invNo;
    const rowInvDate = empty(it.invoice_date) || invDate;
    const rowShipmentDate = empty(it.shipment_date) || shipDate;
    const rowTerm = empty(it.term) || termVal;
    const rowMode = empty(it.mode_shipment) || modeShipmentVal;
    return {
      description: desc,
      goods_desc: desc,
      hsn_code: hsn,
      quantity: qty,
      unit: u,
      quantity_and_unit: qtyAndUnit,
      amount: amt,
      invoice_amount: invoiceAmount,
      invoice_value: invoiceAmount,
      invoice_no: rowInvNo,
      invoice_date: rowInvDate,
      term: rowTerm,
      currency: currCode,
      beneficiary_country: beneficiaryCountry,
      mode_shipment: rowMode,
      shipment_date: rowShipmentDate,
    };
  });

  const goodsDesc = items.length > 1
    ? items.map((it) => empty(it.description || it.goods_desc)).filter(Boolean).join(', ')
    : empty(data.goods_desc);
  const hsnCodeVal = items.length > 1
    ? items.map((it) => empty(it.hsn_code)).filter(Boolean).join(', ')
    : empty(data.hsn_code);
  const quantityVal = items.length > 1
    ? tableItems.map((it) => it.quantity_and_unit).filter(Boolean).join(', ')
    : empty(data.quantity);
  const purposeVal = empty(data.purpose) || (items.length > 1
    ? 'PAYMENT FOR PURCHASE OF ' + (goodsDesc || '').toUpperCase()
    : '');

  const context = {
    company_choice: companyLabel,
    date: dateVal,
    Date: dateVal,
    invoice_no: invNo,
    invoice_date: invDate,
    shipment_date: shipDate,
    currency: currCode,
    Currency: currCode,
    amount: amountFormatted,
    Amount: amountFormatted,
    raw_amount: rawAmount,
    amount_in_words: amtWords,
    invoice_amount: invoiceAmount,
    invoice_value: invoiceAmount,
    total_invoice_value: invoiceAmount,
    invoice_total: invoiceAmount,
    INVOICE_AMOUNT: invoiceAmount,
    INVOICE_VALUE: invoiceAmount,
    TOTAL_INVOICE_VALUE: invoiceAmount,
    quantity: quantityVal,
    beneficiary_name: beneficiaryName,
    beneficiary_address: beneficiaryAddress,
    beneficiary_country: beneficiaryCountry,
    beneficiary_account: beneficiaryAccount,
    iban: ibanVal,
    IBAN: ibanVal,
    beneficiary_iban: ibanVal,
    bank_name: bankNameVal,
    bank_swift: bankSwiftVal,
    bank_address: bankAddressVal,
    intermediary_bank_name: intermediaryBankNameVal,
    intermediary_bank_swift: intermediaryBankSwiftVal,
    intermediary_bank_address: intermediaryBankAddressVal,
    intermediary_bank_country: intermediaryBankCountryVal,
    port_loading: portLoadingVal,
    port_discharge: portDischargeVal,
    purpose: purposeVal,
    goods_desc: goodsDesc,
    hsn_code: hsnCodeVal,
    term: termVal,
    mode_shipment: modeShipmentVal,
    document_list: documentListVal,
    name: beneficiaryName,
    Name: beneficiaryName,
    NAME: beneficiaryName,
    address: beneficiaryAddress,
    Address: beneficiaryAddress,
    ADDRESS: beneficiaryAddress,
    country: beneficiaryCountry,
    Country: beneficiaryCountry,
    COUNTRY: beneficiaryCountry,
    account: beneficiaryAccount,
    Account: beneficiaryAccount,
    swift: bankSwiftVal,
    SWIFT: bankSwiftVal,
    bank_country: beneficiaryCountry,
    'Bank Name': bankNameVal,
    'NAME OF BANK': bankNameVal,
    'Bank Address': bankAddressVal,
    'Port of Loading': portLoadingVal,
    port_of_loading: portLoadingVal,
    PORT_OF_LOADING: portLoadingVal,
    'Port of Discharge': portDischargeVal,
    port_of_discharge: portDischargeVal,
    PORT_OF_DISCHARGE: portDischargeVal,
    'Purpose of Remittance': purposeVal,
    PURPOSE: purposeVal,
    'HSN Code': hsnCodeVal,
    HSN_CODE: hsnCodeVal,
    'Documents Enclosed': documentListVal,
    DOCUMENTS_ENCLOSED: documentListVal,
    currency_and_amount: `${currCode} ${amountFormatted}`,
    currency_and_amount_in_words: amtWords,
    items: tableItems,
  };

  // Ensure every expected tag has a value so nothing renders as blank or "undefined"
  const TEMPLATE_TAGS = [
    'amount', 'amount_in_words', 'bank_name', 'bank_swift', 'beneficiary_account', 'beneficiary_address',
    'beneficiary_country', 'beneficiary_name', 'iban', 'intermediary_bank_name', 'intermediary_bank_swift',
    'intermediary_bank_address', 'intermediary_bank_country', 'currency', 'date', 'document_list', 'goods_desc',
    'hsn_code', 'invoice_amount', 'invoice_value', 'total_invoice_value', 'invoice_date', 'invoice_no', 'mode_shipment', 'port_discharge', 'port_loading',
    'purpose', 'quantity', 'shipment_date', 'term',
  ];
  for (const tag of TEMPLATE_TAGS) {
    if (context[tag] === undefined || context[tag] === null) context[tag] = '';
  }

  // Clean up any remaining undefined/null values
  for (const k of Object.keys(context)) {
    if (context[k] === undefined || context[k] === null) context[k] = '';
    else if (typeof context[k] === 'string' && (context[k] === 'undefined' || context[k] === 'null')) context[k] = '';
  }
  if (Array.isArray(context.items)) {
    context.items = context.items.map((row) => {
      const r = {};
      for (const key of Object.keys(row)) {
        const val = row[key];
        r[key] = (val === undefined || val === null || val === 'undefined' || val === 'null') ? '' : (typeof val === 'string' ? val : String(val));
      }
      return r;
    });
  }

  const DELIMITERS = { start: '{', end: '}' };

  /** Return empty string for any missing tag so doc never shows "undefined". */
  const nullGetter = () => '';

  /** Escape tag name for use inside XML (only for merged run output). */
  function escapeXml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /** Remove XML 1.0 invalid control chars from tag name to avoid Word "file error". */
  function sanitizeTagName(s) {
    return String(s).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  }

  /** Extract plain text from a run's XML (strips all tags, keeps w:t content). */
  function getRunText(runsXml) {
    return runsXml.replace(/<w:t[^>]*>([^<]*)<\/w:t>/gi, '$1').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  }

  /** Extract <w:rPr>...</w:rPr> from a run XML if present (keeps font styling on merged run). */
  function getRunRPr(runXml) {
    const m = runXml.match(/<w:rPr[^>]*>[\s\S]*?<\/w:rPr>/);
    return m ? m[0] : '';
  }

  /**
   * Within one paragraph XML, merge each SPLIT placeholder into a single run.
   * Word often splits { tag } across multiple runs; docxtemplater only fills tags in a single run.
   * Uses [^}<]* after { so a run containing full { tag } is NOT treated as "open" (avoids corrupting valid tags).
   */
  function mergePlaceholdersInParagraph(paraContent) {
    // Match within a single run only (do not cross into next <w:r>), otherwise adjacent tags can be merged incorrectly.
    const runWithOpen = /<w:r[^>]*>(?:(?!<\/w:r>)[\s\S])*?<w:t[^>]*>[^<]*\{[^}<]*<\/w:t>\s*<\/w:r>/;
    const runWithClose = /<w:r[^>]*>(?:(?!<\/w:r>)[\s\S])*?<w:t[^>]*>[^<]*\}[^<]*<\/w:t>\s*<\/w:r>/;
    let out = '';
    let i = 0;
    while (i < paraContent.length) {
      const rest = paraContent.slice(i);
      const openMatch = rest.match(runWithOpen);
      if (!openMatch) {
        out += paraContent[i];
        i++;
        continue;
      }
      out += rest.slice(0, openMatch.index);
      const afterOpen = rest.slice(openMatch.index + openMatch[0].length);
      const closeMatch = afterOpen.match(runWithClose);
      if (!closeMatch) {
        out += openMatch[0];
        i += openMatch.index + openMatch[0].length;
        continue;
      }
      const middle = afterOpen.slice(0, closeMatch.index);
      const textOpen = getRunText(openMatch[0]);
      const textMiddle = getRunText(middle);
      const textClose = getRunText(closeMatch[0]);
      const fullTag = (textOpen + ' ' + textMiddle + ' ' + textClose).replace(/\s+/g, ' ').trim();
      const tagMatch = fullTag.match(/\{\s*([^}]+)\}/);
      const tagName = tagMatch ? tagMatch[1].trim() : '';
      if (!tagName) {
        out += openMatch[0] + middle + closeMatch[0];
      } else {
        // Normalize normal placeholders and loop tags (#items, /items) into single-run tags.
        const normalizedTag = tagName.startsWith('#') || tagName.startsWith('/')
          ? tagName.replace(/\s+/g, '')
          : normalizeTemplateTagName(tagName);
        const rPr = getRunRPr(openMatch[0]);
        const safe = sanitizeTagName(normalizedTag || tagName);
        out += '<w:r>' + rPr + '<w:t>{' + escapeXml(safe) + '}</w:t></w:r>';
      }
      i += openMatch.index + openMatch[0].length + closeMatch.index + closeMatch[0].length;
    }
    return out;
  }

  /** When true, skip merge/collapse so output opens in Word (template must have each placeholder in one run). */
  const skipMerge = process.env.BANK_PAYMENT_SKIP_MERGE === '1' || data.skip_merge_placeholders === true;

  /** Load template; fix {vide and double-brace; merge split placeholders only when merge is enabled. */
  function loadTemplateZip(skipPlaceholderMerge = skipMerge) {
    const content = fs.readFileSync(templatePath, 'binary');
    const z = new PizZip(content);
    const documentEntry = z.files['word/document.xml'];
    if (documentEntry) {
      let xml = documentEntry.asText();
      xml = xml.replace(/\{vide\s+certificate/gi, '\u200Bvide certificate');
      xml = xml.replace(/\{\{/g, '{').replace(/\}\}/g, '}');

      if (!skipPlaceholderMerge) {
        for (let i = 0; i < 50; i++) {
          const prev = xml;
          xml = xml.replace(/<w:t[^>]*>\{<\/w:t>\s*<\/w:r>\s*(<w:r[^>]*>)([\s\S]*?)<w:t[^>]*>\{<\/w:t>/g, '<w:t>{</w:t></w:r>$1$2<w:t></w:t>');
          xml = xml.replace(/<w:t[^>]*>\}\s*<\/w:t>\s*<\/w:r>\s*(<w:r[^>]*>)([\s\S]*?)<w:t[^>]*>\}\s*<\/w:t>/g, '<w:t>}</w:t></w:r>$1$2<w:t></w:t>');
          if (xml === prev) break;
        }
        const paraRegex = /<w:p\s*([^>]*)>([\s\S]*?)<\/w:p>/g;
        xml = xml.replace(paraRegex, (_, attrs, paraContent) => {
          return '<w:p' + attrs + '>' + mergePlaceholdersInParagraph(paraContent) + '</w:p>';
        });
      }
      z.file('word/document.xml', xml);
    }
    return z;
  }

  function createDoc(zipInstance) {
    return new Docxtemplater(zipInstance, {
      delimiters: DELIMITERS,
      paragraphLoop: true,
      linebreaks: true,
      errorLogging: false,
      parser: tagParser,
      nullGetter,
    });
  }

  function renderToBuffer(zipInstance, ctx) {
    const d = createDoc(zipInstance);
    d.render(ctx);
    return d.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
  }

  let zip = loadTemplateZip(skipMerge);
  let doc;
  let effectiveSkipMerge = skipMerge;
  try {
    doc = createDoc(zip);
  } catch (compileErr) {
    if (skipMerge) throw compileErr;
    // Fallback: if merge introduces malformed tags for this template, retry without merge.
    effectiveSkipMerge = true;
    zip = loadTemplateZip(true);
    doc = createDoc(zip);
  }

  let zipOut;
  try {
    // FIX: Pass context directly — docxtemplater handles XML encoding internally.
    // Do NOT pre-escape values; docxtemplater handles XML encoding
    // (e.g. "Smith & Sons" would become "Smith &amp;amp; Sons" in the output).
    doc.render(context);
    zipOut = doc.getZip();

    // NOTE: Do NOT attempt to "balance" paragraph tags here.
    // Docxtemplater legitimately changes </w:p> counts when processing loops.
    // Deleting closing paragraph tags from the end of the document breaks the file.

  } catch (renderErr) {
    const isMultiOrTemplate = renderErr && (
      renderErr.name === 'MultiError' ||
      (renderErr.properties && renderErr.properties.id === 'multi_error') ||
      /Multi error|TemplateError/i.test(String(renderErr.message || ''))
    );
    const isMultiAllocationRun = Array.isArray(data.allocations) && data.allocations.length > 1;
    if (isMultiOrTemplate && tableItems.length > 1 && !isMultiAllocationRun) {
      // Fallback: collapse multiple product lines into one row and retry
      const merged = {
        description: tableItems.map((it) => it.description).filter(Boolean).join(', ') || empty(data.goods_desc),
        goods_desc: tableItems.map((it) => it.description).filter(Boolean).join(', ') || empty(data.goods_desc),
        hsn_code: tableItems.map((it) => it.hsn_code).filter(Boolean).join(', ') || empty(data.hsn_code),
        quantity: tableItems.map((it) => it.quantity_and_unit).filter(Boolean).join(', ') || empty(data.quantity),
        quantity_and_unit: tableItems.map((it) => it.quantity_and_unit).filter(Boolean).join(', ') || empty(data.quantity),
        unit: tableItems[0].unit || 'KGS',
        amount: tableItems.reduce((s, it) => {
          const n = typeof it.amount === 'number' ? it.amount : parseFloat(String(it.amount).replace(/,/g, ''));
          return s + (Number.isNaN(n) ? 0 : n);
        }, 0),
        invoice_no: invNo,
        invoice_date: invDate,
        term: termVal,
        currency: currCode,
        beneficiary_country: beneficiaryCountry,
        mode_shipment: modeShipmentVal,
        shipment_date: shipDate,
      };
      const singleItemAmount = formatItemAmount(merged.amount);
      const fallbackContext = {
        ...context,
        items: [{ ...merged, amount: singleItemAmount }],
      };
      const freshZip = loadTemplateZip(effectiveSkipMerge);
      return renderToBuffer(freshZip, fallbackContext);
    }
    throw renderErr;
  }

  return (zipOut || doc.getZip()).generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

module.exports = {
  generateBankPaymentDocBuffer,
  resolveCompanyKey,
  amountInWords,
};
