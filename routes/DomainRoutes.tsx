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
import LicenceTracker from '../pages/LicenceTracker';
import LCTracker from '../pages/LCTracker';
import ExportLCTracker from '../pages/ExportLCTracker';
import MaterialsMaster from '../pages/MaterialsMaster';

export const exportPathMatch = (path: string) =>
  ['/', '/buyers', '/export-shipments', '/export-lcs', '/shipments'].includes(path) ||
  /^\/shipments\/[^/]+$/.test(path);

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
  handleUpdateLicence: (l: Licence) => Promise<void>;
  handleUpdateLC: (l: LetterOfCredit) => Promise<void>;
}

const DomainRoutes: React.FC<DomainRoutesProps> = (props) => {
  const {
    domain,
    user,
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
    handleUpdateLicence,
    handleUpdateLC,
  } = props;
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const path = location.pathname || '/';
    const match = domain === AppDomain.EXPORT ? exportPathMatch(path) : true;
    if (domain === AppDomain.EXPORT && !match) {
      navigate('/', { replace: true });
    }
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
      {domain === AppDomain.IMPORT ? (
        <>
          <Route path="/" element={<Layout {...layoutProps}><Dashboard shipments={shipments} suppliers={suppliers} licences={licences} lcs={lcs} /></Layout>} />
          <Route path="/suppliers" element={<Layout {...layoutProps}><SupplierMaster suppliers={suppliers} user={user} onUpdateItem={handleUpdateSupplier} onAddItem={handleAddSupplier} /></Layout>} />
          <Route path="/materials" element={<Layout {...layoutProps}><MaterialsMaster /></Layout>} />
          <Route path="/shipments" element={<Layout {...layoutProps}><ShipmentMaster shipments={shipments} suppliers={suppliers} buyers={[]} user={user} onAddShipment={handleAddShipment} onUpdateShipment={handleUpdateShipment} onDeleteShipment={handleDeleteShipment} /></Layout>} />
          <Route path="/shipments/:id" element={<Layout {...layoutProps}><ShipmentDetails shipments={shipments} suppliers={suppliers} buyers={buyers} licences={licences} lcs={lcs} onUpdate={handleUpdateShipment} onDelete={handleDeleteShipment} onUpdateLC={handleUpdateLC} user={user} /></Layout>} />
          <Route path="/licences" element={<Layout {...layoutProps}><LicenceTracker licences={licences} shipments={shipments} onUpdateItem={handleUpdateLicence} onUpdateShipment={handleUpdateShipment} /></Layout>} />
          <Route path="/lcs" element={<Layout {...layoutProps}><LCTracker lcs={lcs} suppliers={suppliers} onUpdateItem={handleUpdateLC} /></Layout>} />
          <Route path="/export-shipments" element={<Navigate to="/shipments" replace />} />
        </>
      ) : (
        <>
          <Route path="/" element={<Layout {...layoutProps}><ExportDashboard shipments={shipments} buyers={buyers} licences={licences} /></Layout>} />
          <Route path="/buyers" element={<Layout {...layoutProps}><BuyerMaster buyers={buyers} user={user} onUpdateItem={handleUpdateBuyer} onAddItem={handleAddBuyer} /></Layout>} />
          <Route path="/shipments" element={<Navigate to="/export-shipments" replace />} />
          <Route path="/export-shipments" element={<Layout {...layoutProps}><ShipmentMaster isExport shipments={shipments} suppliers={[]} buyers={buyers} user={user} onAddShipment={handleAddShipment} onUpdateShipment={handleUpdateShipment} onDeleteShipment={handleDeleteShipment} /></Layout>} />
          <Route path="/export-lcs" element={<Layout {...layoutProps}><ExportLCTracker lcs={lcs} buyers={buyers} onUpdateItem={handleUpdateLC} /></Layout>} />
          <Route path="/shipments/:id" element={<Layout {...layoutProps}><ShipmentDetails shipments={shipments} suppliers={suppliers} buyers={buyers} licences={licences} lcs={lcs} onUpdate={handleUpdateShipment} onDelete={handleDeleteShipment} onUpdateLC={handleUpdateLC} user={user} /></Layout>} />
        </>
      )}
    </Routes>
  );
};

export default DomainRoutes;
