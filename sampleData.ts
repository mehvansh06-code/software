

import { Supplier, SupplierStatus, Shipment, ShipmentStatus, Licence, LicenceType, LetterOfCredit, LCStatus, Buyer, ProductType, MasterProduct } from './types';

const now = new Date();
const getDaysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
const getDaysFuture = (days: number) => new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

export const MASTER_PRODUCTS: MasterProduct[] = [
  { id: 'mp1', name: 'Cotton Yarn 40s', hsnCode: '5205', baseRate: 3.5, category: 'YARN' },
  { id: 'mp2', name: 'Polyester Staple Fiber', hsnCode: '5503', baseRate: 1.2, category: 'FIBER' },
  { id: 'mp3', name: 'Nylon Textured Yarn', hsnCode: '5402', baseRate: 4.8, category: 'YARN' },
  { id: 'mp4', name: 'Viscose Rayon Yarn', hsnCode: '5403', baseRate: 2.9, category: 'YARN' },
  { id: 'mp5', name: 'Acrylic Fiber', hsnCode: '5501', baseRate: 1.5, category: 'FIBER' },
  { id: 'mp6', name: 'Denim Fabric 12oz', hsnCode: '5209', baseRate: 6.5, category: 'FABRIC' },
  { id: 'mp7', name: 'Printed Cotton Sheet', hsnCode: '5210', baseRate: 4.2, category: 'FABRIC' },
  { id: 'mp8', name: 'Spandex Elastic Yarn', hsnCode: '5404', baseRate: 12.5, category: 'YARN' },
  { id: 'mp9', name: 'Reactive Dyes Red', hsnCode: '3204', baseRate: 8.4, category: 'CHEMICAL' },
  { id: 'mp10', name: 'Sulfur Black Dye', hsnCode: '3204', baseRate: 5.2, category: 'CHEMICAL' },
  { id: 'mp11', name: 'Industrial Weaving Loom', hsnCode: '8448', baseRate: 45000, category: 'MACHINERY' },
  { id: 'mp12', name: 'Air Jet Spinning Machine', hsnCode: '8445', baseRate: 120000, category: 'MACHINERY' },
  { id: 'mp13', name: 'Circular Knitting Head', hsnCode: '8447', baseRate: 8500, category: 'MACHINERY' },
  { id: 'mp14', name: 'Caustic Soda Flakes', hsnCode: '2815', baseRate: 0.8, category: 'CHEMICAL' },
  { id: 'mp15', name: 'Hydrogen Peroxide 50%', hsnCode: '2847', baseRate: 0.9, category: 'CHEMICAL' },
  { id: 'mp16', name: 'Embroidery Thread Poly', hsnCode: '5401', baseRate: 5.5, category: 'YARN' },
  { id: 'mp17', name: 'Silk Mulberry Yarn', hsnCode: '5002', baseRate: 65.0, category: 'YARN' },
  { id: 'mp18', name: 'Linen Blended Fabric', hsnCode: '5309', baseRate: 9.8, category: 'FABRIC' },
  { id: 'mp19', name: 'Knitted Jersey Grey', hsnCode: '6006', baseRate: 7.4, category: 'FABRIC' },
  { id: 'mp20', name: 'Warp Knitting Machine', hsnCode: '8447', baseRate: 250000, category: 'MACHINERY' },
  { id: 'mp21', name: 'Textile Sizing Agent', hsnCode: '3809', baseRate: 1.4, category: 'CHEMICAL' },
  { id: 'mp22', name: 'PVC Coating Resin', hsnCode: '3904', baseRate: 1.1, category: 'CHEMICAL' },
  { id: 'mp23', name: 'Woolen Tops 22mic', hsnCode: '5105', baseRate: 14.5, category: 'FIBER' },
  { id: 'mp24', name: 'Terry Towel Fabric', hsnCode: '5802', baseRate: 3.2, category: 'FABRIC' },
  { id: 'mp25', name: 'Industrial Steam Iron', hsnCode: '8451', baseRate: 1200, category: 'MACHINERY' },
  { id: 'mp26', name: 'Garment Sewing Machine', hsnCode: '8452', baseRate: 850, category: 'MACHINERY' },
  { id: 'mp27', name: 'Digital Textile Printer', hsnCode: '8443', baseRate: 15000, category: 'MACHINERY' },
  { id: 'mp28', name: 'Cotton Seed Oil', hsnCode: '1512', baseRate: 1.8, category: 'BYPRODUCT' },
  { id: 'mp29', name: 'Polyester Webbing 2inch', hsnCode: '5806', baseRate: 0.5, category: 'ACCESSORY' },
  { id: 'mp30', name: 'Canvas Tents Heavy', hsnCode: '6306', baseRate: 85.0, category: 'FINISHED' },
];

export const SAMPLE_BUYERS: Buyer[] = [
  { id: 'b1', name: 'London Fashion Hub', address: '22 Savile Row, London, UK', country: 'United Kingdom', bankName: 'Barclays Bank', accountHolderName: 'London Fashion Hub PLC', swiftCode: 'BARCGB22XXX', bankAddress: 'Canary Wharf, London', contactPerson: 'James Miller', contactDetails: 'james@londonfashion.co.uk', salesPersonName: 'Rahul Sharma', salesPersonContact: '9876543210', hasConsignee: true, consignees: [{ id: 'c1', name: 'Southampton Warehouse Ltd', address: 'Unit 4, Southampton Port Terminal' }], status: SupplierStatus.APPROVED, requestedBy: 'Rahul Sharma', createdAt: getDaysAgo(120) },
  { id: 'b2', name: 'NY Trends Inc', address: '5th Avenue, New York, USA', country: 'USA', bankName: 'Chase Bank', accountHolderName: 'NY Trends Inc', swiftCode: 'CHASUS33XXX', bankAddress: 'Manhattan, NY', contactPerson: 'Sarah Jessica', contactDetails: 'sarah@nytrends.com', salesPersonName: 'J P Tosniwal', salesPersonContact: '9988776655', hasConsignee: false, consignees: [], status: SupplierStatus.APPROVED, requestedBy: 'J P Tosniwal', createdAt: getDaysAgo(110) }
];

export const SAMPLE_SUPPLIERS: Supplier[] = [
  "Shenzhen Global Textiles", "Berlin Polymers", "Tokyo Synthetics", "Milan Fabrics",
  "Daegu Yarn Corp", "Mumbai Dyestuffs", "Istanbul Loom Co", "Bangkok Fibers"
].map((name, idx) => {
  const id = `s${idx + 1}`;
  return {
    id,
    name,
    address: `Industrial Area, City ${idx + 1}`,
    country: 'International',
    bankName: `Global Bank ${idx}`,
    accountHolderName: `${name} Ltd`,
    swiftCode: `BANK${idx}XX`,
    bankAddress: `Main St, City ${idx}`,
    contactPerson: `Manager ${idx + 1}`,
    contactDetails: `contact@${name.toLowerCase().replace(/ /g, "")}.com`,
    status: SupplierStatus.APPROVED,
    products: [
      { id: `p${idx}-1`, name: "Premium Yarn", description: "Fiber", hsnCode: "5402", unit: "KGS", type: ProductType.RAW_MATERIAL }
    ],
    requestedBy: 'J P Tosniwal',
    createdAt: getDaysAgo(idx * 5 + 30)
  };
});

export const SAMPLE_LICENCES: Licence[] = Array.from({ length: 5 }).map((_, i) => ({
  id: `l${i + 1}`,
  number: `0310${224567 + i}`,
  type: i < 3 ? LicenceType.ADVANCE : LicenceType.EPCG,
  issueDate: getDaysAgo(200),
  expiryDate: getDaysFuture(10 + (i * 5)), // Nearing expiry for some
  dutySaved: 1000000 + (i * 100000),
  eoRequired: 6000000 + (i * 500000),
  eoFulfilled: i === 0 ? 500000 : 1500000, // License 0 is a risk (low fulfillment)
  company: i % 2 === 0 ? 'GFPL' : 'GTEX',
  status: 'ACTIVE'
}));

export const SAMPLE_LCS: LetterOfCredit[] = Array.from({ length: 5 }).map((_, i) => ({
  id: `lc${i + 1}`,
  lcNumber: `LC/IMP/24/0${i + 100}`,
  issuingBank: 'State Bank of India',
  supplierId: `s${i + 1}`,
  amount: 25000,
  currency: 'USD',
  issueDate: getDaysAgo(30),
  expiryDate: getDaysFuture(5), // Expiring in 5 days (Red Flag!)
  maturityDate: getDaysFuture(45),
  company: 'GFPL',
  status: LCStatus.OPEN,
  remarks: `Q4 Batch ${i + 1}`
}));

export const SAMPLE_SHIPMENTS: Shipment[] = Array.from({ length: 10 }).map((_, i) => {
  const isExport = i > 5;
  const rate = 5;
  const qty = 1000;
  const amount = rate * qty;
  return {
    id: `sh${i + 1}`,
    supplierId: !isExport ? `s${(i % 5) + 1}` : undefined,
    buyerId: isExport ? 'b1' : undefined,
    items: [{ productId: 'mp1', productName: 'Cotton Yarn 40s', hsnCode: '5205', quantity: qty, unit: 'KGS', rate: rate, amount: amount }],
    rate,
    quantity: qty,
    amount,
    currency: isExport ? 'GBP' : 'USD',
    incoTerm: 'CIF',
    invoiceNumber: `INV/FLOTEX/24/${1000 + i}`,
    company: i % 2 === 0 ? 'GFPL' : 'GTEX',
    expectedShipmentDate: getDaysAgo(i),
    createdAt: getDaysAgo(i + 5),
    fobValueFC: amount * 0.9,
    fobValueINR: amount * 0.9 * 84,
    isUnderLC: !isExport,
    lcNumber: !isExport ? `LC/IMP/24/010${i}` : undefined,
    isUnderLicence: true,
    linkedLicenceId: 'l1',
    licenceObligationAmount: amount * 0.1 * 84,
    status: ShipmentStatus.IN_TRANSIT,
    history: [{ status: ShipmentStatus.ORDERED, date: getDaysAgo(i + 10), location: 'System Origin' }],
    documents: { CI: true, PL: true },
    payments: [],
    invoiceValueINR: amount * 84,
    exchangeRate: 84, // Added
    assessedValue: amount * 84, // Added
    // Added missing required properties
    dutyBCD: 0,
    dutySWS: 0,
    dutyINT: 0,
    gst: 0,
    paymentDueDate: getDaysFuture(i + 1)
  };
});
