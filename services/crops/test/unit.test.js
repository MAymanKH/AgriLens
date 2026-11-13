const test = require('node:test');
const assert = require('node:assert/strict');
const {once} = require('node:events');
const {createApp} = require('../src/app');
const {validateApi, validateSnapshot, toApi, cropFitsSlot, crossesYear} = require('../src/catalog');
const fixture = require('../../../fixtures/crops/catalog.json');
const research = require('../../../data/processed/mongodb/crop_catalog_document.json');

function snapshot() {
  // Test-only invented approvals; never persisted in the development database.
  return {_id: 'unit-test', schema_version: 1, decision_revision: 'a'.repeat(40),
    kind: 'observed', status: 'approved', created_at: new Date(),
    approval: {research_record: 'TEST ONLY', technical_record: 'TEST ONLY', approved_at: new Date()},
    region: {id: 'sample_region', name: 'TEST ONLY', coordinates: {lat: 0, lon: 0}}, limitations: ['TEST ONLY'],
    slot_order: fixture.slot_order, crops: structuredClone(fixture.crops),
    sources: fixture.sources.map(s => ({...s, title: 'Test source'}))};
}
async function withServer(app, run) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
function memoryModel(document, outage = false) {
  return {db: {db: {command: async () => {if (outage) throw new Error('secret connection details');}}},
    findOne: query => ({lean: () => ({maxTimeMS: async () => document && document._id === query._id ? document : null})})};
}

test('fixture HTTP contract, labels, health, missing/duplicate query and unknown region', async () => {
  await withServer(createApp({mode: 'fixture', fixture}), async base => {
    const response = await fetch(`${base}/internal/crops?region_id=sample_region`);
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), fixture);
    assert.equal(response.headers.get('x-agrilens-data-mode'), 'fixture');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await fetch(`${base}/health`)).status, 200);
    for (const query of ['', '?region_id=', '?region_id=a&region_id=b', '?region_id[x]=a']) {
      const r = await fetch(`${base}/internal/crops${query}`);
      assert.equal(r.status, 400); assert.equal((await r.json()).error.code, 'INVALID_INPUT');
    }
    const r = await fetch(`${base}/internal/crops?region_id=unknown`);
    assert.equal(r.status, 404); assert.equal((await r.json()).error.code, 'UNKNOWN_REGION');
  });
});
test('live projection omits all database metadata and source titles', async () => {
  const doc = snapshot();
  await withServer(createApp({mode: 'live', catalogId: doc._id, Model: memoryModel(doc)}), async base => {
    const r = await fetch(`${base}/internal/crops?region_id=sample_region`);
    assert.equal(r.status, 200); assert.deepEqual(await r.json(), fixture);
    assert.equal((await fetch(`${base}/health`)).status, 200);
  });
});
for (const status of ['staging', 'sealed', 'rejected']) {
  test(`live rejects ${status} catalog with no fallback`, async () => {
    const doc = snapshot(); doc.status = status;
    await withServer(createApp({mode: 'live', catalogId: doc._id, Model: memoryModel(doc)}), async base => {
      const r = await fetch(`${base}/internal/crops?region_id=sample_region`);
      assert.equal(r.status, 422); assert.equal((await r.json()).error.code, 'INSUFFICIENT_DATA');
      assert.equal((await fetch(`${base}/health`)).status, 503);
    });
  });
}
test('live rejects fixture data, pending evidence and unknown schema versions', () => {
  for (const mutate of [d => {d.kind = 'fixture';}, d => {d.schema_version = 2;}, d => {d.approval = null;},
    d => {d.crops[0].eligible_for_live = false;}, d => {d.crops[0].evidence_status = 'pending';},
    d => {d.crops[0].grow_window.start_month = null;}]) {
    const doc = snapshot(); mutate(doc); assert.throws(() => validateSnapshot(doc, {live: true}));
  }
});
test('no selection returns insufficient evidence and storage outage is retryable without leaking details', async () => {
  for (const outage of [false, true]) {
    await withServer(createApp({mode: 'live', Model: memoryModel(null, outage)}), async base => {
      const r = await fetch(`${base}/internal/crops?region_id=sample_region`);
      assert.equal(r.status, outage ? 503 : 422);
      assert.equal((await r.json()).error.code, outage ? 'SERVICE_UNAVAILABLE' : 'INSUFFICIENT_DATA');
    });
  }
});
test('provided research catalog is valid staging data but cannot be served live', () => {
  const doc = structuredClone(research); doc.created_at = new Date(doc.created_at.$date);
  validateSnapshot(doc); assert.throws(() => validateSnapshot(doc, {live: true}));
  assert.equal(toApi(doc).crops.length, 8);
  assert.equal(toApi(doc).crops[0].kc_stages, undefined);
});
test('null and partially unknown water ranges remain null, zero is a real value', () => {
  const doc = structuredClone(fixture);
  for (const water of [{min: null, max: null}, {min: null, max: 200}, {min: 0, max: 0}]) {
    doc.crops[0].water_need_mm = water; validateApi(doc); assert.deepEqual(doc.crops[0].water_need_mm, water);
  }
});
test('rejects negative/nonfinite/reversed ranges, duplicate IDs, missing sources and bad months', () => {
  const invalid = [d => {d.crops[0].water_need_mm.min = -1;}, d => {d.crops[0].water_need_mm.max = NaN;},
    d => {d.crops[0].water_need_mm.min = 500;}, d => {d.crops[1].id = d.crops[0].id;},
    d => {d.sources.push(d.sources[0]);}, d => {d.crops[0].source_ids = ['missing'];},
    d => {d.crops[0].valid_seasons = ['spring'];}, d => {d.crops[0].grow_window.end_month = 13;},
    d => {d.crops[0].grow_window.start_month = 1.5;}, d => {d.slot_order.reverse();},
    d => {d.crops[0].is_legume = 'false';}];
  for (const mutate of invalid) {const doc = structuredClone(fixture); mutate(doc); assert.throws(() => validateApi(doc));}
});
test('slot compatibility and December–January wrap do not invent rotation years', () => {
  assert.equal(cropFitsSlot(fixture.crops[0], 'y1_summer'), true);
  assert.equal(cropFitsSlot(fixture.crops[0], 'y1_winter'), false);
  assert.equal(cropFitsSlot(fixture.crops[0], 'unknown'), false);
  assert.equal(crossesYear({start_month: 11, end_month: 4}), true);
  assert.equal(crossesYear({start_month: 4, end_month: 4}), false);
  assert.equal(crossesYear({start_month: null, end_month: 4}), null);
});
module.exports = {snapshot, withServer};

test('pinned catalog determines region independently of the research checkout', async () => {
  const doc = snapshot();
  doc.region.id = 'new_approved_region';
  await withServer(createApp({mode: 'live', catalogId: doc._id, Model: memoryModel(doc)}), async base => {
    const result = await fetch(`${base}/internal/crops?region_id=new_approved_region`);
    assert.equal(result.status, 200);
    assert.equal((await result.json()).region_id, 'new_approved_region');
    assert.equal((await fetch(`${base}/internal/crops?region_id=old_region`)).status, 404);
  });
});

test('unreviewed mode serves sealed data with disclosure while preserving validation and live gates', async () => {
  const doc = snapshot(); doc.status = 'sealed'; doc.approval = null;
  doc.crops[0].eligible_for_live = false; doc.crops[0].evidence_status = 'pending';
  doc.crops[0].water_need_mm = {min:null,max:null};
  validateSnapshot(doc, {unreviewed:true});
  assert.throws(() => validateSnapshot(doc, {live:true}));
  await withServer(createApp({mode:'unreviewed',catalogId:doc._id,Model:memoryModel(doc)}),async base=>{
    const r=await fetch(`${base}/internal/crops?region_id=sample_region`);
    assert.equal(r.status,200);assert.equal(r.headers.get('x-agrilens-data-mode'),'unreviewed');
    assert.deepEqual((await r.json()).crops[0].water_need_mm,{min:null,max:null});
  });
  for(const mutate of [d=>{d.status='staging';},d=>{d.status='rejected';},d=>{d.kind='fixture';},d=>{d.schema_version=2;},d=>{d.crops[0].grow_window.start_month=null;},d=>{d.crops[0].water_need_mm.min=-1;},d=>{d.crops[0].source_ids=['missing'];}]){
    const invalid=structuredClone(doc);mutate(invalid);assert.throws(()=>validateSnapshot(invalid,{unreviewed:true}));
  }
});
