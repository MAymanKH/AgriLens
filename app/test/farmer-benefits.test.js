import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { render } from '../src/views.js';

const config = JSON.parse(await readFile(new URL('../../fixtures/comparison/config.json', import.meta.url)));
const fixture = JSON.parse(await readFile(new URL('../../fixtures/comparison/water_average.json', import.meta.url)));
const state = { config, result: fixture, language: 'en', mode: 'fixture', screen: 'compare' };

test('comparison omits farmer summaries and retains outcome limitations in both languages', () => {
  const html = render(state);
  assert.match(html, /Land saved and harvest gained/);
  assert.match(html, /Not evaluated\. We do not have yield or crop-loss data/);
  assert.equal((html.match(/class="farmer-benefits"/g) || []).length, 0);
  const ar = render({ ...state, language: 'ar' });
  assert.ok(!ar.includes('إيه اللي هيتغيّر في أرضك؟'));
  assert.ok(!ar.includes('What changes for your farm?'));
  const unknown = structuredClone(fixture);
  unknown.plans[1].water_need_mm.min = null;
  unknown.plans[1].hot_days = null;
  const card = render({ ...state, result: unknown }).split('data-plan="water_conscious"')[1].split('</article>')[0];
  assert.ok(!card.includes('m³ less'));
  assert.match(card, /Not evaluated/);
});
