import React, { useState, useEffect, useCallback } from 'react';
import { ClipboardList, RefreshCw, Filter, ChevronDown, ChevronUp } from 'lucide-react';
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
  'USER_CREATED',
  'USER_UPDATED',
  'USER_DELETED',
  'PERMISSIONS_UPDATED',
  'SUPPLIER_CREATED',
  'SUPPLIER_UPDATED',
  'BUYER_CREATED',
  'BUYER_UPDATED',
  'BUYERS_IMPORTED',
  'LICENCE_CREATED',
  'LICENCE_UPDATED',
  'LC_CREATED',
  'LC_UPDATED',
];

function formatDate(ts: string): string {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' });
  } catch {
    return ts;
  }
}

function detailsSummary(details: Record<string, unknown> | null): string {
  if (!details || typeof details !== 'object') return '—';
  const msg = details.message as string | undefined;
  if (typeof msg === 'string') return msg;
  const keys = Object.keys(details).filter((k) => k !== 'raw');
  if (keys.length === 0) return (details.raw as string) ?? '—';
  return keys.map((k) => `${k}: ${JSON.stringify(details[k])}`).join(' · ');
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
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">{entry.userName || entry.userId || '—'}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className="inline-flex px-2 py-0.5 rounded-md bg-slate-200 text-slate-800 font-mono text-xs">
                        {entry.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 font-mono">{entry.targetId || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 max-w-md truncate" title={detailsSummary(entry.details)}>
                      {detailsSummary(entry.details)}
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
