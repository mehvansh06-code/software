import React, { useState, useEffect, useCallback } from 'react';
import { HashRouter, Routes, Route, Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { User, UserRole, Supplier, Shipment, Licence, LetterOfCredit, AppDomain, Buyer } from './types';
import Login from './pages/Login';
import DomainSelector from './pages/DomainSelector';
import Dashboard from './pages/Dashboard';
import ExportDashboard from './pages/ExportDashboard';
import SupplierMaster from './pages/SupplierMaster';
import BuyerMaster from './pages/BuyerMaster';
import ShipmentMaster from './pages/ShipmentMaster';
import ShipmentDetails from './pages/ShipmentDetails';
import LicenceTracker from './pages/LicenceTracker';
import LCTracker from './pages/LCTracker';
import ExportLCTracker from './pages/ExportLCTracker';
import MaterialsMaster from './pages/MaterialsMaster';
import { api } from './api';
import { 
  LayoutDashboard, 
  Truck, 
  Users, 
  LogOut, 
  Package,
  Award,
  CreditCard,
  Grid,
  TrendingUp,
  ShoppingCart,
  Database,
  WifiOff,
  RefreshCw
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  domain: AppDomain;
  user: User;
  setDomain: (domain: AppDomain | null) => void;
  onLogout: () => void;
  connectionMode?: 'SQL' | 'OFFLINE';
  onRefreshData?: () => Promise<void>;
}

const Layout: React.FC<LayoutProps> = ({ children, domain, user, setDomain, onLogout, connectionMode = 'SQL', onRefreshData }) => {
  const location = useLocation();
  const isImport = domain === AppDomain.IMPORT;
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStats, setSyncStats] = useState<{ isDirty?: boolean }>({});

  useEffect(() => {
    if (connectionMode !== 'OFFLINE') return;
    api.system.getStats().then((s: any) => setSyncStats({ isDirty: s?.isDirty })).catch(() => setSyncStats({}));
  }, [connectionMode]);

  const handleSyncToServer = async () => {
    if (!onRefreshData) return;
    setIsSyncing(true);
    try {
      const ok = await api.system.syncToSQL();
      if (ok) await onRefreshData();
    } finally {
      setIsSyncing(false);
      setSyncStats({ isDirty: false });
    }
  };

  const navItems = isImport ? [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard, roles: [UserRole.MANAGEMENT, UserRole.CHECKER, UserRole.EXECUTIONER] },
    { path: '/suppliers', label: 'Supplier Master', icon: Users, roles: [UserRole.MANAGEMENT, UserRole.CHECKER, UserRole.EXECUTIONER] },
    { path: '/materials', label: 'Materials Master', icon: Package, roles: [UserRole.MANAGEMENT, UserRole.CHECKER, UserRole.EXECUTIONER] },
    { path: '/shipments', label: 'Shipment Master', icon: Truck, roles: [UserRole.MANAGEMENT, UserRole.CHECKER, UserRole.EXECUTIONER] },
    { path: '/licences', label: 'Licence Tracker', icon: Award, roles: [UserRole.MANAGEMENT, UserRole.CHECKER, UserRole.EXECUTIONER] },
    { path: '/lcs', label: 'LC Tracker', icon: CreditCard, roles: [UserRole.MANAGEMENT, UserRole.CHECKER, UserRole.EXECUTIONER] },
  ] : [
    { path: '/', label: 'Export Dashboard', icon: TrendingUp, roles: [UserRole.MANAGEMENT, UserRole.CHECKER, UserRole.EXECUTIONER] },
    { path: '/buyers', label: 'Buyer Master', icon: ShoppingCart, roles: [UserRole.MANAGEMENT, UserRole.CHECKER, UserRole.EXECUTIONER] },
    { path: '/export-shipments', label: 'Export Shipments', icon: Truck, roles: [UserRole.MANAGEMENT, UserRole.CHECKER, UserRole.EXECUTIONER] },
    { path: '/export-lcs', label: 'LC Tracker', icon: CreditCard, roles: [UserRole.MANAGEMENT, UserRole.CHECKER, UserRole.EXECUTIONER] },
  ];

  return (
    <div className="flex h-screen bg-slate-50">
      <div className={`w-64 flex flex-col transition-colors duration-500 ${isImport ? 'bg-indigo-900' : 'bg-amber-900'}`}>
        <div className="p-6 flex items-center gap-3">
          <div className="bg-white p-2 rounded-lg">
            <Package className={isImport ? 'text-indigo-900' : 'text-amber-900'} size={24} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">Flotex {isImport ? 'IMP' : 'EXP'}</h1>
        </div>
        
        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          {connectionMode === 'OFFLINE' ? (
            <div className="px-4 py-3 mb-6 bg-amber-500/20 rounded-xl border border-amber-400/30">
              <div className="flex items-center gap-2 text-amber-300">
                <WifiOff size={12} />
                <span className="text-[10px] font-black uppercase tracking-[0.2em]">Offline (browser only)</span>
              </div>
              <p className="text-[9px] text-white/60 mt-1">Data is saved only in this browser. It will not appear on localhost or other devices until you sync.</p>
              <p className="text-[9px] text-white/50 mt-1">Start the backend: <code className="bg-black/20 px-1 rounded">node server.js</code></p>
              <button type="button" onClick={handleSyncToServer} disabled={isSyncing} className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-amber-500/30 hover:bg-amber-500/50 text-amber-200 text-[10px] font-black uppercase tracking-wider disabled:opacity-50">
                <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} /> {isSyncing ? 'Syncing…' : 'Sync to server now'}
              </button>
            </div>
          ) : (
            <div className="px-4 py-2 mb-6 bg-white/5 rounded-xl border border-white/10">
              <div className="flex items-center gap-2 text-emerald-400">
                <Database size={12} className="animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em]">Ledger: Active</span>
              </div>
              <p className="text-[9px] text-white/40 mt-1">High-speed sync active · Real-time across tabs</p>
            </div>
          )}

          <button onClick={() => setDomain(null)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-white/60 hover:bg-white/10 mb-4">
            <Grid size={20} /> <span className="font-medium text-sm">Switch Domain</span>
          </button>
          <div className="h-px bg-white/10 my-4 mx-4" />
          {navItems.filter(item => item.roles.includes(user.role)).map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link key={item.path} to={item.path} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  isActive ? (isImport ? 'bg-indigo-800 text-white shadow-lg' : 'bg-amber-800 text-white shadow-lg') : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`}>
                <Icon size={20} /> <span className="font-medium text-sm">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 px-4 py-3 mb-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white uppercase ${isImport ? 'bg-indigo-700' : 'bg-amber-700'}`}>
              {user.name.charAt(0)}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold truncate w-32 text-white">{user.name}</span>
              <span className="text-[9px] uppercase tracking-wider text-white/50 font-black">{user.role}</span>
            </div>
          </div>
          <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white px-4 py-2.5 rounded-xl transition-all">
            <LogOut size={16} /> <span className="font-bold text-xs uppercase tracking-widest">Sign Out</span>
          </button>
        </div>
      </div>
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-6xl mx-auto">{children}</div>
      </main>
    </div>
  );
};

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [domain, setDomain] = useState<AppDomain | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [licences, setLicences] = useState<Licence[]>([]);
  const [lcs, setLcs] = useState<LetterOfCredit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionMode, setConnectionMode] = useState<'SQL' | 'OFFLINE'>('SQL');

  const loadAllData = useCallback(async () => {
    try {
      const [s, b, sh, l, lc] = await Promise.all([
        api.suppliers.list(),
        api.buyers.list(),
        api.shipments.list(),
        api.licences.list(),
        api.lcs.list()
      ]);
      setSuppliers(s || []);
      setBuyers(b || []);
      const fromApi = sh || [];
      const fromLocal = api.system.getLocalShipments();
      setShipments(prev => {
        const inApi = (id: string) => fromApi.some((x: Shipment) => x.id === id);
        const fromPrev = prev.filter(p => !inApi(p.id));
        const fromStorage = Array.isArray(fromLocal) ? fromLocal.filter((p: Shipment) => !inApi(p.id)) : [];
        const merged = [...fromApi];
        const seen = new Set(fromApi.map((x: Shipment) => x.id));
        [...fromStorage, ...fromPrev].forEach((p: Shipment) => {
          if (!seen.has(p.id)) { seen.add(p.id); merged.push(p); }
        });
        return merged;
      });
      setLicences(l || []);
      setLcs(lc || []);
      setConnectionMode(api.system.getMode() as 'SQL' | 'OFFLINE');
    } catch (err) {
      console.error('Data refresh failed:', err);
      setConnectionMode(api.system.getMode() as 'SQL' | 'OFFLINE');
    }
  }, []);

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser && savedUser !== 'undefined' && savedUser !== 'null') {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) { console.warn("User storage corrupt", e); }
    }

    const savedDomain = localStorage.getItem('domain');
    if (savedDomain && savedDomain !== 'undefined' && savedDomain !== 'null') {
      setDomain(savedDomain as AppDomain);
    }

    const init = async () => {
      await loadAllData();
      setIsLoading(false);
    };
    init();
  }, [loadAllData]);

  useEffect(() => {
    if (!user || !domain) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.hostname}:3001`;
    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let delay = 2000;
    const connect = () => {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'data-changed') loadAllData();
        } catch (_) {}
      };
      ws.onerror = () => { /* reconnection handled on close */ };
      ws.onclose = () => {
        reconnectTimer = setTimeout(() => {
          delay = Math.min(delay * 1.2, 30000);
          connect();
        }, delay);
      };
      ws.onopen = () => { delay = 2000; };
    };
    connect();
    return () => {
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [user, domain, loadAllData]);

  const handleAddSupplier = async (s: Supplier) => {
    await api.suppliers.create(s);
    setSuppliers(prev => [...prev, s]);
  };

  const handleUpdateSupplier = async (updated: Supplier) => {
    await api.suppliers.update(updated.id, updated);
    setSuppliers(prev => prev.map(s => s.id === updated.id ? updated : s));
  };

  const handleAddBuyer = async (b: Buyer) => {
    await api.buyers.create(b);
    setBuyers(prev => [...prev, b]);
  };

  const handleUpdateBuyer = async (updated: Buyer) => {
    await api.buyers.update(updated.id, updated);
    setBuyers(prev => prev.map(b => b.id === updated.id ? updated : b));
  };

  const handleAddShipment = async (sh: Shipment) => {
    try {
      await api.shipments.create(sh);
      api.system.addLocalShipment(sh);
      setShipments(prev => [...prev, sh]);
    } catch (err) {
      throw err;
    }
  };

  const handleUpdateShipment = async (updated: Shipment) => {
    await api.shipments.update(updated.id, updated);
    setShipments(prev => prev.map(sh => sh.id === updated.id ? updated : sh));
  };

  const handleDeleteShipment = async (id: string) => {
    await api.shipments.delete(id);
    setShipments(prev => prev.filter(sh => sh.id !== id));
  };

  const handleUpdateLicence = async (updated: Licence) => {
    await api.licences.update(updated.id, updated);
    setLicences(prev => prev.map(l => l.id === updated.id ? updated : l));
  };

  const handleUpdateLC = async (updated: LetterOfCredit) => {
    await api.lcs.update(updated.id, updated);
    setLcs(prev => prev.map(l => l.id === updated.id ? updated : l));
  };

  const handleLogin = (u: User) => {
    setUser(u);
    localStorage.setItem('user', JSON.stringify(u));
  };

  const handleLogout = () => {
    setUser(null);
    setDomain(null);
    localStorage.removeItem('user');
    localStorage.removeItem('domain');
  };

  const selectDomain = (d: AppDomain) => {
    setDomain(d);
    localStorage.setItem('domain', d);
  };

  if (isLoading) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.2em] animate-pulse">Syncing Secure Nodes...</p>
      </div>
    </div>
  );

  if (!user) return <Login onLogin={handleLogin} />;
  if (!domain) return <DomainSelector onSelect={selectDomain} userName={user.name} role={user.role} onLogout={handleLogout} />;

  return (
    <HashRouter>
      <DomainRoutes domain={domain} user={user} setDomain={setDomain} onLogout={handleLogout}
        shipments={shipments} suppliers={suppliers} buyers={buyers} licences={licences} lcs={lcs}
        connectionMode={connectionMode} onRefreshData={loadAllData}
        handleAddShipment={handleAddShipment} handleUpdateShipment={handleUpdateShipment} handleDeleteShipment={handleDeleteShipment}
        handleAddSupplier={handleAddSupplier} handleUpdateSupplier={handleUpdateSupplier}
        handleAddBuyer={handleAddBuyer} handleUpdateBuyer={handleUpdateBuyer}
        handleUpdateLicence={handleUpdateLicence} handleUpdateLC={handleUpdateLC}
      />
    </HashRouter>
  );
};

const exportPathMatch = (path: string) => ['/', '/buyers', '/export-shipments', '/export-lcs', '/shipments'].includes(path) || /^\/shipments\/[^/]+$/.test(path);

function DomainRoutes(props: {
  domain: AppDomain;
  user: User;
  setDomain: (d: AppDomain | null) => void;
  onLogout: () => void;
  shipments: Shipment[];
  suppliers: Supplier[];
  buyers: Buyer[];
  licences: Licence[];
  lcs: LetterOfCredit[];
  connectionMode: 'SQL' | 'OFFLINE';
  onRefreshData: () => Promise<void>;
  handleAddShipment: (sh: Shipment) => Promise<void>;
  handleUpdateShipment: (s: Shipment) => void;
  handleDeleteShipment: (id: string) => Promise<void>;
  handleAddSupplier: (s: Supplier) => Promise<void>;
  handleUpdateSupplier: (s: Supplier) => Promise<void>;
  handleAddBuyer: (b: Buyer) => Promise<void>;
  handleUpdateBuyer: (b: Buyer) => Promise<void>;
  handleUpdateLicence: (l: Licence) => Promise<void>;
  handleUpdateLC: (l: LetterOfCredit) => Promise<void>;
}) {
  const { domain, user, setDomain, onLogout, shipments, suppliers, buyers, licences, lcs,
    connectionMode, onRefreshData, handleAddShipment, handleUpdateShipment, handleDeleteShipment, handleAddSupplier, handleUpdateSupplier,
    handleAddBuyer, handleUpdateBuyer, handleUpdateLicence, handleUpdateLC } = props;
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const path = location.pathname || '/';
    const match = domain === AppDomain.EXPORT ? exportPathMatch(path) : true;
    if (domain === AppDomain.EXPORT && !match) {
      navigate('/', { replace: true });
    }
  }, [domain, location.pathname, navigate]);

  return (
    <Routes>
      {domain === AppDomain.IMPORT ? (
        <>
          <Route path="/" element={<Layout user={user} domain={domain} setDomain={setDomain} onLogout={onLogout} connectionMode={connectionMode} onRefreshData={onRefreshData}><Dashboard shipments={shipments} suppliers={suppliers} licences={licences} lcs={lcs} /></Layout>} />
            <Route path="/suppliers" element={<Layout user={user} domain={domain} setDomain={setDomain} onLogout={onLogout} connectionMode={connectionMode} onRefreshData={onRefreshData}><SupplierMaster suppliers={suppliers} user={user} onUpdateItem={handleUpdateSupplier} onAddItem={handleAddSupplier} /></Layout>} />
            <Route path="/materials" element={<Layout user={user} domain={domain} setDomain={setDomain} onLogout={onLogout} connectionMode={connectionMode} onRefreshData={onRefreshData}><MaterialsMaster /></Layout>} />
            <Route path="/shipments" element={<Layout user={user} domain={domain} setDomain={setDomain} onLogout={onLogout} connectionMode={connectionMode} onRefreshData={onRefreshData}><ShipmentMaster shipments={shipments} suppliers={suppliers} buyers={[]} user={user} onAddShipment={handleAddShipment} onUpdateShipment={handleUpdateShipment} onDeleteShipment={handleDeleteShipment} /></Layout>} />
            <Route path="/shipments/:id" element={<Layout user={user} domain={domain} setDomain={setDomain} onLogout={onLogout} connectionMode={connectionMode} onRefreshData={onRefreshData}><ShipmentDetails shipments={shipments} suppliers={suppliers} buyers={buyers} licences={licences} lcs={lcs} onUpdate={handleUpdateShipment} onDelete={handleDeleteShipment} onUpdateLC={handleUpdateLC} user={user} /></Layout>} />
            <Route path="/licences" element={<Layout user={user} domain={domain} setDomain={setDomain} onLogout={onLogout} connectionMode={connectionMode} onRefreshData={onRefreshData}><LicenceTracker licences={licences} shipments={shipments} onUpdateItem={handleUpdateLicence} onUpdateShipment={handleUpdateShipment} /></Layout>} />
          <Route path="/lcs" element={<Layout user={user} domain={domain} setDomain={setDomain} onLogout={onLogout} connectionMode={connectionMode} onRefreshData={onRefreshData}><LCTracker lcs={lcs} suppliers={suppliers} onUpdateItem={handleUpdateLC} /></Layout>} />
          <Route path="/export-shipments" element={<Navigate to="/shipments" replace />} />
        </>
      ) : (
        <>
          <Route path="/" element={<Layout user={user} domain={domain} setDomain={setDomain} onLogout={onLogout} connectionMode={connectionMode} onRefreshData={onRefreshData}><ExportDashboard shipments={shipments} buyers={buyers} licences={licences} /></Layout>} />
          <Route path="/buyers" element={<Layout user={user} domain={domain} setDomain={setDomain} onLogout={onLogout} connectionMode={connectionMode} onRefreshData={onRefreshData}><BuyerMaster buyers={buyers} user={user} onUpdateItem={handleUpdateBuyer} onAddItem={handleAddBuyer} /></Layout>} />
          <Route path="/shipments" element={<Navigate to="/export-shipments" replace />} />
          <Route path="/export-shipments" element={<Layout user={user} domain={domain} setDomain={setDomain} onLogout={onLogout} connectionMode={connectionMode} onRefreshData={onRefreshData}><ShipmentMaster isExport shipments={shipments} suppliers={[]} buyers={buyers} user={user} onAddShipment={handleAddShipment} onUpdateShipment={handleUpdateShipment} onDeleteShipment={handleDeleteShipment} /></Layout>} />
          <Route path="/export-lcs" element={<Layout user={user} domain={domain} setDomain={setDomain} onLogout={onLogout} connectionMode={connectionMode} onRefreshData={onRefreshData}><ExportLCTracker lcs={lcs} buyers={buyers} onUpdateItem={handleUpdateLC} /></Layout>} />
          <Route path="/shipments/:id" element={<Layout user={user} domain={domain} setDomain={setDomain} onLogout={onLogout} connectionMode={connectionMode} onRefreshData={onRefreshData}><ShipmentDetails shipments={shipments} suppliers={suppliers} buyers={buyers} licences={licences} lcs={lcs} onUpdate={handleUpdateShipment} onDelete={handleDeleteShipment} onUpdateLC={handleUpdateLC} user={user} /></Layout>} />
        </>
      )}
    </Routes>
  );
}

export default App;