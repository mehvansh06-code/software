export type ExcelRowObject = Record<string, unknown>;

type XlsxModule = typeof import('xlsx');
let xlsxModulePromise: Promise<XlsxModule> | null = null;

async function loadXlsx(): Promise<XlsxModule> {
  if (!xlsxModulePromise) {
    // Lazy-load to keep initial dashboard bundle small.
    xlsxModulePromise = import('xlsx');
  }
  return xlsxModulePromise;
}

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

async function triggerDownload(arrayBuffer: ArrayBuffer, filename: string): Promise<void> {
  const blob = new Blob([arrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function normalizeSheetName(name: string): string {
  const safe = String(name || '').replace(/[\\/*?:[\]]/g, ' ').trim();
  return (safe || 'Sheet1').slice(0, 31);
}

async function buildWorkbookArrayBuffer(
  sheets: Array<{ sheetName: string; rows?: ExcelRowObject[]; aoa?: Array<Array<unknown>> }>
): Promise<ArrayBuffer> {
  const XLSX = await loadXlsx();
  const wb = XLSX.utils.book_new();
  const defs = Array.isArray(sheets) && sheets.length > 0
    ? sheets
    : [{ sheetName: 'Sheet1', aoa: [] as Array<Array<unknown>> }];

  for (let i = 0; i < defs.length; i += 1) {
    const def = defs[i];
    const name = normalizeSheetName(def.sheetName || `Sheet${i + 1}`);
    let aoa: Array<Array<unknown>>;
    if (Array.isArray(def.aoa)) {
      aoa = def.aoa.map((row) => (row || []).map((v) => normalizeOutValue(v)));
    } else {
      const rows = Array.isArray(def.rows) ? def.rows : [];
      const headers = collectHeaders(rows);
      aoa = [headers];
      for (const row of rows) {
        aoa.push(headers.map((h) => normalizeOutValue(row?.[h])));
      }
      if (headers.length === 0) aoa = [];
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, name || `Sheet${i + 1}`);
  }

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  if (out instanceof ArrayBuffer) return out;
  if (ArrayBuffer.isView(out)) {
    const view = out as ArrayBufferView;
    const bytes = new Uint8Array(view.byteLength);
    bytes.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    return bytes.buffer;
  }
  return new Uint8Array(out as any).buffer;
}

export async function readFirstSheetAsObjects(file: File | ArrayBuffer): Promise<ExcelRowObject[]> {
  const XLSX = await loadXlsx();
  const data = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const wb = XLSX.read(data, { type: 'array', cellDates: true });
  const firstName = Array.isArray(wb.SheetNames) ? wb.SheetNames[0] : '';
  if (!firstName) return [];
  const ws = wb.Sheets[firstName];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }) as Array<Array<unknown>>;
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const headers = uniqueHeaders((rows[0] || []).map((v) => valueToString(v)));
  const out: ExcelRowObject[] = [];
  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r] || [];
    const record: ExcelRowObject = {};
    let hasAnyValue = false;
    for (let col = 0; col < headers.length; col += 1) {
      const value = row[col] ?? '';
      if (value !== '' && value != null) hasAnyValue = true;
      record[headers[col]] = value instanceof Date ? value.toISOString().slice(0, 10) : value;
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
  const arrayBuffer = await buildWorkbookArrayBuffer([{ sheetName, aoa: rows || [] }]);
  await triggerDownload(arrayBuffer, filename);
}

export async function downloadObjectsAsXlsx(
  filename: string,
  sheetName: string,
  rows: ExcelRowObject[]
): Promise<void> {
  const arrayBuffer = await buildWorkbookArrayBuffer([{ sheetName, rows: rows || [] }]);
  await triggerDownload(arrayBuffer, filename);
}

export async function downloadWorkbookAsXlsx(
  filename: string,
  sheets: Array<{ sheetName: string; rows?: ExcelRowObject[]; aoa?: Array<Array<unknown>> }>
): Promise<void> {
  const arrayBuffer = await buildWorkbookArrayBuffer(sheets || []);
  await triggerDownload(arrayBuffer, filename);
}
