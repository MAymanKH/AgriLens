import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { farmerBenefits } from '../src/farmer-benefits.js';
import { render } from '../src/views.js';

const config = JSON.parse(await readFile(new URL('../../fixtures/comparison/config.json', import.meta.url)));
const fixture = JSON.parse(await readFile(new URL('../../fixtures/comparison/water_average.json', import.meta.url)));
const baseline = fixture.plans[0];
const alternative = fixture.plans[1];
const state = { config, result: fixture, language: 'en', mode: 'fixture', screen: 'compare' };

test('water-volume conversion and heat differences are derived from returned plans', () => {
  // Independent volume arithmetic: midpoint depth in metres × 10,000 m².
  const beforeM3 = ((360 + 640) / 2 / 1000) * 10000;
  const afterM3 = ((220 + 340) / 2 / 1000) * 10000;
  assert.ok(Math.abs(farmerBenefits(baseline, alternative).waterChangeM3PerHectare - (afterM3 - beforeM3)) < 1e-9);
  assert.deepEqual(farmerBenefits(baseline, alternative), {
    waterChangeM3PerHectare: -2200,
    hotDayChange: 0, baselineCropCount: 2, alternativeCropCount: 2,
  });
  const higher = { ...alternative, water_need_mm: { min: 600, max: 800 }, hot_days: baseline.hot_days + 12.5 };
  assert.equal(farmerBenefits(baseline, higher).waterChangeM3PerHectare, 2000);
  assert.equal(farmerBenefits(baseline, higher).hotDayChange, 12.5);
  assert.equal(farmerBenefits(baseline, { ...alternative, hot_days: baseline.hot_days - 12 }).hotDayChange, -12);
});

test('missing inputs stay unknown, zero stays evaluated, and crop counts use distinct IDs', () => {
  assert.equal(farmerBenefits(baseline, { ...alternative, water_need_mm: { min: null, max: 340 }, hot_days: null }).waterChangeM3PerHectare, null);
  assert.equal(farmerBenefits({ ...baseline, hot_days: null }, alternative).hotDayChange, null);
  assert.equal(farmerBenefits(baseline, { ...alternative, hot_days: null }).hotDayChange, null);
  const zero = { ...baseline, water_need_mm: { min: 0, max: 0 }, hot_days: 0 };
  assert.equal(farmerBenefits(zero, zero).waterChangeM3PerHectare, 0);
  assert.equal(farmerBenefits(zero, zero).hotDayChange, 0);
  assert.equal(farmerBenefits(baseline, fixture.plans[2]).alternativeCropCount, 4);
});

test('farmer summaries explain practical amounts and limits in both languages', () => {
  const html = render(state);
  assert.match(html, /About 2,200 m³ less water needed per hectare/);
  assert.match(html, /Same historical heat exposure/);
  assert.match(html, /2 in your rotation → 4 in this option/);
  assert.match(html, /middle of each estimated range/);
  assert.match(html, /not water saved at the pump/);
  assert.match(html, /Land saved and harvest gained/);
  assert.match(html, /Not evaluated\. We do not have yield or crop-loss data/);
  assert.equal((html.match(/class="farmer-benefits"/g) || []).length, 2);
  const ar = render({ ...state, language: 'ar' });
  assert.match(ar, /احتياج مياه أقل بحوالي ٢٬٢٠٠ متر مكعب لكل هكتار/);
  assert.ok(!ar.includes('What changes for your farm?'));
  const unknown = structuredClone(fixture);
  unknown.plans[1].water_need_mm.min = null;
  unknown.plans[1].hot_days = null;
  const card = render({ ...state, result: unknown }).split('data-plan="water_conscious"')[1].split('</article>')[0];
  assert.ok(!card.includes('m³ less'));
  assert.match(card, /Not evaluated/);
});
