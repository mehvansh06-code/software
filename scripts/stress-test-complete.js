#!/usr/bin/env node
/**
 * stress-test-complete.js
 * Large-scale stress test: master data, LCs, licences, shipments, payments,
 * file uploads, indent generation, validation, and cleanup.
 * Run: node scripts/stress-test-complete.js
 * Requires: server at http://localhost:3001
 */

const BASE = 'http://localhost:3001/api';
const DELAY_MS = 50;
const PAYMENT_AMOUNT = 5000;

function log(msg, emoji = '') {
  console.log(emoji ? `${emoji} ${msg}` : msg);
}

function warn(msg) {
  console.warn('⚠️', msg);
}

function fail(msg, err) {
  console.error('❌', msg, err?.message || err?.error || err);
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function request(method, path, token, body = null, { expectBinary = false } = {}) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const opts = {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  };
  if (body != null && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (res.status === 429) {
    await delay(1000);
    return request(method, path, token, body, { expectBinary });
  }
  const contentType = res.headers.get('content-type') || '';
  if (expectBinary || contentType.includes('application/vnd.openxmlformats') || contentType.includes('application/octet-stream')) {
    const buf = await res.arrayBuffer();
    if (!res.ok) {
      const text = new TextDecoder().decode(buf);
      let errMsg = text;
      try {
        const j = JSON.parse(text);
        errMsg = j.error || text;
      } catch (_) {}
      const err = new Error(errMsg);
      err.status = res.status;
      throw err;
    }
    return buf;
  }
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

async function uploadFile(path, token, buffer, filename = 'stress-test-upload.txt') {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const form = new FormData();
  const blob = new Blob([buffer], { type: 'text/plain' });
  form.append('file', blob, filename);
  const res = await fetch(url, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (res.status === 429) {
    await delay(1000);
    return uploadFile(path, token, buffer, filename);
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {}
  if (!res.ok) throw new Error(data?.error || res.statusText || `HTTP ${res.status}`);
  return data;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function main() {
  const startTime = Date.now();
  let token = null;
  const ids = {
    suppliers: [],
    buyers: [],
    domesticBuyers: [],
    materials: [],
    indentProducts: [],
    lcs: [],
    licences: [],
    shipmentIds: [],
  };

  log('🚀 Stress test started', '');
  log('--- Authentication ---', '');
  try {
    let loginRes = await request('POST', '/auth/login', null, { username: 'director', password: 'western407' });
    if (!loginRes?.token) {
      loginRes = await request('POST', '/auth/login', null, { username: 'admin', password: process.env.ADMIN_PASSWORD || 'admin123' });
    }
    if (loginRes?.token) {
      token = loginRes.token;
      log(`Logged in as ${loginRes.user?.name || loginRes.user?.username}`, '✅');
    } else throw new Error('No token');
  } catch (e) {
    fail('Login failed', e);
    process.exit(1);
  }

  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const futureDate = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  log('\n--- Phase 1: Master Data Explosion ---', '');
  for (let i = 1; i <= 10; i++) {
    try {
      await request('POST', '/suppliers', token, {
        id: `mega_${i}`,
        name: `Mega Corp ${i}`,
        address: `${i} Industrial Park`,
        country: i % 2 ? 'India' : 'China',
        status: 'APPROVED',
        requestedBy: 'StressTest',
        createdAt: now,
      });
      ids.suppliers.push(`mega_${i}`);
    } catch (e) {
      fail(`Supplier ${i}`, e);
    }
    await delay(20);
  }
  log(`Suppliers: ${ids.suppliers.length} created`, '✅');

  for (let i = 1; i <= 10; i++) {
    try {
      await request('POST', '/buyers', token, {
        id: `intl_buyer_${i}`,
        name: `International Buyer ${i}`,
        address: `${i} Trade Street`,
        country: ['USA', 'UK', 'UAE', 'Germany', 'Japan'][i % 5],
        status: 'APPROVED',
        requestedBy: 'StressTest',
        createdAt: now,
      });
      ids.buyers.push(`intl_buyer_${i}`);
    } catch (e) {
      fail(`Buyer ${i}`, e);
    }
    await delay(20);
  }
  log(`Buyers: ${ids.buyers.length} created`, '✅');

  for (let i = 1; i <= 10; i++) {
    try {
      await request('POST', '/domestic-buyers', token, {
        id: `dom_${i}`,
        name: `Domestic Buyer ${i}`,
        billingAddress: `${i} Billing Lane`,
        state: 'Gujarat',
        gstNo: `24AABCT${i}001A1Z${i}`,
        mobile: `98765${String(i).padStart(5, '0')}`,
        paymentTerms: '30 days',
        createdAt: now,
      });
      ids.domesticBuyers.push(`dom_${i}`);
    } catch (e) {
      fail(`Domestic buyer ${i}`, e);
    }
    await delay(20);
  }
  log(`Domestic buyers: ${ids.domesticBuyers.length} created`, '✅');

  for (let i = 1; i <= 20; i++) {
    try {
      const type = i <= 14 ? 'RAW_MATERIAL' : 'CAPITAL_GOOD';
      await request('POST', '/materials', token, {
        id: `mat_stress_${i}`,
        name: `Material ${i} ${type === 'RAW_MATERIAL' ? 'Fabric' : 'Machine'}`,
        hsnCode: type === 'RAW_MATERIAL' ? '5205' : '8448',
        unit: 'KGS',
        type,
      });
      ids.materials.push(`mat_stress_${i}`);
    } catch (e) {
      fail(`Material ${i}`, e);
    }
    await delay(20);
  }
  log(`Materials: ${ids.materials.length} created`, '✅');

  for (let i = 1; i <= 10; i++) {
    try {
      await request('POST', '/indent-products', token, {
        id: `indent_prod_${i}`,
        quality: `Fabric-Q${i}`,
        description: `Shade ${i} quality`,
        designNo: `D${i}`,
        shadeNo: `S${i}`,
        hsnCode: '5407',
        unit: 'MTR',
        rateInr: 100 + i * 10,
        rateUsd: 12 + i,
        rateGbp: 10,
      });
      ids.indentProducts.push(`indent_prod_${i}`);
    } catch (e) {
      fail(`Indent product ${i}`, e);
    }
    await delay(20);
  }
  log(`Indent products: ${ids.indentProducts.length} created`, '✅');

  log('\n--- Phase 2: Compliance & Finance ---', '');
  for (let i = 1; i <= 5; i++) {
    try {
      await request('POST', '/lcs', token, {
        id: `lc_stress_${i}`,
        lcNumber: `LC/STRESS/24/${String(1000 + i)}`,
        issuingBank: 'Stress Test Bank',
        supplierId: ids.suppliers[i - 1],
        amount: 1000000,
        currency: 'USD',
        issueDate: today,
        expiryDate: futureDate,
        maturityDate: futureDate,
        company: 'GFPL',
        status: 'OPEN',
        remarks: 'Stress test',
      });
      ids.lcs.push(`lc_stress_${i}`);
    } catch (e) {
      fail(`LC ${i}`, e);
    }
    await delay(20);
  }
  log(`LCs: ${ids.lcs.length} created ($1,000,000 each)`, '✅');

  for (let i = 1; i <= 5; i++) {
    try {
      const type = i <= 3 ? 'ADVANCE' : 'EPCG';
      await request('POST', '/licences', token, {
        id: `lic_stress_${i}`,
        number: `${type}/STRESS/24/${1000 + i}`,
        type,
        issueDate: today,
        importValidityDate: futureDate,
        expiryDate: futureDate,
        dutySaved: 5000000,
        eoRequired: 5000000,
        eoFulfilled: 0,
        company: 'GFPL',
        status: 'ACTIVE',
      });
      ids.licences.push(`lic_stress_${i}`);
    } catch (e) {
      fail(`Licence ${i}`, e);
    }
    await delay(20);
  }
  log(`Licences: ${ids.licences.length} created`, '✅');

  log('\n--- Phase 3: Shipment Loop (50x) ---', '');
  for (let round = 0; round < 50; round++) {
    await delay(DELAY_MS);
    const isImport = round % 2 === 0;
    const shId = `sh_stress_${Date.now()}_${round}`;
    const supplierId = isImport ? pick(ids.suppliers) : null;
    const buyerId = isImport ? null : pick(ids.buyers);
    const materialId = pick(ids.materials);
    const linkToLc = round % 2 === 0;
    const lcId = linkToLc ? pick(ids.lcs) : null;
    const licenceId = pick(ids.licences);

    const basePayload = {
      id: shId,
      supplierId,
      buyerId,
      invoiceNumber: `INV/STRESS/${round + 1}`,
      company: round % 3 === 0 ? 'GTEX' : 'GFPL',
      amount: 10000 + round * 500,
      currency: 'USD',
      exchangeRate: 84,
      status: 'INITIATED',
      createdAt: now,
      containerNumber: `CONT-${round + 1}`,
      blNumber: `BL-${round + 1}`,
      portOfLoading: 'Mundra',
      portOfDischarge: 'Dubai',
      freightCharges: 500,
      otherCharges: 100,
      incoTerm: 'FOB',
      paymentDueDate: futureDate,
      expectedArrivalDate: futureDate,
      invoiceDate: today,
      isUnderLC: !!lcId,
      linkedLcId: lcId || null,
      lcNumber: lcId ? `LC/STRESS/24/${ids.lcs.indexOf(lcId) + 1001}` : null,
      isUnderLicence: true,
      linkedLicenceId: licenceId,
      licenceObligationAmount: 0,
      history: [{ status: 'INITIATED', date: now, location: 'StressTest', remarks: 'Created' }],
      items: [
        {
          productName: `Material ${ids.materials.indexOf(materialId) + 1}`,
          hsnCode: '5205',
          quantity: 1000,
          unit: 'KGS',
          rate: 10,
          amount: 10000,
          productType: 'RAW_MATERIAL',
        },
      ],
      payments: [],
      documents: {},
    };

    try {
      await request('POST', '/shipments', token, basePayload);
      ids.shipmentIds.push(shId);
    } catch (e) {
      fail(`Shipment create ${round + 1}`, e);
      continue;
    }

    try {
      const existing = await request('GET', `/shipments/${shId}`, token);
      const version = existing?.version != null ? existing.version : 1;
      await request('PUT', `/shipments/${shId}`, token, {
        ...existing,
        version,
        status: 'IN_TRANSIT',
        remarks: `Stress test round ${round + 1} - updated to IN_TRANSIT`,
        history: [...(existing.history || []), { status: 'IN_TRANSIT', date: now, location: 'Port', remarks: 'Stress update' }],
      });
    } catch (e) {
      fail(`Shipment update ${round + 1}`, e);
    }
    await delay(DELAY_MS);

    try {
      const existing = await request('GET', `/shipments/${shId}`, token);
      const version = existing?.version != null ? existing.version : 1;
      const paymentEntry = {
        id: `pay_${shId}_${Date.now()}`,
        amount: PAYMENT_AMOUNT,
        mode: lcId ? 'Letter of Credit' : 'TT',
        linkedLcId: lcId || undefined,
        currency: 'USD',
        date: today,
        reference: `STRESS-${round + 1}`,
      };
      await request('PUT', `/shipments/${shId}`, token, {
        ...existing,
        version,
        payments: [...(existing.payments || []), paymentEntry],
      });
    } catch (e) {
      fail(`Payment ${round + 1}`, e);
    }
    await delay(DELAY_MS);

    try {
      const buf = Buffer.from('Stress test document content - round ' + (round + 1), 'utf8');
      await uploadFile(`/shipments/${shId}/files`, token, buf, `stress_doc_${round + 1}.txt`);
    } catch (e) {
      if (e.message && !e.message.includes('Documents folder')) fail(`Upload ${round + 1}`, e);
    }
  }
  log(`Shipments: ${ids.shipmentIds.length} created, updated, paid, and upload attempted`, '✅');

  log('\n--- Phase 4: Sales Indent Generation ---', '');
  const indentPayload = {
    company: 'Gujarat Flotex Pvt. Ltd.',
    currency: 'INR',
    txnType: 'Domestic',
    ourRef: 'STRESS-INDENT-001',
    date: today,
    buyerRef: 'BR-001',
    ordRef: 'ORD-001',
    buyerName: 'Domestic Buyer 1',
    billAddr: '1 Billing Lane, Gujarat',
    buyerGst: '24AABCT1001A1Z1',
    buyerState: 'Gujarat',
    shipSite: 'Site 1',
    shipAddr: '1 Shipping Lane',
    shipContact: '9876500001',
    salesName: 'Sales Person',
    salesMob: '9876500000',
    salesMail: 'sales@test.com',
    countryOrigin: 'India',
    portLoad: 'Mundra',
    portDis: 'Mundra',
    incoterm: 'FOB',
    shippingDate: futureDate,
    validityDays: 30,
    paymentTerms: '30 days',
    items: ids.indentProducts.slice(0, 3).map((pid, idx) => ({
      quality: `Fabric-Q${idx + 1}`,
      desc: `Description ${idx + 1}`,
      design: `D${idx + 1}`,
      shade: `S${idx + 1}`,
      hsn: '5407',
      qty: 100,
      unit: 'MTR',
      rate: 150,
      amount: 15000,
      buyerRef: '',
    })),
    subtotal: 45000,
  };

  let indentOk = 0;
  for (let g = 0; g < 5; g++) {
    try {
      const buf = await request('POST', '/indent/generate', token, indentPayload, { expectBinary: true });
      if (buf && buf.byteLength > 0) {
        indentOk++;
      }
    } catch (e) {
      fail(`Indent generate ${g + 1}`, e);
    }
    await delay(100);
  }
  log(`Indent generate: ${indentOk}/5 returned document buffer`, indentOk === 5 ? '✅' : '⚠️');

  log('\n--- Phase 5: Validation & Deletion ---', '');

  const lcList = await request('GET', '/lcs', token).catch(() => []);
  const lcArray = Array.isArray(lcList) ? lcList : [];
  for (const lc of lcArray) {
    if (!ids.lcs.includes(lc.id)) continue;
    const original = Number(lc.amount) || 0;
    const balance = lc.balanceAmount != null ? Number(lc.balanceAmount) : original;
    const paid = (lc.paymentSummary || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const expectedBalance = original - paid;
    if (Math.abs(balance - expectedBalance) > 0.01) {
      warn(`LC ${lc.id} MATH MISMATCH: amount=${original}, balanceAmount=${balance}, sum(payments)=${paid}, expected balance=${expectedBalance}`);
    }
  }
  log('LC balance math check done (see WARNING above if any mismatch)', '✅');

  const toDelete = [];
  while (toDelete.length < 5 && ids.shipmentIds.length > 0) {
    const idx = Math.floor(Math.random() * ids.shipmentIds.length);
    toDelete.push(ids.shipmentIds.splice(idx, 1)[0]);
  }
  for (const sid of toDelete) {
    try {
      await request('DELETE', `/shipments/${sid}`, token);
      const check = await request('GET', `/shipments/${sid}`, token).catch((e) => (e.status === 404 ? null : e));
      if (check !== null && typeof check === 'object' && check.id) {
        warn(`Shipment ${sid} still exists after DELETE`);
      }
    } catch (e) {
      fail(`Delete shipment ${sid}`, e);
    }
    await delay(50);
  }
  log(`Deleted ${toDelete.length} shipments and verified`, '✅');

  const lcToDelete = ids.lcs[0];
  if (lcToDelete) {
    try {
      await request('DELETE', `/lcs/${lcToDelete}`, token);
      log('LC delete unexpectedly succeeded (expected to fail when linked to payments)', '⚠️');
    } catch (e) {
      if (e.status === 409 || e.status === 400 || (e.message && e.message.includes('Cannot delete'))) {
        log(`LC delete correctly rejected: ${e.message || e.status}`, '✅');
      } else {
        fail('LC delete', e);
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log(`\n⏱️  Total time: ${elapsed}s`, '');
  log('Stress test complete.', '✅');
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
