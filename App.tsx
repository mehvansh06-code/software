import React from 'react';
import { HashRouter } from 'react-router-dom';
import { useAppData } from './hooks/useAppData';
import DomainRoutes from './routes/DomainRoutes';
import Login from './pages/Login';
import DomainSelector from './pages/DomainSelector';

const App: React.FC = () => {
  const { data, actions } = useAppData();
  const {
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
  } = data;
  const {
    setDomain,
    handleLogin,
    handleLogout,
    selectDomain,
    refreshData,
    handleAddShipment,
    handleUpdateShipment,
    handleDeleteShipment,
    handleAddSupplier,
    handleUpdateSupplier,
    handleAddBuyer,
    handleUpdateBuyer,
    handleAddLicence,
    handleUpdateLicence,
    handleUpdateLC,
    handleDeleteLC,
  } = actions;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.2em] animate-pulse">Syncing Secure Nodes...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  if (!domain) {
    if (refreshingUserForSelector) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-slate-600 font-medium">Loading your hubs…</p>
          </div>
        </div>
      );
    }
    return (
      <DomainSelector
        onSelect={selectDomain}
        userName={user.name}
        role={user.role}
        allowedDomains={user.allowedDomains}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <HashRouter>
      <DomainRoutes
        domain={domain}
        user={user}
        setDomain={setDomain}
        onLogout={handleLogout}
        shipments={shipments}
        suppliers={suppliers}
        buyers={buyers}
        licences={licences}
        lcs={lcs}
        connectionMode={connectionMode}
        onRefreshData={refreshData}
        handleAddShipment={handleAddShipment}
        handleUpdateShipment={handleUpdateShipment}
        handleDeleteShipment={handleDeleteShipment}
        handleAddSupplier={handleAddSupplier}
        handleUpdateSupplier={handleUpdateSupplier}
        handleAddBuyer={handleAddBuyer}
        handleUpdateBuyer={handleUpdateBuyer}
        handleAddLicence={handleAddLicence}
        handleUpdateLicence={handleUpdateLicence}
        handleUpdateLC={handleUpdateLC}
        handleDeleteLC={handleDeleteLC}
      />
    </HashRouter>
  );
};

export default App;
