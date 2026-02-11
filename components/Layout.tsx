import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { User, UserRole, AppDomain } from '../types';
import { api } from '../api';
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

export interface LayoutProps {
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

export default Layout;
