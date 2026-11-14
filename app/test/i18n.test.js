import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { render } from '../src/views.js';
import { cropLabel, regionLabel, t, readLanguage, saveLanguage } from '../src/i18n.js';
import { number, waterRange, scenarioName } from '../src/model.js';

test('Arabic labels retain API identifiers, scientific scope and unknown values', () => {
  assert.equal(cropLabel('ar', 'maize', 'Maize'), 'ذرة شامية');
  assert.equal(cropLabel('ar', 'unknown', 'New crop'), 'New crop');
  assert.equal(regionLabel('ar', { id: 'unknown', name: 'Original region' }), 'Original region');
  assert.equal(scenarioName('hottest_year', 'unreviewed', 'ar'), 'أحرّ سنة تنفع نبدأ فيها الدورة');
  assert.equal(number(null, 'ar'), 'لم يتم التقييم');
  assert.equal(waterRange({ min: null, max: 0 }, 'ar'), 'لم يتم التقييم');
  assert.equal(number(0, 'ar'), '٠');
  assert.equal(number(0), '0');
  assert.equal(t('en', 'Compare rotations'), 'Compare rotations');
});

test('Arabic renders UI text while preserving and escaping original service evidence', async () => {
  const config = JSON.parse(await readFile(new URL('../../fixtures/comparison/config.json', import.meta.url)));
  const result = JSON.parse(await readFile(new URL('../../fixtures/comparison/missing_metrics.json', import.meta.url)));
  result.meta.warnings = ['Original evidence <script>alert(1)</script>'];
  const state = { config, baseline: config.sample_baseline, priority: 'water', mode: 'fixture', result, language: 'ar', screen: 'compare' };
  const html = render(state);
  assert.ok(html.includes('قارن البدائل'));
  assert.ok(html.includes('لم يتم التقييم'));
  assert.ok(html.includes('Original evidence &lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('ليست قياسات من NASA'));
  assert.ok(!html.includes('Compare your options'));
  assert.deepEqual(result.meta.warnings, ['Original evidence <script>alert(1)</script>']);
  assert.ok(render({ ...state, language: 'en' }).includes('Compare your options'));
});

test('language storage validates saved values and tolerates blocked storage', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    let saved = 'invalid';
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      getItem: () => saved, setItem: (_key, value) => { saved = value; },
    } });
    assert.equal(readLanguage(), 'en');
    saveLanguage('ar'); assert.equal(readLanguage(), 'ar');
    saveLanguage('en'); assert.equal(readLanguage(), 'en');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Storage blocked'); } });
    assert.equal(readLanguage(), 'en'); assert.doesNotThrow(() => saveLanguage('ar'));
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
});
