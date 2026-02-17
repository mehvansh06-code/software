/**
 * Generate Bank Import Payment .docx from Word templates (docxtpl-style placeholders).
 * Uses docxtemplater with {{ variable }} delimiters; context matches Python app.
 */
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const n2w = require('number-to-words');
const { BANK_PAYMENT_TEMPLATES, BANK_PAYMENT_TEMPLATES_DIR } = require('./config');

const CURRENCY_NAMES = {
  USD: 'Dollars',
  EUR: 'Euro',
  GBP: 'Pounds',
  JPY: 'Japanese Yen',
  CNY: 'Chinese Yuan',
};

/** Map company_choice from client (display name or GFPL/GTEX) to template key. */
function resolveCompanyKey(companyChoice) {
  if (!companyChoice || typeof companyChoice !== 'string') return null;
  const s = companyChoice.trim().toUpperCase();
  if (s === 'GFPL' || s.includes('GUJARAT') || s.includes('FLOTEX')) return 'GFPL';
  if (s === 'GTEX' || s.includes('GTEX')) return 'GTEX';
  return null;
}

/** Build amount in words (same logic as Python num2words). */
function amountInWords(amtVal, currCode) {
  const currName = CURRENCY_NAMES[currCode] || currCode;
  try {
    if (['JPY', 'CNY'].includes(currCode)) {
      const words = n2w.toWords(amtVal, { allowNegative: false });
      return words.charAt(0).toUpperCase() + words.slice(1) + ' ' + currName + ' Only';
    }
    const integerPart = Math.floor(amtVal);
    const decimalPart = Math.round((amtVal - integerPart) * 100);
    let words = n2w.toWords(integerPart, { allowNegative: false });
    words = words.charAt(0).toUpperCase() + words.slice(1);
    if (decimalPart > 0) {
      words += ' And ' + n2w.toWords(decimalPart).charAt(0).toUpperCase() + n2w.toWords(decimalPart).slice(1) + ' Cents';
    }
    return words + ' ' + currName + ' Only';
  } catch {
    return `${amtVal} ${currCode}`;
  }
}

/**
 * @param {object} data - Request body with template context fields (company_choice, invoice_no, etc.)
 * @returns {Promise<Buffer>}
 */
async function generateBankPaymentDocBuffer(data) {
  const companyKey = resolveCompanyKey(data.company_choice);
  if (!companyKey || !BANK_PAYMENT_TEMPLATES[companyKey]) {
    throw new Error('Invalid or missing company. Use GFPL or GTEX.');
  }

  // Use GFPL template for both companies (GTEX template has structural issues; document still shows correct company via company_choice)
  const templateName = BANK_PAYMENT_TEMPLATES.GFPL;
  const templatePath = path.join(BANK_PAYMENT_TEMPLATES_DIR, templateName);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templateName}. Place it in server/templates/bank-payment/`);
  }

  const rawAmount = data.raw_amount != null ? String(data.raw_amount).trim() : '';
  let amtVal = 0;
  if (rawAmount) {
    const n = parseFloat(rawAmount);
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
  const bankNameVal = empty(data.bank_name);
  const bankSwiftVal = empty(data.bank_swift);
  const bankAddressVal = empty(data.bank_address);
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
    return {
      description: desc,
      goods_desc: desc,
      hsn_code: hsn,
      quantity: qty,
      unit: u,
      quantity_and_unit: qtyAndUnit,
      amount: amt,
      invoice_no: invNo,
      invoice_date: invDate,
      term: termVal,
      currency: currCode,
      beneficiary_country: beneficiaryCountry,
      mode_shipment: modeShipmentVal,
      shipment_date: shipDate,
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
  const purposeVal = items.length > 1
    ? 'PAYMENT FOR PURCHASE OF ' + (goodsDesc || '').toUpperCase()
    : empty(data.purpose);

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
    quantity: quantityVal,
    beneficiary_name: beneficiaryName,
    beneficiary_address: beneficiaryAddress,
    beneficiary_country: beneficiaryCountry,
    beneficiary_account: beneficiaryAccount,
    bank_name: bankNameVal,
    bank_swift: bankSwiftVal,
    bank_address: bankAddressVal,
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
    bank_address: bankAddressVal,
    'bank_ address': bankAddressVal,
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

  // Template placeholders (from ZHEJIANG FUSHENGDA.docx): ensure every tag has a key so nothing renders "undefined"
  const TEMPLATE_TAGS = [
    'amount', 'amount_in_words', 'bank_name', 'bank_swift', 'beneficiary_account', 'beneficiary_address',
    'beneficiary_country', 'beneficiary_name', 'currency', 'date', 'document_list', 'goods_desc', 'hsn_code',
    'invoice_amount', 'invoice_date', 'invoice_no', 'mode_shipment', 'port_discharge', 'port_loading',
    'purpose', 'quantity', 'shipment_date', 'term',
  ];
  for (const tag of TEMPLATE_TAGS) {
    if (context[tag] === undefined || context[tag] === null) context[tag] = '';
  }

  // Ensure no placeholder renders as "undefined" (docxtemplater shows undefined literally)
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

  // Use single delimiters; normalize double braces (and split runs) so template parses
  const DELIMITERS = { start: '{', end: '}' };

  /** Return empty string for any missing/undefined tag so doc never shows "undefined". */
  const nullGetter = () => '';

  function loadAndNormalizeZip() {
    const content = fs.readFileSync(templatePath, 'binary');
    const z = new PizZip(content);
    const documentEntry = z.files['word/document.xml'];
    if (documentEntry) {
      let xml = documentEntry.asText();
      // 0) Escape literal "{" in body text that is not a placeholder (e.g. "{vide certificate")
      xml = xml.replace(/\{vide\s+certificate/gi, '\u200Bvide certificate');
      // 1) Literal "{{" and "}}" in one run -> single brace
      xml = xml.replace(/\{\{/g, '{').replace(/\}\}/g, '}');
      // 2) Merge split runs: run with "{", then any runs, then run with "{" -> keep first "{", empty second (same for "}")
      for (let i = 0; i < 50; i++) {
        const prev = xml;
        xml = xml.replace(/<w:t[^>]*>\{<\/w:t>\s*<\/w:r>\s*(<w:r[^>]*>)([\s\S]*?)<w:t[^>]*>\{<\/w:t>/g, '<w:t>{</w:t></w:r>$1$2<w:t></w:t>');
        // Match run ending with "}" or "} " (some templates have trailing space)
        xml = xml.replace(/<w:t[^>]*>\}\s*<\/w:t>\s*<\/w:r>\s*(<w:r[^>]*>)([\s\S]*?)<w:t[^>]*>\}\s*<\/w:t>/g, '<w:t>}</w:t></w:r>$1$2<w:t></w:t>');
        if (xml === prev) break;
      }
      z.file('word/document.xml', xml);
    }
    return z;
  }

  const zip = loadAndNormalizeZip();
  const doc = new Docxtemplater(zip, {
    delimiters: DELIMITERS,
    paragraphLoop: true,
    linebreaks: true,
    errorLogging: false,
    nullGetter,
  });

  function renderToBuffer(zipInstance, ctx) {
    const d = new Docxtemplater(zipInstance, {
      delimiters: DELIMITERS,
      paragraphLoop: true,
      linebreaks: true,
      errorLogging: false,
      nullGetter,
    });
    d.render(ctx);
    return d.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    });
  }

  try {
    doc.render(context);
  } catch (renderErr) {
    const isMultiOrTemplate = renderErr && (
      renderErr.name === 'MultiError' ||
      (renderErr.properties && renderErr.properties.id === 'multi_error') ||
      /Multi error|TemplateError/i.test(String(renderErr.message || ''))
    );
    if (isMultiOrTemplate && tableItems.length > 1) {
      const merged = {
        description: tableItems.map((i) => i.description).filter(Boolean).join(', ') || empty(data.goods_desc),
        goods_desc: tableItems.map((i) => i.description).filter(Boolean).join(', ') || empty(data.goods_desc),
        hsn_code: tableItems.map((i) => i.hsn_code).filter(Boolean).join(', ') || empty(data.hsn_code),
        quantity: tableItems.map((i) => i.quantity_and_unit).filter(Boolean).join(', ') || empty(data.quantity),
        quantity_and_unit: tableItems.map((i) => i.quantity_and_unit).filter(Boolean).join(', ') || empty(data.quantity),
        unit: tableItems[0].unit || 'KGS',
        amount: tableItems.reduce((s, i) => {
          const n = typeof i.amount === 'number' ? i.amount : parseFloat(String(i.amount).replace(/,/g, ''));
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
      const freshZip = loadAndNormalizeZip();
      return renderToBuffer(freshZip, fallbackContext);
    }
    throw renderErr;
  }

  return doc.getZip().generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
}

module.exports = {
  generateBankPaymentDocBuffer,
  resolveCompanyKey,
  amountInWords,
};
