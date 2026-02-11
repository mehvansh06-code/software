
/**
 * DOUBLE-LOCK HYBRID SQL BRIDGE
 * Primary: Relational SQLite (Local Node.js)
 * Secondary: Persistent Browser Ledger (LocalStorage)
 */

const API_BASE = `${typeof window !== 'undefined' ? window.location.protocol : 'http:'}//${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:3001/api`;
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
  const saved = localStorage.getItem(SIM_KEY);
  if (saved) {
    const data = JSON.parse(saved);
    if (!data.materials) data.materials = [];
    return data;
  }
  return {
    suppliers: [],
    buyers: [],
    shipments: [],
    licences: [],
    lcs: [],
    materials: [],
    lastSync: new Date().toISOString(),
    isDirty: false
  };
};

const saveSimData = (data: any) => {
  localStorage.setItem(SIM_KEY, JSON.stringify(data));
};

let serverAvailable = false;
let forceSimulated = false;

async function fetchApi(endpoint: string, options: RequestInit = {}) {
  const safeEndpoint = sanitizeEndpoint(endpoint);
  if (!safeEndpoint) return Promise.reject(new Error('Invalid endpoint'));

  if (forceSimulated) return handleSimulatedRequest(safeEndpoint, options);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const response = await fetch(`${API_BASE}/${safeEndpoint}`, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });

    clearTimeout(timeoutId);
    if (!response.ok) throw new Error('Offline');

    serverAvailable = true;
    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    serverAvailable = false;
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
  suppliers: {
    list: () => fetchApi('suppliers'),
    create: (data: any) => fetchApi('suppliers', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => fetchApi(`suppliers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
  buyers: {
    list: () => fetchApi('buyers'),
    create: (data: any) => fetchApi('buyers', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => fetchApi(`buyers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
  shipments: {
    list: () => fetchApi('shipments'),
    create: (data: any) => fetchApi('shipments', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => fetchApi(`shipments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => fetchApi(`shipments/${id}`, { method: 'DELETE' }),
    getDocumentsFolder: (id: string) => {
      if (!id || String(id) === 'undefined') return Promise.resolve({ path: null, exists: false });
      return fetchApi(`shipments/${id}/documents-folder`).catch((e) => {
        console.error('getDocumentsFolder failed:', id, e);
        return { path: null, exists: false };
      });
    },
    getDocumentsFolderFiles: (id: string): Promise<{ files: string[] }> => {
      if (!id || String(id) === 'undefined') return Promise.resolve({ files: [] });
      return fetchApi(`shipments/${id}/documents-folder-files`).catch(() => ({ files: [] }));
    },
    openDocumentsFolder: (id: string, shipment?: any): Promise<{ success: boolean; message: string; [k: string]: unknown }> => {
      if (!id || String(id) === 'undefined') {
        return Promise.resolve({ success: false, message: 'Invalid shipment ID' });
      }
      if (forceSimulated) {
        if (typeof window !== 'undefined') {
          alert('Open Folder is not available in offline / browser-only mode. Switch to SQL mode (backend running) to open document folders on this machine.');
        }
        return Promise.resolve({ success: false, message: 'Offline mode: folders cannot be opened.' });
      }
      const url = `${API_BASE}/shipments/${id}/open-documents-folder`;
      const body = shipment != null ? JSON.stringify({ shipment }) : '{}';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal
      }).then(async (r) => {
        clearTimeout(timeoutId);
        let data: { success?: boolean; message?: string; error?: string; [k: string]: unknown };
        try {
          data = await r.json();
        } catch {
          data = { success: false, message: r.status === 500 ? 'Server error. Try again or check the backend.' : 'Invalid response from server' };
        }
        const message = data.message ?? data.error ?? (r.ok ? 'OK' : 'Could not open folder');
        return { success: r.ok && (data.success !== false), message, ...data };
      }).catch((err) => {
        clearTimeout(timeoutId);
        const isTimeout = err?.name === 'AbortError';
        const message = isTimeout ? 'Request timed out. Check the backend and try again.' : (err?.message || 'Could not open folder.');
        if (typeof window !== 'undefined') {
          alert('Server is unreachable. Start the backend (node server.js) and try again.');
        }
        return { success: false, message };
      });
    },
  },
  licences: {
    list: () => fetchApi('licences'),
    create: (data: any) => fetchApi('licences', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => fetchApi(`licences/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
  lcs: {
    list: () => fetchApi('lcs'),
    create: (data: any) => fetchApi('lcs', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => fetchApi(`lcs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    transactions: (): Promise<any[]> => fetchApi('lc-transactions'),
  },
  materials: {
    list: () => fetchApi('materials'),
    create: (data: any) => fetchApi('materials', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => fetchApi(`materials/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
  system: {
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
      return true;
    },
    reset: () => {
      localStorage.removeItem(SIM_KEY);
      window.location.reload();
    }
  }
};
