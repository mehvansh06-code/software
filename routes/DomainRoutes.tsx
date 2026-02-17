import React, { useEffect } from 'react';
import { Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { User, Supplier, Shipment, Licence, LetterOfCredit, AppDomain, Buyer } from '../types';
import Layout from '../components/Layout';
import Dashboard from '../pages/Dashboard';
import ExportDashboard from '../pages/ExportDashboard';
import SupplierMaster from '../pages/SupplierMaster';
import BuyerMaster from '../pages/BuyerMaster';
import ShipmentMaster from '../pages/ShipmentMaster';
import ShipmentDetails from '../pages/ShipmentDetails';
import ShipmentDetailsPage from '../pages/ShipmentDetailsPage';
import LicenceTracker from '../pages/LicenceTracker';
import LCTracker from '../pages/LCTracker';
import ExportLCTracker from '../pages/ExportLCTracker';
import MaterialsMaster from '../pages/MaterialsMaster';
import IndentGenerator from '../pages/IndentGenerator';
import DomesticBuyerMaster from '../pages/DomesticBuyerMaster';
import IndentProductsMaster from '../pages/IndentProductsMaster';
import UserManagement from '../pages/UserManagement';
import AuditLogs from '../pages/AuditLogs';
import BankPaymentDocGenerator from '../pages/BankPaymentDocGenerator';

export const exportPathMatch = (path: string) =>
  ['/', '/buyers', '/export-shipments', '/export-lcs', '/shipments', '/users', '/audit-logs'].includes(path) ||
  /^\/shipments\/[^/]+$/.test(path);

export const licencePathMatch = (path: string) =>
  path === '/' || path === '/users' || path === '/audit-logs' || /^\/licences\/[^/]+$/.test(path);

export const salesIndentPathMatch = (path: string) =>
  path === '/' || path === '/domestic-buyers' || path === '/indent-buyers' || path === '/indent-products' || path === '/users' || path === '/audit-logs';

export interface DomainRoutesProps {
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
  handleAddLicence: (l: Licence) => Promise<void>;
  handleUpdateLicence: (l: Licence) => Promise<void>;
  handleDeleteLicence: (id: string) => Promise<void>;
  handleUpdateLC: (l: LetterOfCredit) => Promise<void>;
  handleDeleteLC: (id: string) => Promise<void>;
}

const DomainRoutes: React.FC<DomainRoutesProps> = (props) => {
  const {
    domain,
    user,
  } = props;
  if (!domain || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <p className="text-slate-500">Loading…</p>
      </div>
    );
  }
  const {
    setDomain,
    onLogout,
    shipments,
    suppliers,
    buyers,
    licences,
    lcs,
    connectionMode,
    onRefreshData,
    handleAddShipment,
    handleUpdateShipment,
    handleDeleteShipment,
    handleAddSupplier,
    handleUpdateSupplier,
    handleAddBuyer,
    handleUpdateBuyer,
    handleAddLicence,
    handleUpdateLicence,
    handleDeleteLicence,
    handleUpdateLC,
    handleDeleteLC,
  } = props;
  const location = useLocation();
  const navigate = useNavigate();

  const importPathMatch = (p: string) =>
    ['/', '/suppliers', '/materials', '/shipments', '/lcs', '/bank-payment-docs', '/users', '/audit-logs'].includes(p) || /^\/shipments\/[^/]+$/.test(p);

  useEffect(() => {
    const path = location.pathname || '/';
    if (domain === AppDomain.IMPORT && !importPathMatch(path)) navigate('/', { replace: true });
    if (domain === AppDomain.EXPORT && !exportPathMatch(path)) navigate('/', { replace: true });
    if (domain === AppDomain.LICENCE && !licencePathMatch(path)) navigate('/', { replace: true });
    if (domain === AppDomain.SALES_INDENT && !salesIndentPathMatch(path)) navigate('/', { replace: true });
  }, [domain, location.pathname, navigate]);

  const layoutProps = {
    user,
    domain,
    setDomain,
    onLogout,
    connectionMode,
    onRefreshData,
  };

  return (
    <Routes>
      {domain === AppDomain.LICENCE ? (
        <>
          <Route path="/" element={<Layout {...layoutProps}><LicenceTracker licences={licences} shipments={shipments} user={user} onAddItem={handleAddLicence} onUpdateItem={handleUpdateLicence} onDeleteItem={handleDeleteLicence} onUpdateShipment={handleUpdateShipment} /></Layout>} />
          <Route path="/licences/:id" element={<Layout {...layoutProps}><LicenceTracker licences={licences} shipments={shipments} user={user} onAddItem={handleAddLicence} onUpdateItem={handleUpdateLicence} onDeleteItem={handleDeleteLicence} onUpdateShipment={handleUpdateShipment} /></Layout>} />
          <Route path="/users" element={<Layout {...layoutProps}><UserManagement /></Layout>} />
          <Route path="/audit-logs" element={<Layout {...layoutProps}><AuditLogs /></Layout>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      ) : domain === AppDomain.SALES_INDENT ? (
        <>
          <Route path="/" element={<Layout {...layoutProps}><IndentGenerator buyers={buyers} user={user} onAddBuyer={handleAddBuyer} /></Layout>} />
          <Route path="/domestic-buyers" element={<Layout {...layoutProps}><DomesticBuyerMaster user={user} /></Layout>} />
          <Route path="/indent-buyers" element={<Layout {...layoutProps}><BuyerMaster buyers={buyers} user={user} onUpdateItem={handleUpdateBuyer} onAddItem={handleAddBuyer} onRefreshData={onRefreshData} /></Layout>} />
          <Route path="/indent-products" element={<Layout {...layoutProps}><IndentProductsMaster /></Layout>} />
          <Route path="/users" element={<Layout {...layoutProps}><UserManagement /></Layout>} />
          <Route path="/audit-logs" element={<Layout {...layoutProps}><AuditLogs /></Layout>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      ) : domain === AppDomain.IMPORT ? (
        <>
          <Route path="/" element={<Layout {...layoutProps}><Dashboard shipments={shipments} suppliers={suppliers} licences={licences} lcs={lcs} /></Layout>} />
          <Route path="/suppliers" element={<Layout {...layoutProps}><SupplierMaster suppliers={suppliers} user={user} onUpdateItem={handleUpdateSupplier} onAddItem={handleAddSupplier} onRefreshData={onRefreshData} /></Layout>} />
          <Route path="/materials" element={<Layout {...layoutProps}><MaterialsMaster /></Layout>} />
          <Route path="/shipments" element={<Layout {...layoutProps}><ShipmentMaster shipments={shipments} suppliers={suppliers} buyers={[]} licences={licences} lcs={lcs} user={user} onAddShipment={handleAddShipment} onUpdateShipment={handleUpdateShipment} onDeleteShipment={handleDeleteShipment} /></Layout>} />
          <Route path="/shipments/:id" element={<Layout {...layoutProps}><ShipmentDetails shipments={shipments} suppliers={suppliers} buyers={buyers} licences={licences} lcs={lcs} onUpdate={handleUpdateShipment} onDelete={handleDeleteShipment} onUpdateLC={handleUpdateLC} user={user} connectionMode={connectionMode} onRefreshData={onRefreshData} /></Layout>} />
          <Route path="/lcs" element={<Layout {...layoutProps}><LCTracker lcs={lcs} suppliers={suppliers} user={user} onUpdateItem={handleUpdateLC} onDeleteItem={handleDeleteLC} /></Layout>} />
          <Route path="/bank-payment-docs" element={<Layout {...layoutProps}><BankPaymentDocGenerator suppliers={suppliers} shipments={shipments} user={user} /></Layout>} />
          <Route path="/users" element={<Layout {...layoutProps}><UserManagement /></Layout>} />
          <Route path="/audit-logs" element={<Layout {...layoutProps}><AuditLogs /></Layout>} />
          <Route path="/export-shipments" element={<Navigate to="/shipments" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      ) : (
        <>
          <Route path="/" element={<Layout {...layoutProps}><ExportDashboard shipments={shipments} buyers={buyers} licences={licences} user={user} /></Layout>} />
          <Route path="/buyers" element={<Layout {...layoutProps}><BuyerMaster buyers={buyers} user={user} onUpdateItem={handleUpdateBuyer} onAddItem={handleAddBuyer} onRefreshData={onRefreshData} /></Layout>} />
          <Route path="/shipments" element={<Navigate to="/export-shipments" replace />} />
          <Route path="/export-shipments" element={<Layout {...layoutProps}><ShipmentMaster isExport shipments={shipments} suppliers={[]} buyers={buyers} licences={licences} user={user} onAddShipment={handleAddShipment} onUpdateShipment={handleUpdateShipment} onDeleteShipment={handleDeleteShipment} /></Layout>} />
          <Route path="/export-lcs" element={<Layout {...layoutProps}><ExportLCTracker lcs={lcs} buyers={buyers} onUpdateItem={handleUpdateLC} /></Layout>} />
          <Route path="/shipments/:id" element={<Layout {...layoutProps}><ShipmentDetails shipments={shipments} suppliers={suppliers} buyers={buyers} licences={licences} lcs={lcs} onUpdate={handleUpdateShipment} onDelete={handleDeleteShipment} onUpdateLC={handleUpdateLC} user={user} connectionMode={connectionMode} onRefreshData={onRefreshData} /></Layout>} />
          <Route path="/users" element={<Layout {...layoutProps}><UserManagement /></Layout>} />
          <Route path="/audit-logs" element={<Layout {...layoutProps}><AuditLogs /></Layout>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      )}
    </Routes>
  );
};

export default DomainRoutes;
