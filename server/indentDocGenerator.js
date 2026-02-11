/**
 * Generate Sales Indent .docx using the docx package.
 * Professional formatting: typography, spacing, table styling.
 */
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  BorderStyle,
  WidthType,
  convertMillimetersToTwip,
} = require('docx');
const convertCmToTwip = (cm) => convertMillimetersToTwip(cm * 10);
const { INDENT_COMPANY_DB } = require('./config');
const n2w = require('number-to-words');

const GST_RATE_IGST = 0.05;
const GST_RATE_CGST = 0.025;
const GST_RATE_SGST = 0.025;

// Typography: font sizes in half-points (e.g. 24 = 12pt)
const FONT = { name: 'Calibri', size: 22 }; // 11pt body
const FONT_SM = 20;   // 10pt
const FONT_H2 = 26;   // 13pt
const FONT_TITLE = 32; // 16pt
const COLOR_DARK = '2C3E50';
const COLOR_MUTED = '5D6D7E';
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: 'B0BEC5' };
const TABLE_BORDERS = {
  top: BORDER, bottom: BORDER, left: BORDER, right: BORDER,
  insideHorizontal: BORDER, insideVertical: BORDER,
};
const HEADER_SHADING = { fill: 'ECEFF1' }; // light grey

function amountInWords(num, currency = 'INR') {
  const integerPart = Math.floor(num);
  const decimalPart = Math.round((num - integerPart) * 100);
  let words = n2w.toWords(integerPart, { allowNegative: false });
  words = words.charAt(0).toUpperCase() + words.slice(1);
  if (decimalPart > 0) {
    words += ` And ${n2w.toWords(decimalPart)} Paise`;
  }
  return `${words} ${currency} Only`;
}

function run(text, opts = {}) {
  return new TextRun({
    text: String(text),
    font: FONT.name,
    size: opts.size ?? FONT.size,
    bold: opts.bold ?? false,
    color: opts.color ?? COLOR_DARK,
    ...opts,
  });
}

function cell(text, bold = false, opts = {}) {
  return new TableCell({
    shading: opts.shading,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: [
      new Paragraph({
        spacing: { before: 40, after: 40 },
        children: [run(text, { bold })],
      }),
    ],
    ...opts,
  });
}

function cellRight(text, bold = false) {
  return new TableCell({
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { before: 40, after: 40 },
        children: [run(text, { bold })],
      }),
    ],
  });
}

function sectionSpace() {
  return new Paragraph({ text: '', spacing: { before: 0, after: 220 } });
}

function buildDocument(data) {
  const company = INDENT_COMPANY_DB[data.company];
  if (!company) throw new Error('Invalid company');
  const currency = data.currency || 'INR';
  const isExport = data.txnType === 'Export';

  const children = [];

  // Title
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 240 },
      children: [run('SALES INDENT', { bold: true, size: FONT_TITLE })],
    })
  );

  // Company header table (2 cols)
  const compAddrLines = (company.address || '').split('\n').filter(Boolean);
  const compChildren = [
    new Paragraph({ spacing: { before: 0, after: 80 }, children: [run('SUPPLIER:', { bold: true })] }),
    new Paragraph({ spacing: { before: 0, after: 80 }, children: [run((data.company || '').toUpperCase(), { bold: true })] }),
    ...compAddrLines.map((line) => new Paragraph({ spacing: { before: 0, after: 40 }, children: [run(line)] })),
  ];
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: TABLE_BORDERS,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              margins: { top: 100, bottom: 100, left: 100, right: 100 },
              children: compChildren,
            }),
            new TableCell({
              margins: { top: 100, bottom: 100, left: 100, right: 100 },
              children: [
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  spacing: { before: 0, after: 60 },
                  children: [
                    run(`GSTIN: ${company.gstin}\n`, { bold: true }),
                    ...(isExport && company.iec ? [run(`IEC: ${company.iec}\n`, { bold: true })] : []),
                    run(`Ph: ${company.phone}`),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    })
  );
  children.push(sectionSpace());

  // Refs table
  const refRows = [
    new TableRow({
      children: [
        cell(`Our Ref: ${data.ourRef || ''}\nDate: ${data.date || ''}`),
        cell(`Buyer Ref: ${data.buyerRef || ''}\nOrder Ref: ${data.ordRef || ''}`),
      ],
    }),
    new TableRow({
      children: [
        cell(
          `Buyer:\n${data.buyerName || ''}\n${data.billAddr || ''}` +
            (isExport ? `\nCountry: ${data.countryDest || ''}` : `\nGST: ${data.buyerGst || ''}\nState: ${data.buyerState || ''}`)
        ),
        cell(`Consignee:\n${data.shipSite || ''}\n${data.shipAddr || ''}\nContact: ${data.shipContact || ''}`),
      ],
    }),
  ];
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: TABLE_BORDERS,
      rows: refRows,
    })
  );

  if ((data.salesName || '').trim()) {
    children.push(new Paragraph({ text: '', spacing: { after: 120 } }));
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: TABLE_BORDERS,
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: 25, type: WidthType.PERCENTAGE },
                shading: HEADER_SHADING,
                margins: { top: 60, bottom: 60, left: 80, right: 80 },
                children: [new Paragraph({ spacing: { before: 40, after: 40 }, children: [run('Sales Representative', { bold: true })] })],
              }),
              new TableCell({
                width: { size: 75, type: WidthType.PERCENTAGE },
                margins: { top: 60, bottom: 60, left: 80, right: 80 },
                children: [new Paragraph({ spacing: { before: 40, after: 40 }, children: [run(`${data.salesName || ''} | ${data.salesMob || ''} | ${data.salesMail || ''}`)] })],
              }),
            ],
          }),
        ],
      })
    );
  }

  if (isExport) {
    children.push(sectionSpace());
    const exportRows = [
      new TableRow({ children: [cell('Country of Origin'), cell(data.countryOrigin || 'India'), cell('Country of Destination'), cell(data.countryDest || '')] }),
      new TableRow({ children: [cell('Port of Loading'), cell(data.portLoad || ''), cell('Port of Discharge'), cell(data.portDis || '')] }),
      new TableRow({ children: [cell('IncoTerms'), cell(data.incoterm || ''), cell('Shipping Date'), cell(data.shippingDate || '')] }),
      new TableRow({
        children: [
          new TableCell({
            columnSpan: 4,
            margins: { top: 60, bottom: 60, left: 80, right: 80 },
            children: [new Paragraph({ spacing: { before: 40, after: 40 }, children: [run(`Indent is valid for ${data.validityDays ?? 30} days.`)] })],
          }),
        ],
      }),
    ];
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: TABLE_BORDERS,
        rows: exportRows,
      })
    );
  }

  children.push(sectionSpace());

  // Items table
  const cols = ['S.No', 'Quality', 'Description', 'Design', 'Shade', 'Item Code', 'HSN', 'Qty', 'Unit', `Rate (${currency})`, `Amount (${currency})`];
  const headerRow = new TableRow({
    children: cols.map((c) => cell(c, true, { shading: HEADER_SHADING })),
  });
  const itemRows = (data.items || []).map((item, idx) =>
    new TableRow({
      children: [
        cell(String(idx + 1)),
        cell(item.quality || ''),
        cell(item.desc || ''),
        cell(item.design || ''),
        cell(item.shade || ''),
        cell((item.buyerRef || '').trim() === ':' ? '' : (item.buyerRef || '')),
        cell(item.hsn || ''),
        cell(Number(item.qty).toLocaleString('en-IN', { minimumFractionDigits: 2 })),
        cell(item.unit || ''),
        cellRight(Number(item.rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })),
        cellRight(Number(item.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })),
      ],
    })
  );

  let subtotal = Number(data.subtotal) || 0;
  let grandTotal = subtotal;

  const finRows = [headerRow, ...itemRows];

  finRows.push(
    new TableRow({
      children: [
        new TableCell({
          columnSpan: 10,
          margins: { top: 60, bottom: 60, left: 80, right: 80 },
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 40, after: 40 }, children: [run(`Sub-Total (${currency})`)] })],
        }),
        cellRight(subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })),
      ],
    })
  );

  if (data.txnType === 'Domestic' && currency === 'INR') {
    const buyerState = String(data.buyerState || '').toLowerCase();
    const buyerGst = String(data.buyerGst || '');
    const isGuj = buyerState.includes('gujarat') || buyerGst.startsWith('24');
    if (isGuj) {
      const tax = subtotal * GST_RATE_CGST;
      finRows.push(
        new TableRow({
          children: [
            new TableCell({
              columnSpan: 10,
              margins: { top: 60, bottom: 60, left: 80, right: 80 },
              children: [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 40, after: 40 }, children: [run(`CGST (${GST_RATE_CGST * 100}%)`)] })],
            }),
            cellRight(tax.toLocaleString('en-IN', { minimumFractionDigits: 2 })),
          ],
        })
      );
      finRows.push(
        new TableRow({
          children: [
            new TableCell({
              columnSpan: 10,
              margins: { top: 60, bottom: 60, left: 80, right: 80 },
              children: [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 40, after: 40 }, children: [run(`SGST (${GST_RATE_SGST * 100}%)`)] })],
            }),
            cellRight(tax.toLocaleString('en-IN', { minimumFractionDigits: 2 })),
          ],
        })
      );
      grandTotal += tax * 2;
    } else {
      const tax = subtotal * GST_RATE_IGST;
      finRows.push(
        new TableRow({
          children: [
            new TableCell({
              columnSpan: 10,
              margins: { top: 60, bottom: 60, left: 80, right: 80 },
              children: [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 40, after: 40 }, children: [run(`IGST (${GST_RATE_IGST * 100}%)`)] })],
            }),
            cellRight(tax.toLocaleString('en-IN', { minimumFractionDigits: 2 })),
          ],
        })
      );
      grandTotal += tax;
    }
  }

  finRows.push(
    new TableRow({
      children: [
        new TableCell({
          columnSpan: 10,
          margins: { top: 80, bottom: 80, left: 80, right: 80 },
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              spacing: { before: 60, after: 40 },
              children: [run(`Amount in Words: ${amountInWords(grandTotal, currency)}`, { bold: false, size: FONT_SM })],
            }),
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              spacing: { before: 80, after: 40 },
              children: [run(`GRAND TOTAL (${currency})`, { bold: true })],
            }),
          ],
        }),
        new TableCell({
          margins: { top: 80, bottom: 80, left: 80, right: 80 },
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              spacing: { before: 60, after: 40 },
              children: [run(grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 }), { bold: true })],
            }),
          ],
        }),
      ],
    })
  );

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: TABLE_BORDERS,
      rows: finRows,
    })
  );

  children.push(sectionSpace());

  if ((data.sampling || '').trim()) {
    children.push(new Paragraph({ spacing: { before: 120, after: 80 }, children: [run('Sampling Requirements:', { bold: true, size: FONT_H2 })] }));
    (data.sampling || '').split('\n').forEach((line) => line.trim() && children.push(new Paragraph({ spacing: { before: 0, after: 60 }, children: [run(line.trim())] })));
  }
  if ((data.packaging || '').trim()) {
    children.push(new Paragraph({ spacing: { before: 200, after: 80 }, children: [run('Packaging Requirements:', { bold: true, size: FONT_H2 })] }));
    (data.packaging || '').split('\n').forEach((line) => line.trim() && children.push(new Paragraph({ spacing: { before: 0, after: 60 }, children: [run(line.trim())] })));
  }
  children.push(new Paragraph({ spacing: { before: 200, after: 80 }, children: [run('Notes:', { bold: true, size: FONT_H2 })] }));
  if ((data.terms || '').trim()) {
    (data.terms || '').split('\n').forEach((line) => line.trim() && children.push(new Paragraph({ spacing: { before: 0, after: 60 }, children: [run(line.trim())] })));
  }
  children.push(new Paragraph({ spacing: { before: 160, after: 120 }, children: [run('Any Dispute regarding the goods must be raised with the respective Marketing Person within 30 Days from the date of receipt of goods.', { color: COLOR_MUTED })] }));
  children.push(new Paragraph({ spacing: { before: 0, after: 200 }, children: [run(`Payment Terms: ${data.paymentTerms || ''}`, { bold: true })] }));

  children.push(sectionSpace());
  children.push(new Paragraph({ spacing: { before: 0, after: 100 }, children: [run('BANK DETAILS', { bold: true, size: FONT_H2 })] }));
  const bankKeys = ['accountHolder', 'bank', 'branch', 'acct', 'ifsc'];
  if (isExport) bankKeys.push('swift');
  const bankLabels = ['Account Holder', 'Bank', 'Branch', 'Acct', 'IFSC', 'SWIFT'];
  const b = company.bankDetails || {};
  const bankRow1 = new TableRow({ children: bankKeys.map((_, i) => cell(bankLabels[i], true, { shading: HEADER_SHADING })) });
  const bankRow2 = new TableRow({ children: bankKeys.map((k) => cell(b[k] || '')) });
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: TABLE_BORDERS,
      rows: [bankRow1, bankRow2],
    })
  );

  if (isExport) {
    children.push(new Paragraph({ text: '', spacing: { after: 200 } }));
    children.push(new Paragraph({ spacing: { before: 0, after: 100 }, children: [run('Documents Required', { bold: true, size: FONT_H2 })] }));
    ['Commercial Invoice - 3 Copies', 'Bill of Lading - 3 Copies', 'Packing List - 3 Copies', 'Certificate of Origin - 3 Copies'].forEach((d) =>
      children.push(new Paragraph({ spacing: { before: 0, after: 40 }, text: d, bullet: { level: 0 } }))
    );
  }

  children.push(sectionSpace());
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: TABLE_BORDERS,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              margins: { top: 80, bottom: 80, left: 80, right: 80 },
              children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 120 }, children: [run(`For, ${data.company}`)] })],
            }),
            new TableCell({
              margins: { top: 80, bottom: 80, left: 80, right: 80 },
              children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 120 }, children: [run(data.company)] })],
            }),
            new TableCell({
              margins: { top: 80, bottom: 80, left: 80, right: 80 },
              children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 120 }, children: [run(`For, ${data.buyerName || ''}`)] })],
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              margins: { top: 0, bottom: 100, left: 80, right: 80 },
              children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [run('\n\n\n\nAuthorised Signatory', { color: COLOR_MUTED, size: FONT_SM })] })],
            }),
            new TableCell({
              margins: { top: 0, bottom: 100, left: 80, right: 80 },
              children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [run('\n\n\n\nDirector', { color: COLOR_MUTED, size: FONT_SM })] })],
            }),
            new TableCell({
              margins: { top: 0, bottom: 100, left: 80, right: 80 },
              children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [run('\n\n\n\nSignature & Seal of Company', { color: COLOR_MUTED, size: FONT_SM })] })],
            }),
          ],
        }),
      ],
    })
  );

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertCmToTwip(1.25),
              right: convertCmToTwip(1.25),
              bottom: convertCmToTwip(1.25),
              left: convertCmToTwip(1.25),
            },
          },
        },
        children,
      },
    ],
  });

  return doc;
}

async function generateDocxBuffer(data) {
  const doc = buildDocument(data);
  return Packer.toBuffer(doc);
}

module.exports = { buildDocument, generateDocxBuffer };
