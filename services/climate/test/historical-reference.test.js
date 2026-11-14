import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadHistoricalReference, historicalReference } from '../src/climate/historicalReference.js';
const coordinates = { lat: 30.58057, lon: 31.43332 };

test('pinned NASA reference has exact coverage, leap days, units and original provenance', () => {
  const reference = loadHistoricalReference();
  assert.equal(reference.daily.length, 10958);
  assert.equal(reference.daily.filter(row => row.date.endsWith('02-29')).length, 8);
  assert.equal(reference.daily[0].date, '1991-01-01');
  assert.equal(reference.daily.at(-1).date, '2020-12-31');
  assert.equal(reference.scientific_approval, 'pending');
  assert.equal(reference.provenance.artifacts.length, 3);
});

test('changed raw bytes or manifest, absent files and mismatched points cannot supply reference data', () => {
  const read = name => readFileSync(new URL(`../../../docs/research/power_1991_2020/${name}`, import.meta.url));
  for (const filename of ['audit.json', 'raw_1991_2000.json']) {
    assert.throws(() => loadHistoricalReference(name => name === filename ? Buffer.concat([read(name), Buffer.from(' ')]) : read(name)));
  }
  assert.deepEqual(historicalReference('unreviewed', 'zankalon_sharkia', coordinates, () => { throw new Error('missing'); }), { status: 'unavailable' });
  assert.deepEqual(historicalReference('unreviewed', 'zankalon_sharkia', { lat: 0, lon: 0 }), { status: 'unavailable' });
});

test('unreviewed reference cannot leak into live or fixture modes or another region', () => {
  const load = () => { throw new Error('must not load'); };
  for (const mode of ['live', 'fixture']) assert.equal(historicalReference(mode, 'zankalon_sharkia', coordinates, load), undefined);
  assert.equal(historicalReference('unreviewed', 'other', coordinates, load), undefined);
});
