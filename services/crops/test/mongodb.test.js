const test = require('node:test');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const {configuration} = require('../src/config');
const {connect, model, ensureCollection} = require('../src/database');
const {importStaging, verifyExisting} = require('../src/repository');
const {createApp} = require('../src/app');
const {once} = require('node:events');
const research = require('../../../data/processed/mongodb/crop_catalog_document.json');

test('real MongoDB import/readback/retry/conflict/schema protection and HTTP approval gate', async () => {
  const dbName = `crops_test_${randomUUID().replaceAll('-', '')}_fixtures`;
  const connection = await connect({...configuration(), dbName});
  try {
    await ensureCollection(connection); await ensureCollection(connection);
    const Model = model(connection);
    const doc = structuredClone(research); doc.created_at = new Date(doc.created_at.$date);
    assert.equal(await importStaging(Model, doc), 'inserted');
    const first = await Model.findById(doc._id).lean();
    assert.equal(verifyExisting(first, doc), 'unchanged');
    assert.equal(await importStaging(Model, doc), 'unchanged');
    assert.deepEqual(await Model.findById(doc._id).lean(), first);
    const changed = structuredClone(doc); changed.crops[0].water_need_mm.max += 1;
    await assert.rejects(importStaging(Model, changed), /conflicts/);
    assert.deepEqual(await Model.findById(doc._id).lean(), first);
    await assert.rejects(Model.collection.insertOne({...doc, _id: 'bad-version', schema_version: 2}), /validation/);
    await Model.collection.updateOne({_id: doc._id}, {$set: {status: 'sealed'}});
    await assert.rejects(importStaging(Model, doc), /conflicts/);
    const server = createApp({mode: 'live', catalogId: doc._id, Model, knownRegion: doc.region.id}).listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const base = `http://127.0.0.1:${server.address().port}`;
      const response = await fetch(`${base}/internal/crops?region_id=${doc.region.id}`);
      assert.equal(response.status, 422); assert.equal((await response.json()).error.code, 'INSUFFICIENT_DATA');
      await connection.close();
      const outage = await fetch(`${base}/internal/crops?region_id=${doc.region.id}`);
      assert.equal(outage.status, 503); assert.equal((await outage.json()).error.code, 'SERVICE_UNAVAILABLE');
    } finally {server.closeAllConnections(); await new Promise(resolve => server.close(resolve));}
  } finally {
    // Only this test's randomly named database can be removed.
    await connection.close();
    const cleanup = await connect({...configuration(), dbName});
    try { await cleanup.dropDatabase(); } finally {await cleanup.close();}
  }
});
