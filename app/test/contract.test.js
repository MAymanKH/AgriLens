import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateConfig, validateComparison, requestJson, ApiError } from '../src/api.js';
import { waterRange, number, scenarioName, safeUrl } from '../src/model.js';
import { render } from '../src/views.js';

const fixture = async name => JSON.parse(await readFile(new URL(`../../fixtures/comparison/${name}.json`, import.meta.url)));
const config = await fixture('config');
const request = { region_id: 'sample_region', baseline: config.sample_baseline, priority: 'water', scenario: 'average' };
const original = await fixture('water_average');

test('public fixtures satisfy the app boundary, including missing metrics and fewer plans', async () => {
  assert.equal(validateConfig(config), config);
  for (const name of ['water_average', 'one_plan', 'two_plans', 'missing_metrics']) {
    const result = await fixture(name);
    assert.equal(validateComparison(result, request, config), result);
  }
});

test('mismatched or malformed responses cannot replace a verified result', () => {
  const mutations = [
    value => { value.region_id = 'another'; },
    value => { value.scenario = 'driest_year'; },
    value => { value.plans[0].crops.reverse(); },
    value => { value.plans[1].crops = value.plans[0].crops; },
    value => { value.plans[1].water_need_mm.min = -1; },
    value => { value.plans[1].hot_days = '0'; },
    value => { value.plans[1].source_ids = ['unknown']; },
    value => { value.meta.sources[0].url = 'javascript:alert(1)'; },
  ];
  for (const mutate of mutations) {
    const result = structuredClone(original); mutate(result);
    assert.throws(() => validateComparison(result, request, config), ApiError);
  }
  const badConfig = structuredClone(config); badConfig.sample_baseline[0] = 'winter_a';
  assert.throws(() => validateConfig(badConfig), ApiError);
});

test('null metrics, real zeros, safe source links and unreviewed scenario scope remain distinct', () => {
  assert.equal(waterRange({ min: null, max: 100 }), 'Not evaluated');
  assert.equal(waterRange({ min: 0, max: 0 }), '0–0');
  assert.equal(number(null), 'Not evaluated'); assert.equal(number(0), '0');
  assert.equal(number(279.125), '279.125');
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(scenarioName('hottest_year', 'unreviewed'), 'Hottest eligible rotation anchor');
});

test('API content is escaped and sources cannot inject markup', () => {
  const result = structuredClone(original); result.meta.warnings.push('<img src=x onerror=alert(1)>');
  const html = render({ config, baseline: config.sample_baseline, priority: 'water', screen: 'compare', mode: 'fixture', result });
  assert.ok(html.includes('&lt;img')); assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('Best option'));
});

test('client reports server errors, malformed JSON and its eight-second deadline', async () => {
  const previous = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'INVALID_INPUT', message: 'Choose a summer crop.' } }), { status: 400 });
    await assert.rejects(requestJson('/api/compare'), error => error.code === 'INVALID_INPUT' && error.message === 'Choose a summer crop.');
    globalThis.fetch = async () => new Response('<html>Unavailable</html>');
    await assert.rejects(requestJson('/api/config'), ApiError);
    globalThis.fetch = async (_url, { signal }) => {
      await new Promise((_resolve, reject) => {
        const keepAlive = setTimeout(() => reject(new Error('deadline not enforced')), 1000);
        signal.addEventListener('abort', () => { clearTimeout(keepAlive); reject(signal.reason); });
      });
    };
    await assert.rejects(requestJson('/api/config', { timeoutMs: 10 }), error => error.message.includes('timed out'));
  } finally { globalThis.fetch = previous; }
});
