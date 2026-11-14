import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { percentageDifference, waterMidpoint } from '../src/model.js';
import { render } from '../src/views.js';
import { serviceText, visibleWarnings } from '../src/i18n.js';

const config = {
  region: { id: 'zankalon_sharkia', name: 'Zankalon (unreviewed prototype)' },
  crops_by_season: { summer: [{ id: 'soybean', name: 'Soybean' }], winter: [{ id: 'wheat', name: 'Wheat' }] },
  priorities: ['water'], scenarios: ['average'], sample_baseline: ['soybean', 'wheat', 'soybean', 'wheat'],
};
const state = { config, baseline: config.sample_baseline, priority: 'water', mode: 'unreviewed', screen: 'setup', fieldErrors: [] };

test('soybean selection has its own local botanical illustration', async () => {
  assert.match(render(state), /src="\/src\/assets\/soybean.svg"/);
  assert.ok((await readFile(new URL('../src/assets/soybean.svg', import.meta.url))).byteLength > 0);
});

test('routine screens omit prototype banners and region suffixes', () => {
  const html = render(state);
  assert.ok(!html.includes('Unreviewed prototype'));
  assert.ok(!html.includes('(unreviewed prototype)'));
});

test('Arabic translates whole service sentences without changing metric values', async () => {
  const result = JSON.parse(await readFile(new URL('../../fixtures/comparison/water_average.json', import.meta.url)));
  result.plans[0].reasons = ['Your baseline is preserved unchanged.', 'Water uses summed indicative ranges; heat uses whole-month growing-window exposure.'];
  result.plans[0].soil_note = '2 botanical families; 1 legume slots. Soil outcomes are not predicted.';
  const html = render({ ...state, screen: 'compare', language: 'ar', result });
  assert.ok(!html.includes('Your baseline is preserved unchanged.'));
  assert.ok(!html.includes('botanical families'));
  assert.ok(html.includes('٣٦٠–٦٤٠'));
});

test('prototype warning removal retains useful warnings and original response data', async () => {
  const result = JSON.parse(await readFile(new URL('../../fixtures/comparison/water_average.json', import.meta.url)));
  const status = 'UNREVIEWED PROTOTYPE: retained research inputs and proposed crop calendars. Scientific review was waived; these results are not validated agricultural recommendations.';
  result.meta.warnings = [status, 'Water need is Not evaluated where any crop range is incomplete.'];
  const html = render({ ...state, result, screen: 'compare' });
  assert.ok(!html.includes('UNREVIEWED PROTOTYPE'));
  assert.ok(html.includes('Water need is Not evaluated'));
  assert.equal(result.meta.warnings[0], status);
  assert.deepEqual(visibleWarnings(result.meta.warnings), [result.meta.warnings[1]]);
});

test('service translations handle whole dynamic sentences and leave unfamiliar evidence intact', () => {
  const sentences = [
    '2 botanical families; 1 legume slots. Soil outcomes are not predicted.',
    'Family diversity not evaluated; legume presence not evaluated. Soil outcomes are not predicted.',
    'First distinct alternative ranked by water priority; trade-offs remain visible.',
    'Only 1 distinct valid alternatives are available.',
    'Common complete anchors: 2016, 2017; arithmetic mean of per-anchor crop-day counts.',
    'Eligible complete calendar-year and rotation anchors: 2016, 2017; greatest annual mean daily Tmax; earliest year wins exact ties. The selected year anchors the first summer; following slots use their actual consecutive historical dates.',
    'Eligible complete calendar-year and rotation anchors: 2016, 2017; least annual total precipitation; earliest year wins exact ties. The selected year anchors the first summer; following slots use their actual consecutive historical dates.',
    'Historical stress year selected among years with complete rotation coverage, not the entire climate record. Full-record hottest_year year: 2024; eligible-anchor selection: 2023.',
    'Climate retrieved 2026-11-13T12:32:28Z; LST; 0.5 x 0.625 degree (MERRA-2 / GEOS-FP).',
    'Section 3.3.4, Table 14; indicative seasonal evapotranspiration under optimal conditions.',
  ];
  for (const sentence of sentences) {
    assert.notEqual(serviceText('ar', sentence), sentence);
    assert.equal(serviceText('en', sentence), sentence);
  }
  assert.ok(serviceText('ar', sentences[0]).includes('ده مش توقع لنتائج التربة'));
  assert.ok(serviceText('ar', sentences[7]).includes('٢٠٢٤'));
  assert.ok(serviceText('ar', sentences[7]).includes('٢٠٢٣'));
  assert.equal(serviceText('ar', 'New evidence; review it independently.'), 'New evidence; review it independently.');
});

test('percentage comparisons use the baseline and range midpoints, preserving unknowns', () => {
  assert.equal(percentageDifference(500, 280), -44);
  assert.equal(percentageDifference(100, 120), 20);
  assert.equal(percentageDifference(100, 100), 0);
  assert.equal(percentageDifference(0, 20), null);
  assert.equal(percentageDifference(null, 20), null);
  assert.equal(percentageDifference(20, null), null);
  assert.equal(waterMidpoint({ min: 360, max: 640 }), 500);
  assert.equal(waterMidpoint({ min: null, max: 640 }), null);
});

test('alternative cards show directional percentages and retain original numbers in details', async () => {
  const result = JSON.parse(await readFile(new URL('../../fixtures/comparison/water_average.json', import.meta.url)));
  const html = render({ ...state, result, screen: 'compare' });
  assert.match(html, /44% lower/);
  assert.match(html, /No change \(0%\)/);
  assert.match(html, /Based on range midpoints/);
  assert.match(html, /metric-value metric-higher[^]*?360–640/);
  assert.match(html, /metric-value metric-lower[^]*?220–340/);
  assert.match(render({ ...state, result, screen: 'details' }), /220–340/);
  assert.match(render({ ...state, result, screen: 'compare', language: 'ar' }), /أقل بنسبة ٤٤٪/);
});

test('missing water names only affected crops while heat remains comparable', async () => {
  const result = JSON.parse(await readFile(new URL('../../fixtures/comparison/water_average.json', import.meta.url)));
  result.plans[1].crops = ['soybean', 'faba_bean', 'soybean', 'faba_bean'];
  result.plans[1].water_need_mm = { min: null, max: null };
  result.meta.warnings.push('Crop faba_bean: water-need range is incomplete; rotation water total is Not evaluated.');
  const html = render({ ...state, result, screen: 'compare', language: 'ar' });
  const card = html.split('data-plan="water_conscious"')[1].split('</article>')[0];
  assert.match(card, /فول بلدي: بيانات احتياج المياه غير مكتملة/);
  assert.match(card, /بدون تغيير/);
  assert.ok(!html.split('data-plan="baseline"')[1].split('</article>')[0].includes('بيانات احتياج المياه غير مكتملة'));
});

test('metric colors follow actual trade-offs and leave equal or missing values neutral', async () => {
  const result = JSON.parse(await readFile(new URL('../../fixtures/comparison/water_average.json', import.meta.url)));
  result.plans[1].hot_days = result.plans[0].hot_days * 1.2;
  let html = render({ ...state, result, screen: 'compare' });
  let card = html.split('data-plan="water_conscious"')[1].split('</article>')[0];
  assert.match(card, /metric-difference metric-higher">20% higher/);
  assert.equal((card.match(/metric-value metric-higher/g) || []).length, 2);
  result.plans[1].water_need_mm = { min: null, max: null };
  result.plans[1].hot_days = result.plans[0].hot_days;
  html = render({ ...state, result, screen: 'compare' });
  card = html.split('data-plan="water_conscious"')[1].split('</article>')[0];
  assert.ok(!card.includes('metric-value metric-higher'));
  assert.ok(!card.includes('metric-value metric-lower'));
});
