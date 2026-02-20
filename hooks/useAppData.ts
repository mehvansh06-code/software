import { useState, useEffect, useCallback, useRef } from 'react';
import { User, Supplier, Shipment, Licence, LetterOfCredit, AppDomain, Buyer } from '../types';
import { api } from '../api';
import { SAMPLE_LICENCES, SAMPLE_LCS, SAMPLE_EXPORT_LCS, SAMPLE_BUYERS, SAMPLE_SHIPMENTS } from '../sampleData';

export interface UseAppDataReturn {
  data: {
    user: User | null;
    domain: AppDomain | null;
    suppliers: Supplier[];
    buyers: Buyer[];
    shipments: Shipment[];
    licences: Licence[];
    lcs: LetterOfCredit[];
    connectionMode: 'SQL' | 'OFFLINE';
    isLoading: boolean;
    refreshingUserForSelector?: boolean;
  };
  actions: {
    setDomain: (domain: AppDomain | null) => void;
    handleLogin: (u: User) => void;
    handleLogout: () => void;
    selectDomain: (d: AppDomain) => void;
    refreshData: () => Promise<void>;
    handleAddSupplier: (s: Supplier) => Promise<void>;
    handleUpdateSupplier: (updated: Supplier) => Promise<void>;
    handleAddBuyer: (b: Buyer) => Promise<void>;
    handleUpdateBuyer: (updated: Buyer) => Promise<void>;
    handleAddShipment: (sh: Shipment) => Promise<void>;
    handleUpdateShipment: (updated: Shipment) => Promise<void>;
    handleDeleteShipment: (id: string) => Promise<void>;
    handleAddLicence: (licence: Licence) => Promise<void>;
    handleUpdateLicence: (updated: Licence) => Promise<void>;
    handleDeleteLicence: (id: string) => Promise<void>;
    handleUpdateLC: (updated: LetterOfCredit) => Promise<void>;
    handleDeleteLC: (id: string) => Promise<void>;
  };
}

export function useAppData(): UseAppDataReturn {
  const [user, setUser] = useState<User | null>(null);
  const [domain, setDomain] = useState<AppDomain | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [licences, setLicences] = useState<Licence[]>([]);
  const [lcs, setLcs] = useState<LetterOfCredit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionMode, setConnectionMode] = useState<'SQL' | 'OFFLINE'>('SQL');
  const [refreshingUserForSelector, setRefreshingUserForSelector] = useState(false);
  const selectorRefetchDone = useRef(false);
  const dataChangedDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLoadAllDataRef = useRef(0);
  const loadAllDataRef = useRef<(() => Promise<void>) | null>(null);
  const DATA_CHANGED_DEBOUNCE_MS = 600;
  const LOAD_ALL_DATA_THROTTLE_MS = 1200;

  const loadAllData = useCallback(async () => {
    lastLoadAllDataRef.current = Date.now();
    try {
      const [s, b, sh, l, lc] = await Promise.all([
        api.suppliers.list().catch(() => []),
        api.buyers.list().catch(() => []),
        api.shipments.list().catch(() => []),
        api.licences.list().catch(() => []),
        api.lcs.list().catch(() => []),
      ]);
      setSuppliers(Array.isArray(s) ? s : []);
      const buyersFromApi = Array.isArray(b) ? b : [];
      setBuyers(buyersFromApi.length > 0 ? buyersFromApi : SAMPLE_BUYERS);
      const fromApi = Array.isArray(sh) ? sh : [];
      const baseShipments = fromApi.length > 0 ? fromApi : SAMPLE_SHIPMENTS;
      const fromLocal = api.system.getMode() === 'OFFLINE' ? api.system.getLocalShipments() : [];
      setShipments(prev => {
        const inBase = (id: string) => baseShipments.some((x: Shipment) => x.id === id);
        const fromPrev = prev.filter(p => !inBase(p.id));
        const fromStorage = Array.isArray(fromLocal) ? fromLocal.filter((p: Shipment) => !inBase(p.id)) : [];
        const merged = [...baseShipments];
        const seen = new Set(baseShipments.map((x: Shipment) => x.id));
        [...fromStorage, ...fromPrev].forEach((p: Shipment) => {
          if (!seen.has(p.id)) { seen.add(p.id); merged.push(p); }
        });
        return merged;
      });
      const licencesFromApi = Array.isArray(l) ? l : [];
      const lcsFromApi = Array.isArray(lc) ? lc : [];
      setLicences(licencesFromApi.length > 0 ? licencesFromApi : SAMPLE_LICENCES);
      setLcs(lcsFromApi.length > 0 ? lcsFromApi : [...SAMPLE_LCS, ...SAMPLE_EXPORT_LCS]);
      setConnectionMode(api.system.getMode() as 'SQL' | 'OFFLINE');
    } catch (err) {
      console.error('Data refresh failed:', err);
      setConnectionMode(api.system.getMode() as 'SQL' | 'OFFLINE');
    }
  }, []);

  // Keep a stable ref to the latest loadAllData implementation
  loadAllDataRef.current = loadAllData;

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser && savedUser !== 'undefined' && savedUser !== 'null') {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        console.warn('User storage corrupt', e);
      }
    }

    const savedDomain = localStorage.getItem('domain');
    if (savedDomain && savedDomain !== 'undefined' && savedDomain !== 'null') {
      setDomain(savedDomain as AppDomain);
    }

    const init = async () => {
      // Set server online/offline from health check first (no auth), so UI shows correct status
      await api.system.ping();
      setConnectionMode(api.system.getMode() as 'SQL' | 'OFFLINE');
      await loadAllData();
      setConnectionMode(api.system.getMode() as 'SQL' | 'OFFLINE');
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      if (token) {
        try {
          const me = await api.auth.me();
          const updated: User = {
            id: me.id,
            username: me.username,
            name: me.name,
            role: me.role as import('../types').UserRole,
            permissions: me.permissions,
            allowedDomains: Array.isArray(me.allowedDomains) ? me.allowedDomains as AppDomain[] : undefined,
          };
          setUser(updated);
          localStorage.setItem('user', JSON.stringify(updated));
          // If user has restricted screens, clear saved domain if it's no longer allowed
          if (Array.isArray(updated.allowedDomains) && updated.allowedDomains.length > 0) {
            const saved = typeof window !== 'undefined' ? localStorage.getItem('domain') : null;
            if (saved && saved !== 'undefined' && saved !== 'null' && !updated.allowedDomains.includes(saved as AppDomain)) {
              localStorage.removeItem('domain');
              setDomain(null);
            }
          }
        } catch (e) {
          // Session invalid or API failed: clear token and user so UI shows login
          if (typeof window !== 'undefined') {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            localStorage.removeItem('domain');
          }
          setUser(null);
          setDomain(null);
        }
      }
      setIsLoading(false);
    };
    init();
  }, [loadAllData]);

  // When domain is null (hub selector screen), refetch user so allowedDomains is always fresh
  useEffect(() => {
    if (!user || domain !== null) {
      selectorRefetchDone.current = false;
      return;
    }
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) return;
    if (selectorRefetchDone.current) return;
    selectorRefetchDone.current = true;
    setRefreshingUserForSelector(true);
    api.auth.me()
      .then((me) => {
        const updated: User = {
          id: me.id,
          username: me.username,
          name: me.name,
          role: me.role as import('../types').UserRole,
          permissions: me.permissions,
          allowedDomains: Array.isArray(me.allowedDomains) ? me.allowedDomains as AppDomain[] : undefined,
        };
        setUser(updated);
        localStorage.setItem('user', JSON.stringify(updated));
      })
      .catch(() => {})
      .finally(() => setRefreshingUserForSelector(false));
  }, [user, domain]);

  useEffect(() => {
    if (!user || !domain) return;
    // WebSocket URL from api.ts: uses VITE_API_HOST (https→wss, e.g. wss://api.eiofficial.com) or fallback
    const wsUrl = getWebSocketUrl();
    const wsRef = { current: null as WebSocket | null };
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let delay = 2000;
    const connect = () => {
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'data-changed') {
            if (dataChangedDebounceRef.current) clearTimeout(dataChangedDebounceRef.current);
            dataChangedDebounceRef.current = setTimeout(() => {
              dataChangedDebounceRef.current = null;
              if (Date.now() - lastLoadAllDataRef.current < LOAD_ALL_DATA_THROTTLE_MS) return;
              lastLoadAllDataRef.current = Date.now();
              loadAllDataRef.current();
            }, DATA_CHANGED_DEBOUNCE_MS);
          }
        } catch (_) {}
      };
      socket.onerror = () => { /* reconnection handled on close */ };
      socket.onclose = () => {
        if (wsRef.current !== socket) return;
        reconnectTimer = setTimeout(() => {
          delay = Math.min(delay * 1.2, 30000);
          connect();
        }, delay);
      };
      socket.onopen = () => { delay = 2000; };
    };
    connect();
    return () => {
      if (dataChangedDebounceRef.current) clearTimeout(dataChangedDebounceRef.current);
      clearTimeout(reconnectTimer);
      const toClose = wsRef.current;
      wsRef.current = null;
      if (toClose) {
        const closeWs = () => { try { toClose.close(); } catch (_) {} };
        setTimeout(closeWs, 150);
      }
    };
  }, [user, domain]);

  const handleAddSupplier = useCallback(async (s: Supplier) => {
    await api.suppliers.create(s);
    setSuppliers((prev) => [...prev, s]);
    try {
      await loadAllData();
    } catch {
      // Keep optimistic update if refetch fails (e.g. permission or offline)
    }
  }, [loadAllData]);

  const handleUpdateSupplier = useCallback(async (updated: Supplier) => {
    await api.suppliers.update(updated.id, updated);
    await loadAllData();
  }, [loadAllData]);

  const handleAddBuyer = useCallback(async (b: Buyer) => {
    await api.buyers.create(b);
    await loadAllData();
  }, [loadAllData]);

  const handleUpdateBuyer = useCallback(async (updated: Buyer) => {
    await api.buyers.update(updated.id, updated);
    await loadAllData();
  }, [loadAllData]);

  const handleAddShipment = useCallback(async (sh: Shipment) => {
    await api.shipments.create(sh);
    api.system.addLocalShipment(sh);
    await loadAllData();
  }, [loadAllData]);

  const handleUpdateShipment = useCallback(async (updated: Shipment) => {
    await api.shipments.update(updated.id, updated);
    await loadAllData();
  }, [loadAllData]);

  const handleDeleteShipment = useCallback(async (id: string) => {
    try {
      await api.shipments.delete(id);
      setShipments(prev => prev.filter(sh => sh.id !== id));
    } catch (e) {
      console.warn('Delete shipment failed:', id, e);
      throw e;
    } finally {
      await loadAllData();
    }
  }, [loadAllData]);

  const handleAddLicence = useCallback(async (licence: Licence) => {
    await api.licences.create(licence);
    await loadAllData();
  }, [loadAllData]);

  const handleUpdateLicence = useCallback(async (updated: Licence) => {
    await api.licences.update(updated.id, updated);
    setLicences(prev => prev.map(l => (l.id === updated.id ? updated : l)));
    await loadAllData();
  }, [loadAllData]);

  const handleDeleteLicence = useCallback(async (id: string) => {
    await api.licences.delete(id);
    setLicences(prev => prev.filter(l => l.id !== id));
    await loadAllData();
  }, [loadAllData]);

  const handleUpdateLC = useCallback(async (updated: LetterOfCredit) => {
    await api.lcs.update(updated.id, updated);
    setLcs(prev => prev.map(l => (l.id === updated.id ? updated : l)));
    await loadAllData();
  }, [loadAllData]);

  const handleDeleteLC = useCallback(async (id: string) => {
    await api.lcs.delete(id);
    setLcs(prev => prev.filter(l => l.id !== id));
    await loadAllData();
  }, [loadAllData]);

  const handleLogin = useCallback((u: User) => {
    setUser(u);
    localStorage.setItem('user', JSON.stringify(u));
  }, []);

  const handleLogout = useCallback(() => {
    setUser(null);
    setDomain(null);
    localStorage.removeItem('user');
    localStorage.removeItem('domain');
    localStorage.removeItem('token');
  }, []);

  const setDomainWithStorage = useCallback((d: AppDomain | null) => {
    setDomain(d);
    if (typeof window !== 'undefined') {
      if (d === null) localStorage.removeItem('domain');
      else localStorage.setItem('domain', d);
    }
  }, []);

  const selectDomain = useCallback((d: AppDomain) => {
    setDomainWithStorage(d);
  }, [setDomainWithStorage]);

  return {
  data: {
    user,
    domain,
    suppliers,
    buyers,
    shipments,
    licences,
    lcs,
    connectionMode,
    isLoading,
    refreshingUserForSelector,
  },
    actions: {
      setDomain: setDomainWithStorage,
      handleLogin,
      handleLogout,
      selectDomain,
      refreshData: loadAllData,
      handleAddSupplier,
      handleUpdateSupplier,
      handleAddBuyer,
      handleUpdateBuyer,
      handleAddShipment,
      handleUpdateShipment,
      handleDeleteShipment,
      handleAddLicence,
      handleUpdateLicence,
      handleDeleteLicence,
      handleUpdateLC,
      handleDeleteLC,
    },
  };
}
