
/**
 * DOUBLE-LOCK HYBRID SQL BRIDGE
 * Primary: Relational SQLite (Local Node.js)
 * Secondary: Persistent Browser Ledger (LocalStorage)
 */

// In the browser, use the same host you opened the app from — so when WiFi/IP changes, no .env update needed.
// (VITE_API_HOST in .env was causing "offline" after IP change; now we only use it outside the browser.)
const _envHost = typeof (import.meta as any).env?.VITE_API_HOST === 'string' ? (import.meta as any).env.VITE_API_HOST.trim() : '';
const API_HOST =
  typeof window !== 'undefined'
    ? (window.location.hostname || 'localhost')
    : (_envHost || 'localhost');
const API_BASE = `${typeof window !== 'undefined' ? window.location.protocol : 'http:'}//${API_HOST}:3001/api`;
const FETCH_TIMEOUT = 8000;
const SAFE_ENDPOINT_REGEX = /^[a-zA-Z0-9\/_\-\.]+$/;
const MAX_ENDPOINT_LENGTH = 256;

function sanitizeEndpoint(endpoint: string): string {
  if (typeof endpoint !== 'string' || endpoint.length > MAX_ENDPOINT_LENGTH) return '';
  const trimmed = endpoint.trim();
  if (!SAFE_ENDPOINT_REGEX.test(trimmed)) return '';
  return trimmed;
} 

const SIM_KEY = 'FLOTEX_PERSISTENT_V1';

// Initialize Simulated Store with a "User Data Only" flag to prevent Sample data overwrites
const getSimData = () => {
  const defaultState = () => ({
    suppliers: [],
    buyers: [],
    shipments: [],
    licences: [],
    lcs: [],
    materials: [],
    lastSync: new Date().toISOString(),
    isDirty: false
  });
  const saved = localStorage.getItem(SIM_KEY);
  if (saved) {
    try {
      const data = JSON.parse(saved);
      if (!data.materials) data.materials = [];
      return data;
    } catch {
      console.warn('Corrupt or invalid data in localStorage (SIM_KEY), clearing entry.');
      localStorage.removeItem(SIM_KEY);
      return defaultState();
    }
  }
  return defaultState();
};

const saveSimData = (data: any) => {
  localStorage.setItem(SIM_KEY, JSON.stringify(data));
};

let serverAvailable = false;
let forceSimulated = false;

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

type FetchApiOptions = RequestInit & { queryString?: string };

async function fetchApi(endpoint: string, options: FetchApiOptions = {}) {
  const { queryString, ...fetchOptions } = options;
  const safeEndpoint = sanitizeEndpoint(endpoint);
  if (!safeEndpoint) return Promise.reject(new Error('Invalid endpoint'));

  if (forceSimulated) return handleSimulatedRequest(safeEndpoint, options);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  const url = queryString && /^[a-zA-Z0-9&=\-_\.\+%]+$/.test(queryString)
    ? `${API_BASE}/${safeEndpoint}?${queryString}`
    : `${API_BASE}/${safeEndpoint}`;

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
      headers: { ...getAuthHeaders(), ...(fetchOptions.headers as Record<string, string>) },
    });

    clearTimeout(timeoutId);
    // Any HTTP response means the server is reachable (online)
    serverAvailable = true;

    if (response.status === 401) {
      if (typeof window !== 'undefined') localStorage.removeItem('token');
      throw new Error('Session expired. Please log in again.');
    }
    if (response.status === 403) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error || 'Insufficient permissions for this action.');
    }
    if (!response.ok) {
      let errBody: any = {};
      try {
        errBody = await response.json();
      } catch (_) {}
      const msg = (errBody && typeof errBody === 'object' && errBody.error) ? errBody.error : (response.status === 409 ? 'Conflict: the request could not be completed.' : 'Request failed.');
      throw new Error(msg);
    }

    try {
      return await response.json();
    } catch (_) {
      throw new Error('Invalid response from server');
    }
  } catch (error: any) {
    clearTimeout(timeoutId);
    const isNetworkFailure =
      error?.name === 'AbortError' ||
      /failed to fetch|network error|load failed|connection refused/i.test(error?.message || '');
    if (isNetworkFailure) serverAvailable = false;
    return handleSimulatedRequest(safeEndpoint, options);
  }
}

function handleSimulatedRequest(endpoint: string, options: RequestInit) {
  const sim = getSimData();
  const table = endpoint.split('/')[0] as keyof typeof sim;
  const idMatch = endpoint.split('/')[1];
  const method = (options.method || 'GET').toUpperCase();

  if (endpoint === 'stats') {
    return {
      suppliers: sim.suppliers.length,
      buyers: sim.buyers.length,
      shipments: sim.shipments.length,
      licences: sim.licences.length,
      lcs: sim.lcs.length,
      lastSync: sim.lastSync,
      mode: 'BROWSER_PERSISTENT',
      isDirty: sim.isDirty
    };
  }

  if (!options.method || options.method === 'GET') {
    if (endpoint.includes('/documents-folder-files')) {
      return { files: [] };
    }
    if (endpoint.includes('/documents-folder') && !endpoint.endsWith('documents-folder-files')) {
      return { path: null, exists: false };
    }
    const ret = sim[table] || [];
    if (table === 'shipments' && idMatch) {
      const one = (ret as any[]).find((s: any) => s.id === idMatch);
      if (one != null) return one;
      return Promise.reject(new Error('Shipment not found'));
    }
    return ret;
  }

  if (options.method === 'POST' || options.method === 'PUT') {
    let data: any;
    try {
      data = typeof options.body === 'string' ? JSON.parse(options.body) : {};
    } catch {
      return { success: false, message: 'Invalid request body' };
    }
    if (!data || typeof data !== 'object') return { success: false, message: 'Invalid request body' };
    const targetTable = sim[table] as any[];
    
    const index = targetTable.findIndex((item: any) => item.id === (idMatch || data.id));
    if (index > -1) {
      targetTable[index] = { ...targetTable[index], ...data };
    } else {
      targetTable.push(data);
    }
    
    sim.isDirty = true; // Mark as having unsynced local data
    sim.lastSync = new Date().toISOString();
    saveSimData(sim);
    return { success: true, mode: 'BROWSER_PERSISTENT' };
  }

  return [];
}

export const api = {
  /** Login: POST /api/auth/login (no Authorization header). Stores token in localStorage on success. */
  login: (username: string, password: string): Promise<{ success: boolean; token?: string; user?: { id: string; username: string; name: string; role: string; permissions?: string[] }; error?: string }> => {
    const safe = sanitizeEndpoint('auth/login');
    if (!safe) return Promise.reject(new Error('Invalid endpoint'));
    return fetch(`${API_BASE}/${safe}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: String(username ?? ''), password: String(password ?? '') }),
    })
      .then((r) => r.json().catch(() => ({ success: false, error: 'Invalid response from server' })))
      .then((data) => (data && typeof data === 'object' ? data : { success: false, error: 'Invalid response' }));
  },
  /** Permission groups and presets for UI matrix. */
  getPermissionGroups: (): Promise<{ groups: Array<{ id: string; label: string; permissions: string[] }>; presets: Record<string, string[]> }> =>
    fetchApi('permission-groups'),
  /** Current user and fresh permissions from DB. Call after login or to re-sync without logging out. */
  auth: {
    me: (): Promise<{ id: string; username: string; name: string; role: string; permissions: string[]; allowedDomains?: string[] }> =>
      fetchApi('auth/me').then((data: any) => {
        if (!data || typeof data !== 'object') throw new Error('Invalid response from server');
        return {
          id: String(data.id ?? ''),
          username: String(data.username ?? ''),
          name: String(data.name ?? ''),
          role: String(data.role ?? 'VIEWER'),
          permissions: Array.isArray(data.permissions) ? data.permissions : [],
          allowedDomains: Array.isArray(data.allowedDomains) ? data.allowedDomains : undefined,
        };
      }),
  },
  users: {
    list: (): Promise<Array<{ id: string; username: string; name: string; role: string; permissions: string[]; allowedDomains?: string[] }>> =>
      fetchApi('users'),
    create: (data: { username: string; password: string; name?: string; role?: string; allowedDomains?: string[] }): Promise<any> =>
      fetchApi('users', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { username?: string; name?: string; role?: string; allowedDomains?: string[] }): Promise<any> =>
      fetchApi(`users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    updatePassword: (id: string, password: string): Promise<{ success: boolean }> =>
      fetchApi(`users/${id}/password`, { method: 'PATCH', body: JSON.stringify({ password }) }),
    delete: (id: string): Promise<void> =>
      fetchApi(`users/${id}`, { method: 'DELETE' }),
    updatePermissions: (id: string, permissions: string[]): Promise<any> =>
      fetchApi(`users/${id}/permissions`, { method: 'PATCH', body: JSON.stringify({ permissions }) }),
    updateAllowedDomains: (id: string, allowedDomains: string[]): Promise<any> =>
      fetchApi(`users/${id}/allowed-domains`, { method: 'PATCH', body: JSON.stringify({ allowedDomains }) }),
  },
  suppliers: {
    list: () => fetchApi('suppliers'),
    create: (data: any) => fetchApi('suppliers', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => fetchApi(`suppliers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    import: (rows: any[]) => fetchApi('suppliers/import', { method: 'POST', body: JSON.stringify({ rows }) }),
  },
  buyers: {
    list: () => fetchApi('buyers'),
    create: (data: any) => fetchApi('buyers', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => fetchApi(`buyers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    import: (rows: any[]) => fetchApi('buyers/import', { method: 'POST', body: JSON.stringify({ rows }) }),
  },
  shipments: {
    list: () => fetchApi('shipments'),
    get: (id: string): Promise<any> => {
      if (!id || String(id) === 'undefined') return Promise.reject(new Error('Invalid shipment ID'));
      return fetchApi(`shipments/${id}`);
    },
    create: (data: any) => fetchApi('shipments', { method: 'POST', body: JSON.stringify(data) }),
    import: (rows: any[], isExport?: boolean) => fetchApi('shipments/import', { method: 'POST', body: JSON.stringify({ rows, isExport: !!isExport }) }),
    update: (id: string, data: any) => fetchApi(`shipments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    /** PUT with full response for optimistic locking: returns { status, data } so caller can handle 409. */
    updateWithResponse: async (id: string, data: any): Promise<{ status: number; data: any }> => {
      const safe = sanitizeEndpoint(`shipments/${id}`);
      if (!safe) return { status: 400, data: { error: 'Invalid endpoint' } };
      const url = `${API_BASE}/${safe}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
      try {
        const response = await fetch(url, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify(data),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (response.status === 401) {
          if (typeof window !== 'undefined') localStorage.removeItem('token');
          throw new Error('Session expired. Please log in again.');
        }
        let body: any;
        try {
          body = await response.json();
        } catch {
          body = { error: 'Invalid response' };
        }
        return { status: response.status, data: body };
      } catch (err: any) {
        clearTimeout(timeoutId);
        throw err;
      }
    },
    delete: (id: string) => fetchApi(`shipments/${id}`, { method: 'DELETE' }),
    uploadFiles: (id: string, formData: FormData, documentType?: string): Promise<{ success: boolean; filename?: string; error?: string }> => {
      if (!id || String(id) === 'undefined') return Promise.reject(new Error('Invalid shipment ID'));
      const qs = documentType && documentType !== 'Other' ? `?documentType=${encodeURIComponent(documentType)}` : '';
      const url = `${API_BASE}/shipments/${id}/files${qs}`;
      const headers: Record<string, string> = {};
      if (typeof window !== 'undefined') {
        const token = localStorage.getItem('token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
      }
      return fetch(url, { method: 'POST', headers, body: formData }).then(async (r) => {
        let data: any;
        try {
          data = await r.json();
        } catch {
          data = { error: 'Invalid response' };
        }
        if (r.ok) return { success: true, filename: data.filename };
        return { success: false, error: data.error || 'Upload failed' };
      });
    },
    getDocumentsFolder: (id: string) => {
      if (!id || String(id) === 'undefined') return Promise.resolve({ path: null, exists: false });
      return fetchApi(`shipments/${id}/documents-folder`).catch((e) => {
        console.error('getDocumentsFolder failed:', id, e);
        return { path: null, exists: false };
      });
    },
    getDocumentsFolderFiles: (id: string): Promise<{ files: Array<{ name: string } | string> }> => {
      if (!id || String(id) === 'undefined') return Promise.resolve({ files: [] });
      return fetchApi(`shipments/${id}/documents-folder-files`).catch(() => ({ files: [] }));
    },
    /** Authenticated file download; returns blob for use with createObjectURL / download link. */
    downloadFile: (id: string, filename: string): Promise<Blob> => {
      if (!id || !filename) return Promise.reject(new Error('Invalid id or filename'));
      const url = `${API_BASE}/shipments/${id}/files/${encodeURIComponent(filename)}`;
      const headers: Record<string, string> = {};
      if (typeof window !== 'undefined') {
        const token = localStorage.getItem('token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
      }
      return fetch(url, { headers }).then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? 'File not found' : 'Download failed');
        return r.blob();
      });
    },
    deleteFile: (id: string, filename: string): Promise<void> => {
      if (!id || !filename) return Promise.reject(new Error('Invalid id or filename'));
      const url = `${API_BASE}/shipments/${id}/files/${encodeURIComponent(filename)}`;
      return fetch(url, { method: 'DELETE', headers: getAuthHeaders() }).then((r) => {
        if (!r.ok) {
          return r.json().then((j: any) => Promise.reject(new Error(j?.error || 'Delete failed')));
        }
      });
    },
  },
  licences: {
    list: () => fetchApi('licences'),
    create: (data: any) => fetchApi('licences', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => fetchApi(`licences/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => fetchApi(`licences/${id}`, { method: 'DELETE' }),
  },
  lcs: {
    list: () => fetchApi('lcs'),
    create: (data: any) => fetchApi('lcs', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => fetchApi(`lcs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => fetchApi(`lcs/${id}`, { method: 'DELETE' }),
    transactions: (): Promise<any[]> => fetchApi('lc-transactions'),
  },
  materials: {
    list: () => fetchApi('materials'),
    create: (data: any) => fetchApi('materials', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => fetchApi(`materials/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    import: (rows: any[]) => fetchApi('materials/import', { method: 'POST', body: JSON.stringify({ rows }) }),
  },
  domesticBuyers: {
    list: () => fetchApi('domestic-buyers'),
    create: (data: any) => fetchApi('domestic-buyers', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => fetchApi(`domestic-buyers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => fetchApi(`domestic-buyers/${id}`, { method: 'DELETE' }),
    import: (rows: any[]) => fetchApi('domestic-buyers/import', { method: 'POST', body: JSON.stringify({ rows }) }),
  },
  indentProducts: {
    list: () => fetchApi('indent-products'),
    create: (data: any) => fetchApi('indent-products', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => fetchApi(`indent-products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => fetchApi(`indent-products/${id}`, { method: 'DELETE' }),
    import: (rows: any[]) => fetchApi('indent-products/import', { method: 'POST', body: JSON.stringify({ rows }) }),
  },
  indent: {
    getCompanies: () => fetchApi('indent/companies'),
    generate: (payload: any): Promise<Blob> => {
      const safe = sanitizeEndpoint('indent/generate');
      if (!safe) return Promise.reject(new Error('Invalid endpoint'));
      return fetch(`${API_BASE}/${safe}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then((r) => {
        if (!r.ok) return r.json().then((j) => Promise.reject(new Error(j?.error || 'Generate failed')));
        return r.blob();
      });
    },
  },
  /** OCR: extract or upload-and-scan. Long timeout (2 min) so large PDFs/images can finish; do not set Content-Type (FormData sets boundary). */
  ocr: {
    extract: (formData: FormData): Promise<{ success: boolean; data?: any; error?: string }> => {
      const headers: Record<string, string> = {};
      if (typeof window !== 'undefined') {
        const token = localStorage.getItem('token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 min for OCR
      return fetch(`${API_BASE}/ocr/extract`, { method: 'POST', headers, body: formData, signal: controller.signal })
        .then(async (r) => {
          clearTimeout(timeoutId);
          let body: any;
          try {
            body = await r.json();
          } catch {
            throw new Error(r.ok ? 'Invalid response from server' : (r.status === 413 ? 'File too large (max 20 MB).' : `Server error (${r.status}).`));
          }
          if (!r.ok) throw new Error((body && body.error) || `Request failed (${r.status}).`);
          return body;
        })
        .catch((err: any) => {
          clearTimeout(timeoutId);
          if (err.name === 'AbortError') throw new Error('Scan took too long. Try a smaller file or image.');
          throw err;
        });
    },
    uploadAndScan: (formData: FormData, opts?: { docType?: 'BOE' | 'SB'; company?: string }): Promise<{ success: boolean; data?: any; error?: string }> => {
      const headers: Record<string, string> = {};
      if (typeof window !== 'undefined') {
        const token = localStorage.getItem('token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
      }
      const q = new URLSearchParams();
      if (opts?.docType) q.set('docType', opts.docType);
      if (opts?.company) q.set('company', opts.company);
      const qs = q.toString() ? '?' + q.toString() : '';
      const url = `${API_BASE}/ocr/upload-and-scan${qs}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);
      return fetch(url, { method: 'POST', headers, body: formData, signal: controller.signal })
        .then(async (r) => {
          clearTimeout(timeoutId);
          let body: any;
          try {
            body = await r.json();
          } catch {
            throw new Error(r.ok ? 'Invalid response from server' : (r.status === 413 ? 'File too large (max 20 MB).' : `Server error (${r.status}).`));
          }
          if (!r.ok) throw new Error((body && body.error) || `Request failed (${r.status}).`);
          return body;
        })
        .catch((err: any) => {
          clearTimeout(timeoutId);
          if (err.name === 'AbortError') throw new Error('Scan took too long. Try a smaller file or image.');
          throw err;
        });
    },
  },
  system: {
    /** Ping /api/status (no auth) to set server online/offline before any data request. Call on app init. */
    ping: (): Promise<boolean> => {
      if (forceSimulated || typeof window === 'undefined') return Promise.resolve(false);
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 5000);
      return fetch(`${API_BASE}/status`, { method: 'GET', signal: controller.signal })
        .then((res) => {
          clearTimeout(t);
          serverAvailable = true;
          return res.ok;
        })
        .catch(() => {
          clearTimeout(t);
          serverAvailable = false;
          return false;
        });
    },
    getStats: () => fetchApi('stats'),
    setMode: (mode: 'SQL' | 'BROWSER') => { forceSimulated = mode === 'BROWSER'; },
    getMode: () => forceSimulated ? 'BROWSER' : (serverAvailable ? 'SQL' : 'OFFLINE'),
    /** Shipments stored in browser (localStorage). Use after reload to show shipments created while server was unreachable. */
    getLocalShipments: () => (typeof window !== 'undefined' ? getSimData().shipments || [] : []),
    /** Keep a copy of a shipment in browser store so it survives reload and stays visible until server has it. */
    addLocalShipment: (shipment: any) => {
      if (typeof window === 'undefined') return;
      const sim = getSimData();
      const idx = (sim.shipments || []).findIndex((s: any) => s.id === shipment.id);
      if (idx >= 0) sim.shipments[idx] = shipment; else sim.shipments = [...(sim.shipments || []), shipment];
      sim.isDirty = true;
      saveSimData(sim);
    },
    /** Disabled: pushing localStorage to server would overwrite server data with stale local data. No conflict resolution implemented. */
    syncToSQL: async () => {
      throw new Error(
        'Offline sync is disabled. Data entered while the server was ' +
        'unreachable has not been saved to the database. ' +
        'Please contact your administrator to restart the server.'
      );
    },
    reset: () => {
      localStorage.removeItem(SIM_KEY);
      window.location.reload();
    }
  },
  auditLogs: {
    list: (params?: { userId?: string; action?: string; targetId?: string; from?: string; to?: string; limit?: number }): Promise<any[]> => {
      const q = new URLSearchParams();
      if (params?.userId) q.set('userId', params.userId);
      if (params?.action) q.set('action', params.action);
      if (params?.targetId) q.set('targetId', params.targetId);
      if (params?.from) q.set('from', params.from);
      if (params?.to) q.set('to', params.to);
      if (params?.limit != null) q.set('limit', String(params.limit));
      const qs = q.toString();
      return fetchApi('audit-logs', qs ? { queryString: qs } : {});
    },
    exportAndArchive: (params?: { olderThanDays?: number }): Promise<{ success: boolean; count: number; filePath: string | null }> =>
      fetchApi('audit-logs/export-and-archive', { method: 'POST', body: JSON.stringify(params || {}) }),
  }
};
