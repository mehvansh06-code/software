import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ClipboardList, RefreshCw, Filter, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { api } from '../api';

export interface AuditLogEntry {
  id: number;
  userId: string;
  userName: string;
  action: string;
  targetId: string | null;
  details: Record<string, unknown> | null;
  timestamp: string;
}

const ACTION_OPTIONS = [
  'SHIPMENT_CREATED',
  'SHIPMENT_UPDATED',
  'SHIPMENT_DELETED',
  'DOCUMENT_UPLOADED',
  'DOCUMENT_DELETED',
  'SHIPMENTS_IMPORTED',
  'USER_CREATED',
  'USER_UPDATED',
  'USER_DELETED',
  'PERMISSIONS_UPDATED',
  'SUPPLIER_CREATED',
  'SUPPLIER_UPDATED',
  'SUPPLIER_DELETED',
  'SUPPLIERS_IMPORTED',
  'BUYER_CREATED',
  'BUYER_UPDATED',
  'BUYER_DELETED',
  'BUYERS_IMPORTED',
  'LICENCE_CREATED',
  'LICENCE_UPDATED',
  'LICENCE_DELETED',
  'LC_CREATED',
  'LC_UPDATED',
  'LC_DELETED',
];

const ACTION_LABELS: Record<string, string> = {
  SHIPMENT_CREATED: 'Shipment created',
  SHIPMENT_UPDATED: 'Shipment updated',
  SHIPMENT_DELETED: 'Shipment deleted',
  DOCUMENT_UPLOADED: 'Document uploaded',
  DOCUMENT_DELETED: 'Document deleted',
  SHIPMENTS_IMPORTED: 'Shipments imported',
  USER_CREATED: 'User created',
  USER_UPDATED: 'User updated',
  USER_DELETED: 'User deleted',
  PERMISSIONS_UPDATED: 'Permissions updated',
  SUPPLIER_CREATED: 'Supplier created',
  SUPPLIER_UPDATED: 'Supplier updated',
  SUPPLIER_DELETED: 'Supplier deleted',
  SUPPLIERS_IMPORTED: 'Suppliers imported',
  BUYER_CREATED: 'Buyer created',
  BUYER_UPDATED: 'Buyer updated',
  BUYER_DELETED: 'Buyer deleted',
  BUYERS_IMPORTED: 'Buyers imported',
  LICENCE_CREATED: 'Licence created',
  LICENCE_UPDATED: 'Licence updated',
  LICENCE_DELETED: 'Licence deleted',
  LC_CREATED: 'LC created',
  LC_UPDATED: 'LC updated',
  LC_DELETED: 'LC deleted',
};

function getActionLabel(action: string): string {
  return ACTION_LABELS[action] || action.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(ts: string): string {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' });
  } catch {
    return ts;
  }
}

/** Short human-readable narration for the audit log (e.g. "Created a new shipment 98"). */
function getNarration(entry: AuditLogEntry): string {
  const d = entry.details && typeof entry.details === 'object' ? entry.details : null;
  const invoiceNumber = d?.invoiceNumber as string | undefined;
  const name = d?.name as string | undefined;
  const count = d?.count as number | undefined;
  const username = d?.username as string | undefined;
  const number = d?.number as string | undefined;
  const lcNumber = d?.lcNumber as string | undefined;
  const filename = d?.filename as string | undefined;
  const target = entry.targetId ?? (invoiceNumber ? String(invoiceNumber) : null);

  switch (entry.action) {
    case 'SHIPMENT_CREATED':
      return invoiceNumber != null ? `Created a new shipment ${invoiceNumber}` : target ? `Created a new shipment ${target}` : 'Created a new shipment';
    case 'SHIPMENT_UPDATED':
      return invoiceNumber != null ? `Updated shipment ${invoiceNumber}` : target ? `Updated shipment ${target}` : 'Updated a shipment';
    case 'SHIPMENT_DELETED':
      return invoiceNumber != null ? `Deleted shipment ${invoiceNumber}` : target ? `Deleted shipment ${target}` : 'Deleted a shipment';
    case 'DOCUMENT_UPLOADED':
      return filename ? `Uploaded document ${filename}` : invoiceNumber != null ? `Uploaded document for shipment ${invoiceNumber}` : 'Uploaded a document';
    case 'DOCUMENT_DELETED':
      return filename ? `Deleted document ${filename}` : invoiceNumber != null ? `Deleted document for shipment ${invoiceNumber}` : 'Deleted a document';
    case 'SHIPMENTS_IMPORTED':
      return count != null ? `Imported ${count} shipment(s)` : 'Imported shipments';
    case 'USER_CREATED':
      return username ? `Created user ${username}` : 'Created a user';
    case 'USER_UPDATED':
      return username ? `Updated user ${username}` : 'Updated a user';
    case 'USER_DELETED':
      return username ? `Deleted user ${username}` : 'Deleted a user';
    case 'PERMISSIONS_UPDATED':
      return 'Updated user permissions';
    case 'SUPPLIER_CREATED':
      return name ? `Created supplier ${name}` : 'Created a supplier';
    case 'SUPPLIER_UPDATED':
      return name ? `Updated supplier ${name}` : 'Updated a supplier';
    case 'SUPPLIER_DELETED':
      return name ? `Deleted supplier ${name}` : 'Deleted a supplier';
    case 'SUPPLIERS_IMPORTED':
      return count != null ? `Imported ${count} supplier(s)` : 'Imported suppliers';
    case 'BUYER_CREATED':
      return name ? `Created buyer ${name}` : 'Created a buyer';
    case 'BUYER_UPDATED':
      return name ? `Updated buyer ${name}` : 'Updated a buyer';
    case 'BUYER_DELETED':
      return name ? `Deleted buyer ${name}` : 'Deleted a buyer';
    case 'BUYERS_IMPORTED':
      return count != null ? `Imported ${count} buyer(s)` : 'Imported buyers';
    case 'LICENCE_CREATED':
      return number ? `Created licence ${number}` : 'Created a licence';
    case 'LICENCE_UPDATED':
      return number ? `Updated licence ${number}` : 'Updated a licence';
    case 'LICENCE_DELETED':
      return number ? `Deleted licence ${number}` : 'Deleted a licence';
    case 'LC_CREATED':
      return lcNumber ? `Created LC ${lcNumber}` : 'Created an LC';
    case 'LC_UPDATED':
      return lcNumber ? `Updated LC ${lcNumber}` : 'Updated an LC';
    case 'LC_DELETED':
      return lcNumber ? `Deleted LC ${lcNumber}` : 'Deleted an LC';
    default:
      const label = getActionLabel(entry.action);
      return target ? `${label} ${target}` : label;
  }
}

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [userId, setUserId] = useState('');
  const [action, setAction] = useState('');
  const [targetId, setTargetId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [limit, setLimit] = useState(200);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [archiveDays, setArchiveDays] = useState(10);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportMessage, setExportMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Parameters<typeof api.auditLogs.list>[0] = { limit };
      if (userId.trim()) params.userId = userId.trim();
      if (action.trim()) params.action = action.trim();
      if (targetId.trim()) params.targetId = targetId.trim();
      if (from.trim()) params.from = from.trim();
      if (to.trim()) params.to = to.trim();
      const list = await api.auditLogs.list(params);
      setLogs(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load audit logs');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [userId, action, targetId, from, to, limit]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    setCurrentPage(1);
  }, [userId, action, targetId, from, to, limit]);

  useEffect(() => {
    setCurrentPage(1);
  }, [logs.length]);

  const totalRows = logs.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pagedLogs = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return logs.slice(start, start + pageSize);
  }, [logs, safePage, pageSize]);
  const startRow = totalRows === 0 ? 0 : ((safePage - 1) * pageSize + 1);
  const endRow = Math.min(totalRows, safePage * pageSize);

  const handleExportAndArchive = async () => {
    setExportMessage(null);
    setExportLoading(true);
    try {
      const result = await api.auditLogs.exportAndArchive({ olderThanDays: Math.max(1, archiveDays) });
      if (result.count > 0) {
        setExportMessage({
          type: 'success',
          text: `Exported ${result.count} log(s) to ${result.filePath || 'file'}. They have been removed from the database.`,
        });
        loadLogs();
      } else {
        setExportMessage({ type: 'success', text: 'No logs older than ' + archiveDays + ' days to export.' });
      }
    } catch (e: any) {
      setExportMessage({ type: 'error', text: e?.message || 'Export and archive failed.' });
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-slate-800 text-white">
            <ClipboardList size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Audit Logs</h1>
            <p className="text-slate-500 text-sm">Who did what and when</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setShowFilters((s) => !s)}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors min-h-[44px]"
          >
            <Filter size={18} />
            Filters
            {showFilters ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
          <button
            type="button"
            onClick={loadLogs}
            disabled={loading}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50 transition-colors min-h-[44px]"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">User ID</label>
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="Filter by user id"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder-slate-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Action</label>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900"
            >
              <option value="">All actions</option>
              {ACTION_OPTIONS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Target ID</label>
            <input
              type="text"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              placeholder="e.g. shipment or user id"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder-slate-400"
            />
          </div>
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">From (date)</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">To (date)</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900"
              />
            </div>
          </div>
          <div className="sm:col-span-2 lg:col-span-1 flex items-end">
            <div className="w-full">
              <label className="block text-xs font-medium text-slate-500 mb-1">Limit</label>
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900"
              >
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
                <option value={500}>500</option>
              </select>
            </div>
          </div>
        </div>
      )}

      <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Export and archive</h2>
        <p className="text-slate-600 text-sm mb-3">
          Export logs older than the selected number of days to a CSV file and remove them from the database to keep the app light. Files are saved on the server. This also runs automatically every 10 days.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Archive logs older than (days)</label>
            <input
              type="number"
              min={1}
              max={365}
              value={archiveDays}
              onChange={(e) => setArchiveDays(Math.max(1, parseInt(e.target.value, 10) || 10))}
              className="w-24 px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900"
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={handleExportAndArchive}
              disabled={exportLoading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-700 text-white hover:bg-slate-600 disabled:opacity-50 transition-colors"
            >
              <Download size={18} className={exportLoading ? 'animate-pulse' : ''} />
              {exportLoading ? 'Exporting...' : 'Export and archive now'}
            </button>
          </div>
        </div>
        {exportMessage && (
          <div
            className={`mt-3 p-3 rounded-lg text-sm ${exportMessage.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}
          >
            {exportMessage.text}
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-12 flex items-center justify-center">
            <RefreshCw size={28} className="animate-spin text-slate-400" />
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-slate-500">No audit log entries found.</div>
        ) : (
          <div>
            <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-semibold text-slate-600">
                Showing {startRow}-{endRow} of {totalRows} logs
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs font-semibold text-slate-500">Rows</label>
                <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value) || 50)} className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700">
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                </select>
                <button type="button" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white disabled:opacity-40">Prev</button>
                <span className="text-xs font-bold text-slate-600 min-w-[64px] text-center">{safePage} / {totalPages}</span>
                <button type="button" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white disabled:opacity-40">Next</button>
              </div>
            </div>
          <div className="md:hidden p-3 space-y-3">
            {pagedLogs.map((entry) => (
              <article key={entry.id} className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <span className="inline-flex px-2 py-0.5 rounded-md bg-slate-200 text-slate-800 text-[10px] font-bold">
                    {getActionLabel(entry.action)}
                  </span>
                  <p className="text-[10px] text-slate-500 whitespace-nowrap">{formatDate(entry.timestamp)}</p>
                </div>
                <p className="text-sm text-slate-900 break-words">{getNarration(entry)}</p>
                <p className="text-[11px] text-slate-600">{entry.userName || entry.userId || '—'}</p>
              </article>
            ))}
          </div>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left table-fixed min-w-[900px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider w-[11rem]">Time</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider min-w-0">Summary</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider w-[8rem]">User</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider w-[9rem]">Action</th>
                </tr>
              </thead>
              <tbody>
                {pagedLogs.map((entry) => (
                  <tr key={entry.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap align-top">{formatDate(entry.timestamp)}</td>
                    <td className="px-4 py-3 text-sm text-slate-900 min-w-0 break-words overflow-hidden align-top" title={getNarration(entry)}>
                      <span className="block break-all">{getNarration(entry)}</span>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900 align-top">{entry.userName || entry.userId || '—'}</td>
                    <td className="px-4 py-3 text-sm align-top">
                      <span className="inline-flex px-2 py-0.5 rounded-md bg-slate-200 text-slate-800 text-xs">
                        {getActionLabel(entry.action)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
        )}
      </div>
    </div>
  );
}
