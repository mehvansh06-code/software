import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { User, UserRole, AppDomain } from '../types';
import { api } from '../api';
import {
  LayoutDashboard,
  Truck,
  Users,
  UserCog,
  LogOut,
  Package,
  Award,
  CreditCard,
  Grid,
  TrendingUp,
  ShoppingCart,
  Database,
  WifiOff,
  RefreshCw,
  FileText,
  Menu,
  X,
  ClipboardList,
  Shield
} from 'lucide-react';
import { usePermissions } from '../hooks/usePermissions';

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
  const { hasPermission } = usePermissions(user);
  const isImport = domain === AppDomain.IMPORT;
  const isExport = domain === AppDomain.EXPORT;
  const isLicence = domain === AppDomain.LICENCE;
  const isSalesIndent = domain === AppDomain.SALES_INDENT;
  const isInsurance = domain === AppDomain.INSURANCE;
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStats, setSyncStats] = useState<{ isDirty?: boolean }>({});
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

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

  const baseNavItems = isLicence ? [
    { path: '/', label: 'Licence Tracker', icon: Award, roles: [UserRole.MANAGEMENT, UserRole.CHECKER, UserRole.EXECUTIONER] as UserRole[] },
  ] : isInsurance ? [
    { path: '/', label: 'Insurance Policies', icon: Shield, roles: [UserRole.MANAGEMENT, UserRole.CHECKER, UserRole.EXECUTIONER] as UserRole[] },
  ] : isSalesIndent ? [
    { path: '/', label: 'Indent Generator', icon: FileText, roles: [UserRole.MANAGEMENT, UserRole.CHECKER, UserRole.EXECUTIONER] as UserRole[] },
    { path: '/domestic-buyers', label: 'Domestic Buyers', icon: Users, roles: [UserRole.MANAGEMENT, UserRole.CHECKER, UserRole.EXECUTIONER] as UserRole[] },
    { path: '/indent-buyers', label: 'Export Buyers', icon: ShoppingCart, roles: [UserRole.MANAGEMENT, UserRole.CHECKER, UserRole.EXECUTIONER] as UserRole[] },
    { path: '/indent-products', label: 'Indent Products', icon: Package, roles: [UserRole.MANAGEMENT, UserRole.CHECKER, UserRole.EXECUTIONER] as UserRole[] },
  ] : isImport ? [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard, roles: [UserRole.MANAGEMENT, UserRole.CHECKER, UserRole.EXECUTIONER] as UserRole[] },
    { path: '/suppliers', label: 'Supplier Master', icon: Users, roles: [UserRole.MANAGEMENT, UserRole.CHECKER, UserRole.EXECUTIONER] as UserRole[] },
    { path: '/materials', label: 'Materials Master', icon: Package, roles: [UserRole.MANAGEMENT, UserRole.CHECKER, UserRole.EXECUTIONER] as UserRole[] },
    { path: '/shipments', label: 'Shipment Master', icon: Truck, roles: [UserRole.MANAGEMENT, UserRole.CHECKER, UserRole.EXECUTIONER] as UserRole[] },
    { path: '/lcs', label: 'LC Tracker', icon: CreditCard, roles: [UserRole.MANAGEMENT, UserRole.CHECKER, UserRole.EXECUTIONER] as UserRole[] },
    { path: '/bank-payment-docs', label: 'Bank Import Payment Document Generator', icon: FileText, roles: [UserRole.MANAGEMENT, UserRole.CHECKER, UserRole.EXECUTIONER] as UserRole[] },
  ] : [
    { path: '/', label: 'Export Dashboard', icon: TrendingUp, roles: [UserRole.MANAGEMENT, UserRole.CHECKER, UserRole.EXECUTIONER] as UserRole[] },
    { path: '/buyers', label: 'Buyer Master', icon: ShoppingCart, roles: [UserRole.MANAGEMENT, UserRole.CHECKER, UserRole.EXECUTIONER] as UserRole[] },
    { path: '/export-shipments', label: 'Export Shipments', icon: Truck, roles: [UserRole.MANAGEMENT, UserRole.CHECKER, UserRole.EXECUTIONER] as UserRole[] },
    { path: '/export-lcs', label: 'LC Tracker', icon: CreditCard, roles: [UserRole.MANAGEMENT, UserRole.CHECKER, UserRole.EXECUTIONER] as UserRole[] },
  ];
  const extraNavItems: Array<{ path: string; label: string; icon: typeof UserCog; permission: string }> = [];
  if (hasPermission('users.view')) extraNavItems.push({ path: '/users', label: 'User Management', icon: UserCog, permission: 'users.view' });
  if (hasPermission('system.audit_logs')) extraNavItems.push({ path: '/audit-logs', label: 'Audit Logs', icon: ClipboardList, permission: 'system.audit_logs' });
  const navItems = [...baseNavItems, ...extraNavItems];

  const sidebarClass = isLicence ? 'bg-emerald-900' : isSalesIndent ? 'bg-rose-900' : isInsurance ? 'bg-cyan-900' : isImport ? 'bg-indigo-900' : 'bg-amber-900';
  const logoIconClass = isLicence ? 'text-emerald-900' : isSalesIndent ? 'text-rose-900' : isInsurance ? 'text-cyan-900' : isImport ? 'text-indigo-900' : 'text-amber-900';
  const hubLabel = isLicence ? 'LIC' : isSalesIndent ? 'IND' : isInsurance ? 'INS' : isImport ? 'IMP' : 'EXP';
  const titleText = isImport ? 'EXIM' : `Flotex ${hubLabel}`;
  const activeLinkClass = isLicence ? 'bg-emerald-800 text-white shadow-lg' : isSalesIndent ? 'bg-rose-800 text-white shadow-lg' : isInsurance ? 'bg-cyan-800 text-white shadow-lg' : isImport ? 'bg-indigo-800 text-white shadow-lg' : 'bg-amber-800 text-white shadow-lg';
  const userAvatarClass = isLicence ? 'bg-emerald-700' : isSalesIndent ? 'bg-rose-700' : isInsurance ? 'bg-cyan-700' : isImport ? 'bg-indigo-700' : 'bg-amber-700';

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Mobile top bar: visible only below lg */}
      <header className={`fixed top-0 left-0 right-0 h-14 z-50 flex items-center gap-3 px-4 ${sidebarClass} lg:hidden`}>
        <button
          type="button"
          onClick={() => setMobileMenuOpen((o) => !o)}
          className="p-2.5 rounded-xl text-white hover:bg-white/10 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
        >
          {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
        <img src="/logo.png" alt="Gujarat Flotex" className="h-8 w-auto object-contain shrink-0" />
        <span className="text-xl font-bold tracking-tight text-white truncate flex-1">{titleText}</span>
        <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-white text-sm uppercase shrink-0 ${userAvatarClass}`}>
          {user.name.charAt(0)}
        </div>
      </header>

      {/* Backdrop when mobile menu is open */}
      <button
        type="button"
        aria-label="Close menu"
        onClick={() => setMobileMenuOpen(false)}
        className={`fixed inset-0 bg-black/50 z-20 transition-opacity lg:hidden ${mobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      />

      {/* Sidebar: on lg always visible; on <lg fixed overlay, slide in/out */}
      <aside className={`w-64 flex flex-col transition-colors duration-500 ${sidebarClass} fixed lg:relative inset-y-0 left-0 z-40 transform transition-transform duration-300 ease-out lg:translate-x-0 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="px-4 py-4 flex items-center gap-3 pt-5 lg:pt-4">
          <div className="bg-white p-2 rounded-lg flex items-center justify-center shrink-0 h-10">
            <img src="/logo.png" alt="Gujarat Flotex" className="h-8 w-auto max-h-8 object-contain" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white truncate h-8 flex items-center">{titleText}</h1>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          {connectionMode === 'OFFLINE' ? (
            <div className="px-4 py-3 mb-6 bg-amber-500/20 rounded-xl border border-amber-400/30">
              <div className="flex items-center gap-2 text-amber-300">
                <WifiOff size={12} />
                <span className="text-[10px] font-black uppercase tracking-[0.2em]">Offline (browser only)</span>
              </div>
              <p className="text-[9px] text-white/60 mt-1">Data is saved only in this browser. Connect to the server to use the database.</p>
              <p className="text-[9px] text-white/50 mt-1">If the backend is already running, <strong>refresh the page (F5)</strong> to connect.</p>
              <p className="text-[9px] text-white/50 mt-1">Otherwise start: <code className="bg-black/20 px-1 rounded">node server.js</code></p>
              <button type="button" onClick={handleSyncToServer} disabled={isSyncing} className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-amber-500/30 hover:bg-amber-500/50 text-amber-200 text-[10px] font-black uppercase tracking-wider disabled:opacity-50">
                <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} /> {isSyncing ? 'Connecting…' : 'Reconnect to server'}
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

          <button onClick={() => setDomain(null)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-white/60 hover:bg-white/10 mb-4 min-h-[44px]">
            <Grid size={20} /> <span className="font-medium text-sm">Switch Domain</span>
          </button>
          <div className="h-px bg-white/10 my-4 mx-4" />
          {navItems.filter((item) => ('permission' in item ? hasPermission((item as any).permission) : item.roles.includes(user.role))).map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link key={item.path} to={item.path} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all min-h-[44px] ${
                  isActive ? activeLinkClass : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`}>
                <Icon size={20} /> <span className="font-medium text-sm">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 px-4 py-3 mb-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white uppercase ${userAvatarClass}`}>
              {user.name.charAt(0)}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold truncate w-32 text-white">{user.name}</span>
              <span className="text-[9px] uppercase tracking-wider text-white/50 font-black">{user.role}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { if (window.confirm('Clear cached data in this browser? Page will reload and show only server data.')) api.system.reset(); }}
            className="w-full flex items-center justify-center gap-2 text-white/60 hover:bg-white/10 hover:text-white px-4 py-2 rounded-xl transition-all min-h-[44px] mb-2 text-[10px] font-bold uppercase tracking-wider"
            title="Remove offline/cached data so list matches server (e.g. after clearing DB)"
          >
            <RefreshCw size={14} /> Clear local cache
          </button>
          <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white px-4 py-2.5 rounded-xl transition-all min-h-[44px]">
            <LogOut size={16} /> <span className="font-bold text-xs uppercase tracking-widest">Sign Out</span>
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden pt-14 lg:pt-0 p-4 sm:p-6 lg:p-8">
        <div className="max-w-6xl mx-auto">{children}</div>
      </main>
    </div>
  );
};

export default Layout;
