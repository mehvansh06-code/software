import XlsxPopulate from 'xlsx-populate/browser/xlsx-populate';

export type ExcelRowObject = Record<string, unknown>;

function valueToString(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return String(value).trim();
}

function uniqueHeaders(rawHeaders: string[]): string[] {
  const seen = new Map<string, number>();
  return rawHeaders.map((raw, index) => {
    const base = (raw || `Column ${index + 1}`).trim() || `Column ${index + 1}`;
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}_${count}`;
  });
}

function collectHeaders(rows: ExcelRowObject[]): string[] {
  const headers: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row || {})) {
      if (seen.has(key)) continue;
      seen.add(key);
      headers.push(key);
    }
  }
  return headers;
}

function normalizeOutValue(value: unknown): string | number | boolean {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  try {
    return JSON.stringify(value);
  } catch (_) {
    return String(value);
  }
}

async function workbookToBlob(workbook: any): Promise<Blob> {
  try {
    const blob = await workbook.outputAsync({ type: 'blob' });
    if (blob instanceof Blob) return blob;
  } catch (_) {}
  const raw = await workbook.outputAsync();
  if (raw instanceof Blob) return raw;
  if (raw instanceof ArrayBuffer) {
    return new Blob([raw], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  if (ArrayBuffer.isView(raw)) {
    const view = raw as ArrayBufferView;
    const bytes = new Uint8Array(view.byteLength);
    bytes.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    return new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  return new Blob([raw], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

async function triggerDownload(workbook: any, filename: string): Promise<void> {
  const blob = await workbookToBlob(workbook);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function writeAoaToSheet(sheet: any, rows: Array<Array<unknown>>) {
  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c += 1) {
      sheet.cell(r + 1, c + 1).value(normalizeOutValue(row[c]));
    }
  }
}

function writeObjectsToSheet(sheet: any, rows: ExcelRowObject[]) {
  const headers = collectHeaders(rows);
  if (headers.length === 0) return;
  for (let col = 0; col < headers.length; col += 1) {
    sheet.cell(1, col + 1).value(headers[col]);
  }
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] || {};
    for (let col = 0; col < headers.length; col += 1) {
      const key = headers[col];
      sheet.cell(rowIndex + 2, col + 1).value(normalizeOutValue(row[key]));
    }
  }
}

async function buildWorkbook(
  sheets: Array<{ sheetName: string; rows?: ExcelRowObject[]; aoa?: Array<Array<unknown>> }>
): Promise<any> {
  const workbook = await XlsxPopulate.fromBlankAsync();
  if (!Array.isArray(sheets) || sheets.length === 0) {
    workbook.sheet(0).name('Sheet1');
    return workbook;
  }
  for (let i = 0; i < sheets.length; i += 1) {
    const def = sheets[i];
    const name = (def.sheetName || `Sheet${i + 1}`).trim() || `Sheet${i + 1}`;
    const sheet = i === 0 ? workbook.sheet(0) : workbook.addSheet(name);
    sheet.name(name);
    if (Array.isArray(def.aoa)) {
      writeAoaToSheet(sheet, def.aoa);
    } else {
      writeObjectsToSheet(sheet, Array.isArray(def.rows) ? def.rows : []);
    }
  }
  return workbook;
}

export async function readFirstSheetAsObjects(file: File | ArrayBuffer): Promise<ExcelRowObject[]> {
  const data = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const workbook = await XlsxPopulate.fromDataAsync(data);
  const sheet = workbook.sheet(0);
  if (!sheet) return [];
  const used = sheet.usedRange();
  if (!used) return [];

  const maxRows = used.endCell().rowNumber();
  const maxCols = used.endCell().columnNumber();
  if (!maxRows || !maxCols || maxRows < 1) return [];

  const rawHeaders: string[] = [];
  for (let col = 1; col <= maxCols; col += 1) {
    rawHeaders.push(valueToString(sheet.cell(1, col).value()));
  }
  const headers = uniqueHeaders(rawHeaders);

  const out: ExcelRowObject[] = [];
  for (let row = 2; row <= maxRows; row += 1) {
    const record: ExcelRowObject = {};
    let hasAnyValue = false;
    for (let col = 1; col <= headers.length; col += 1) {
      const value = sheet.cell(row, col).value();
      if (value !== '' && value != null) hasAnyValue = true;
      record[headers[col - 1]] = value instanceof Date ? value.toISOString().slice(0, 10) : value;
    }
    if (hasAnyValue) out.push(record);
  }
  return out;
}

export async function downloadAoaAsXlsx(
  filename: string,
  sheetName: string,
  rows: Array<Array<unknown>>
): Promise<void> {
  const workbook = await buildWorkbook([{ sheetName, aoa: rows || [] }]);
  await triggerDownload(workbook, filename);
}

export async function downloadObjectsAsXlsx(
  filename: string,
  sheetName: string,
  rows: ExcelRowObject[]
): Promise<void> {
  const workbook = await buildWorkbook([{ sheetName, rows: rows || [] }]);
  await triggerDownload(workbook, filename);
}

export async function downloadWorkbookAsXlsx(
  filename: string,
  sheets: Array<{ sheetName: string; rows?: ExcelRowObject[]; aoa?: Array<Array<unknown>> }>
): Promise<void> {
  const workbook = await buildWorkbook(sheets || []);
  await triggerDownload(workbook, filename);
}
