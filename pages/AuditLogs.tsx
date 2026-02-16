import React, { useState, useEffect, useCallback } from 'react';
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

function detailsToReadable(details: Record<string, unknown> | null): string {
  if (!details || typeof details !== 'object') return '—';
  const msg = details.message as string | undefined;
  if (typeof msg === 'string') return msg;
  // Build short sentence from known fields
  const invoiceNumber = details.invoiceNumber as string | undefined;
  const name = details.name as string | undefined;
  const lcNumber = details.lcNumber as string | undefined;
  const filename = details.filename as string | undefined;
  const count = details.count as number | undefined;
  const number = details.number as string | undefined;
  const type = details.type as string | undefined;
  const company = details.company as string | undefined;
  const username = details.username as string | undefined;
  const role = details.role as string | undefined;
  const status = details.status as string | undefined;
  const amount = details.amount as number | string | undefined;
  const currency = details.currency as string | undefined;
  if (invoiceNumber != null) return `Invoice ${invoiceNumber}`;
  if (name != null && count != null) return `${name}; ${count} item(s)`;
  if (name != null) return name;
  if (lcNumber != null && amount != null && currency != null) return `LC ${lcNumber} (${currency} ${amount})`;
  if (lcNumber != null && status != null) return `LC ${lcNumber} → ${status}`;
  if (lcNumber != null) return `LC ${lcNumber}`;
  if (filename != null) return filename;
  if (count != null) return `${count} item(s)`;
  if (number != null && type != null && company != null) return `Licence ${number} (${type}, ${company})`;
  if (number != null && type != null) return `Licence ${number} (${type})`;
  if (username != null && role != null) return `${username} (${role})`;
  if (username != null) return username;
  const keys = Object.keys(details).filter((k) => k !== 'raw');
  if (keys.length === 0) return (details.raw as string) ?? '—';
  return keys.map((k) => `${k}: ${JSON.stringify(details[k])}`).join(' · ');
}

function entrySummary(entry: AuditLogEntry): string {
  const user = entry.userName || entry.userId || 'System';
  const label = getActionLabel(entry.action);
  const detail = detailsToReadable(entry.details);
  if (detail && detail !== '—') return `${user} ${label}: ${detail}`;
  const target = entry.targetId ? ` #${entry.targetId}` : '';
  return `${user} ${label}${target}`;
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
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowFilters((s) => !s)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Filter size={18} />
            Filters
            {showFilters ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
          <button
            type="button"
            onClick={loadLogs}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
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
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Time</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Summary</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">User</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Action</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Target</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((entry) => (
                  <tr key={entry.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">{formatDate(entry.timestamp)}</td>
                    <td className="px-4 py-3 text-sm text-slate-900 max-w-sm" title={entrySummary(entry)}>
                      {entrySummary(entry)}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">{entry.userName || entry.userId || '—'}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className="inline-flex px-2 py-0.5 rounded-md bg-slate-200 text-slate-800 text-xs">
                        {getActionLabel(entry.action)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 font-mono">{entry.targetId || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 max-w-md truncate" title={detailsToReadable(entry.details)}>
                      {detailsToReadable(entry.details)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
