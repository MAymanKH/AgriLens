import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateComparison } from '../src/api.js';
import { render } from '../src/views.js';
const read = name => JSON.parse(readFileSync(new URL(`../../fixtures/comparison/${name}.json`, import.meta.url)));
const config = read('config');
const request = { region_id: config.region.id, baseline: config.sample_baseline, priority: 'water', scenario: 'average' };
const original = read('water_average');
const reference = read('historical_reference').meta.historical_reference;
function result() { return { ...structuredClone(original), meta: { ...structuredClone(original.meta), historical_reference: structuredClone(reference) } }; }

test('historical context renders the same rotations, chart, exact values, limitations and Arabic', () => {
  const data = validateComparison(result(), request, config);
  const state = { config, result: data, screen: 'details', mode: 'unreviewed' };
  const html = render(state);
  assert.match(html, /Long-term heat context/);
  assert.match(html, /2 complete rotation start years: 1991–1992/);
  assert.match(html, /<svg viewBox="0 0 600 215"/);
  assert.match(html, /Year-by-year values/);
  assert.match(html, /not a validated agricultural recommendation/);
  assert.match(html, /not crop damage or a forecast/);
  const arabic = render({ ...state, language: 'ar' });
  assert.match(arabic, /التعرّض للحرارة على المدى الطويل/);
  assert.ok(!arabic.includes('Year-by-year values'));
  assert.ok(!arabic.includes('Long-term heat context'));
});

test('incomplete or mismatched reference never breaks or mislabels the existing comparison', () => {
  for (const mutate of [
    r => { r.plans[0].crops.reverse(); },
    r => { r.anchors.reverse(); },
    r => { r.plans[0].mean_hot_days = 0; },
    r => { r.plans[0].by_anchor[0].hot_days = null; },
    r => { r.provenance.source_url = 'javascript:alert(1)'; },
    r => { r.heat_threshold_c = 99; },
  ]) {
    const data = result(); mutate(data.meta.historical_reference);
    const checked = validateComparison(data, request, config);
    assert.deepEqual(checked.meta.historical_reference, { status: 'unavailable' });
    assert.deepEqual(checked.plans, original.plans);
    assert.match(render({ config, result: checked, screen: 'details', mode: 'unreviewed' }), /historical reference is unavailable/);
  }
  assert.ok(!render({ config, result: original, screen: 'details', mode: 'fixture' }).includes('Long-term heat context'));
});
