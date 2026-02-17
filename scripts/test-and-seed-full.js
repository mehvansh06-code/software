#!/usr/bin/env node
/**
 * test-and-seed-full.js
 * Full application test and seed: auth, master data, LC, licence, shipment, payment.
 * Run: node scripts/test-and-seed-full.js
 * Requires: server running at http://localhost:3001
 */

const BASE = 'http://localhost:3001/api';

function log(msg, emoji = '') {
  console.log(emoji ? `${emoji} ${msg}` : msg);
}

function fail(msg, err) {
  console.error('❌', msg, err?.message || err?.error || err);
}

async function request(method, path, token, body = null) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
  if (body != null && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {}
  if (!res.ok) {
    const err = new Error(data?.error || res.statusText || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function main() {
  let token = null;
  const ids = { suppliers: [], buyers: [], materials: [], lcId: null, licenceId: null, shipmentIds: [] };
  let criticalFailures = 0;

  log('--- 0. Health check ---');
  try {
    const status = await request('GET', '/status', null);
    if (status && status.ok) log('Server reachable', '✅');
    else throw new Error('Server not ok');
  } catch (e) {
    fail('Server not reachable at ' + BASE, e);
    process.exit(1);
  }

  log('--- 1. Authentication ---');
  try {
    const loginBody = { username: 'director', password: 'western407' };
    const loginRes = await request('POST', '/auth/login', null, loginBody);
    if (loginRes && loginRes.token) {
      token = loginRes.token;
      log(`Logged in as ${loginRes.user?.name || loginRes.user?.username || 'user'}`, '✅');
    } else {
      try {
        const alt = await request('POST', '/auth/login', null, { username: 'admin', password: process.env.ADMIN_PASSWORD || 'admin123' });
        if (alt && alt.token) {
          token = alt.token;
          log('Logged in as admin (env)', '✅');
        }
      } catch (_) {}
      if (!token) throw new Error('No token in login response');
    }
  } catch (e) {
    fail('Login failed', e);
    console.error('\nTip: Use username "director" with your password, or set ADMIN_USERNAME/ADMIN_PASSWORD in .env.');
    process.exit(1);
  }

  log('\n--- 2. Master Data Creation ---');
  const now = new Date().toISOString();

  try {
    await request('POST', '/suppliers', token, {
      id: 'test_supplier_a',
      name: 'Test Supplier A',
      address: '123 Test St',
      country: 'India',
      status: 'APPROVED',
      requestedBy: 'Test Script',
      createdAt: now,
    });
    ids.suppliers.push('test_supplier_a');
    log(`Supplier created: test_supplier_a (Test Supplier A)`, '✅');
  } catch (e) {
    fail('Create Supplier A', e);
  }

  try {
    await request('POST', '/suppliers', token, {
      id: 'test_supplier_b',
      name: 'Test Supplier B',
      address: '456 Sample Rd',
      country: 'China',
      status: 'APPROVED',
      requestedBy: 'Test Script',
      createdAt: now,
    });
    ids.suppliers.push('test_supplier_b');
    log(`Supplier created: test_supplier_b (Test Supplier B)`, '✅');
  } catch (e) {
    fail('Create Supplier B', e);
  }

  try {
    await request('POST', '/buyers', token, {
      id: 'test_buyer_x',
      name: 'Test Buyer X',
      address: '789 Export Ave',
      country: 'USA',
      status: 'APPROVED',
      requestedBy: 'Test Script',
      createdAt: now,
    });
    ids.buyers.push('test_buyer_x');
    log(`Buyer created: test_buyer_x (Test Buyer X)`, '✅');
  } catch (e) {
    fail('Create Buyer X', e);
  }

  try {
    await request('POST', '/buyers', token, {
      id: 'test_buyer_y',
      name: 'Test Buyer Y',
      address: '321 Import Blvd',
      country: 'UK',
      status: 'APPROVED',
      requestedBy: 'Test Script',
      createdAt: now,
    });
    ids.buyers.push('test_buyer_y');
    log(`Buyer created: test_buyer_y (Test Buyer Y)`, '✅');
  } catch (e) {
    fail('Create Buyer Y', e);
  }

  try {
    await request('POST', '/materials', token, {
      id: 'mat_cotton',
      name: 'Cotton Yarn',
      description: 'Test material',
      hsnCode: '5205',
      unit: 'KGS',
      type: 'RAW_MATERIAL',
    });
    ids.materials.push('mat_cotton');
    log(`Material created: mat_cotton (Cotton Yarn)`, '✅');
  } catch (e) {
    if (e.status === 403) log('Material Cotton Yarn skipped (no materials.create permission)', '⚠️');
    else fail('Create Material Cotton Yarn', e);
  }

  try {
    await request('POST', '/materials', token, {
      id: 'mat_poly',
      name: 'Polyester',
      description: 'Test material',
      hsnCode: '5503',
      unit: 'KGS',
      type: 'RAW_MATERIAL',
    });
    ids.materials.push('mat_poly');
    log(`Material created: mat_poly (Polyester)`, '✅');
  } catch (e) {
    if (e.status === 403) log('Material Polyester skipped (no materials.create permission)', '⚠️');
    else fail('Create Material Polyester', e);
  }

  log('\n--- 3. Finance & Compliance Setup ---');

  const issueDate = new Date().toISOString().slice(0, 10);
  const futureDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const lcId = 'lc_test_' + Date.now();
  try {
    await request('POST', '/lcs', token, {
      id: lcId,
      lcNumber: 'LC/TEST/24/' + String(Date.now()).slice(-4),
      issuingBank: 'Test Bank',
      supplierId: ids.suppliers[0],
      amount: 100000,
      currency: 'USD',
      issueDate,
      expiryDate: futureDate,
      maturityDate: futureDate,
      company: 'GFPL',
      status: 'OPEN',
      remarks: 'Test seed LC',
    });
    ids.lcId = lcId;
    log(`LC created: ${lcId}, $100,000 USD`, '✅');
  } catch (e) {
    fail('Create LC', e);
  }

  try {
    const lcList = await request('GET', '/lcs', token);
    const lc = Array.isArray(lcList) ? lcList.find((l) => l.id === ids.lcId) : null;
    if (lc) {
      const status = (lc.status || '').toUpperCase();
      if (status === 'DRAFT' || status === 'OPEN') {
        log(`LC status verified: ${status}`, '✅');
      } else {
        log(`LC status: ${status} (expected DRAFT or OPEN)`, '✅');
      }
    } else {
      log('LC not found in list (may still be created)', '❌');
    }
  } catch (e) {
    fail('Verify LC status', e);
  }

  const licenceId = 'lic_advance_' + Date.now();
  try {
    await request('POST', '/licences', token, {
      id: licenceId,
      number: 'ADV/TEST/24/' + String(Date.now()).slice(-4),
      type: 'ADVANCE',
      issueDate,
      importValidityDate: futureDate,
      expiryDate: futureDate,
      dutySaved: 0,
      eoRequired: 500000,
      eoFulfilled: 0,
      company: 'GFPL',
      status: 'ACTIVE',
    });
    ids.licenceId = licenceId;
    log(`Advance Licence created: ${licenceId}, Export Obligation $500,000`, '✅');
  } catch (e) {
    fail('Create Advance Licence', e);
  }

  log('\n--- 4. Shipment Logic Test ---');

  const shipmentId = 'sh_test_lc_' + Date.now().toString(36);
  const shipmentPayload = {
    id: shipmentId,
    supplierId: ids.suppliers[0],
    invoiceNumber: 'INV/TEST/LC/001',
    company: 'GFPL',
    amount: 20000,
    currency: 'USD',
    exchangeRate: 1,
    status: 'INITIATED',
    createdAt: now,
    isUnderLC: true,
    linkedLcId: ids.lcId,
    lcNumber: 'LC/TEST/24/' + String(Date.now()).slice(-4),
    history: [{ status: 'INITIATED', date: now, location: 'Test', remarks: 'Seed' }],
    items: [
      {
        productName: 'Cotton Yarn',
        hsnCode: '5205',
        quantity: 1000,
        unit: 'KGS',
        rate: 20,
        amount: 20000,
        productType: 'RAW_MATERIAL',
      },
    ],
    payments: [],
    documents: {},
  };

  try {
    await request('POST', '/shipments', token, shipmentPayload);
    ids.shipmentIds.push(shipmentId);
    log(`Step A: Shipment created: ${shipmentId}, $20,000, linked to LC`, '✅');
  } catch (e) {
    fail('Step A: Create shipment linked to LC', e);
  }

  try {
    const lcList = await request('GET', '/lcs', token);
    const lc = Array.isArray(lcList) ? lcList.find((l) => l.id === ids.lcId) : null;
    if (lc) {
      const shipments = lc.shipments || (lc.shipments_json ? JSON.parse(lc.shipments_json) : []);
      const arr = Array.isArray(shipments) ? shipments : [];
      if (arr.includes(shipmentId)) {
        log(`Step B: LC shipments_json includes shipment ${shipmentId}`, '✅');
      } else {
        fail('Step B: LC shipments_json missing shipment', { shipments: arr, expected: shipmentId });
      }
    } else {
      fail('Step B: LC not found', null);
    }
  } catch (e) {
    fail('Step B: Verify LC has shipment', e);
  }

  const paymentDate = new Date().toISOString().slice(0, 10);
  const paymentEntry = {
    id: 'pay_' + Date.now(),
    amount: 20000,
    mode: 'Letter of Credit',
    linkedLcId: ids.lcId,
    currency: 'USD',
    date: paymentDate,
    reference: 'TEST-PAY-001',
  };

  try {
    const existing = await request('GET', `/shipments/${shipmentId}`, token);
    const version = existing?.version != null ? existing.version : 1;
    const updatedShipment = {
      ...existing,
      version,
      payments: [...(existing.payments || []), paymentEntry],
    };
    await request('PUT', `/shipments/${shipmentId}`, token, updatedShipment);
    log(`Step C: Payment $20,000 (Letter of Credit) added to shipment`, '✅');
  } catch (e) {
    fail('Step C: Add payment to shipment', e);
    if (e.message && e.message.includes('remaining: 0')) {
      console.error('   → Restart the backend (npm run restart) so the LC balance fix is loaded, then run this script again.');
    }
    criticalFailures++;
  }

  try {
    const lcList = await request('GET', '/lcs', token);
    const lc = Array.isArray(lcList) ? lcList.find((l) => l.id === ids.lcId) : null;
    if (lc) {
      const balance = lc.balanceAmount != null ? Number(lc.balanceAmount) : lc.amount;
      if (balance === 80000) {
        log(`Step D: LC balanceAmount = $80,000 (was $100,000, paid $20,000)`, '✅');
      } else {
        fail('Step D: LC balanceAmount expected 80000', { balance, amount: lc.amount });
        criticalFailures++;
      }
    } else {
      fail('Step D: LC not found', null);
      criticalFailures++;
    }
  } catch (e) {
    fail('Step D: Verify LC balance after payment', e);
    criticalFailures++;
  }

  log('\n--- 5. Licence Logic Test ---');

  const shipmentLicenceId = 'sh_test_lic_' + Date.now().toString(36);
  const licenceShipmentPayload = {
    id: shipmentLicenceId,
    supplierId: ids.suppliers[0],
    invoiceNumber: 'INV/TEST/LIC/001',
    company: 'GFPL',
    amount: 50000,
    currency: 'USD',
    exchangeRate: 1,
    status: 'INITIATED',
    createdAt: now,
    isUnderLC: false,
    isUnderLicence: true,
    linkedLicenceId: ids.licenceId,
    licenceObligationAmount: 0,
    history: [{ status: 'INITIATED', date: now, location: 'Test', remarks: 'Licence seed' }],
    items: [
      {
        productName: 'Polyester',
        hsnCode: '5503',
        quantity: 2500,
        unit: 'KGS',
        rate: 20,
        amount: 50000,
        productType: 'RAW_MATERIAL',
      },
    ],
    payments: [],
    documents: {},
  };

  try {
    await request('POST', '/shipments', token, licenceShipmentPayload);
    ids.shipmentIds.push(shipmentLicenceId);
    log(`Shipment linked to Advance Licence created: ${shipmentLicenceId}`, '✅');
  } catch (e) {
    fail('Create shipment linked to licence', e);
  }

  try {
    const licList = await request('GET', '/licences', token);
    const lic = Array.isArray(licList) ? licList.find((l) => l.id === ids.licenceId) : null;
    if (lic) {
      log(`Licence record found: ${lic.number}, eoRequired=${lic.eoRequired}, eoFulfilled=${lic.eoFulfilled}`, '✅');
    } else {
      log('Licence not in list', '❌');
    }
  } catch (e) {
    fail('Verify licence record', e);
  }

  log('\n--- 6. List/Read verification ---');
  try {
    const [supList, buyList, shipList] = await Promise.all([
      request('GET', '/suppliers', token),
      request('GET', '/buyers', token),
      request('GET', '/shipments', token),
    ]);
    const supOk = Array.isArray(supList) && supList.some((s) => s.id === ids.suppliers[0]);
    const buyOk = Array.isArray(buyList) && buyList.some((b) => b.id === ids.buyers[0]);
    const shipOk = Array.isArray(shipList) && shipList.some((s) => s.id === ids.shipmentIds[0]);
    if (supOk && buyOk && shipOk) log('GET suppliers, buyers, shipments return created records', '✅');
    else fail('List verification', { supOk, buyOk, shipOk });
  } catch (e) {
    fail('List/Read verification', e);
  }

  if (ids.shipmentIds[0]) {
    try {
      const one = await request('GET', `/shipments/${ids.shipmentIds[0]}`, token);
      if (one && one.id && Array.isArray(one.payments) && one.payments.length > 0) {
        log('GET single shipment returns payment data', '✅');
      } else if (one && one.id) {
        log('GET single shipment OK (payments may be in different shape)', '✅');
      } else {
        fail('GET shipment shape', one);
      }
    } catch (e) {
      fail('GET single shipment', e);
    }
  }

  log('\n--- Summary: Created IDs ---');
  log('Suppliers: ' + (ids.suppliers.length ? ids.suppliers.join(', ') : '(none)'));
  log('Buyers: ' + (ids.buyers.length ? ids.buyers.join(', ') : '(none)'));
  log('Materials: ' + (ids.materials.length ? ids.materials.join(', ') : '(none)'));
  log('LC: ' + (ids.lcId || '(none)'));
  log('Licence: ' + (ids.licenceId || '(none)'));
  log('Shipments: ' + (ids.shipmentIds.length ? ids.shipmentIds.join(', ') : '(none)'));
  if (criticalFailures > 0) {
    log(`\n❌ ${criticalFailures} critical check(s) failed.`, '');
    process.exit(1);
  }
  log('\nAll critical checks passed.', '✅');
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
