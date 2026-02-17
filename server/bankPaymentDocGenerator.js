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

  const templateName = BANK_PAYMENT_TEMPLATES[companyKey];
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

  const empty = (v) => (v != null && String(v).trim() !== '' ? String(v).trim() : '');
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

  const content = fs.readFileSync(templatePath, 'binary');
  const zip = new PizZip(content);
  const documentEntry = zip.files['word/document.xml'];
  if (documentEntry) {
    let xml = documentEntry.asText();
    for (let i = 0; i < 20; i++) {
      const prev = xml;
      xml = xml.replace(/\{\{/g, '{').replace(/\}\}/g, '}');
      xml = xml.replace(/<w:t[^>]*>\{<\/w:t><\/w:r>(<w:r[^>]*>)([\s\S]*?)<w:t[^>]*>\{<\/w:t>/g, '<w:t>{</w:t></w:r>$1$2<w:t></w:t>');
      xml = xml.replace(/<w:t[^>]*>\}<\/w:t><\/w:r>(<w:r[^>]*>)([\s\S]*?)<w:t[^>]*>\}<\/w:t>/g, '<w:t>}</w:t></w:r>$1$2<w:t></w:t>');
      if (xml === prev) break;
    }
    zip.file('word/document.xml', xml);
  }
  const doc = new Docxtemplater(zip, {
    delimiters: { start: '{', end: '}' },
    paragraphLoop: true,
    linebreaks: true,
    errorLogging: false,
  });
  doc.render(context);

  const buffer = doc.getZip().generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });

  return buffer;
}

module.exports = {
  generateBankPaymentDocBuffer,
  resolveCompanyKey,
  amountInWords,
};
