// Reusable browser acceptance harness. Uses an externally installed Playwright.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { createAppServer } from '../server.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const fixture = async name => JSON.parse(await readFile(new URL(`../../fixtures/comparison/${name}.json`, import.meta.url)));
const config = await fixture('config');
const app = createAppServer({ comparisonUrl: process.env.COMPARISON_BASE_URL });
app.listen(0, '127.0.0.1'); await once(app, 'listening');
const url = `http://127.0.0.1:${app.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_BIN ? { executablePath: process.env.CHROMIUM_BIN } : {}) });
const output = new URL('../../.local/app-verification/', import.meta.url);
await mkdir(output, { recursive: true });
let passed = 0;
async function run(name, action) { await action(); passed++; console.log(`PASS ${name}`); }
async function heading(page, name) { await page.getByRole('heading', { level: 1, name, exact: true }).waitFor(); }
async function hasText(page, text) { await page.getByText(text, { exact: false }).first().waitFor(); }
async function noOverflow(page) { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); }
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  let profile = 'water_average'; let configUnavailable = false; let delayedResolve; let delayNext = false; let lastRequest;
  await page.route('**/api/config', route => route.fulfill({ status: configUnavailable ? 503 : 200, contentType: 'application/json', headers: { 'X-AgriLens-Data-Mode': 'fixture' }, body: JSON.stringify(configUnavailable ? { error: { code: 'SERVICE_UNAVAILABLE', message: 'Crop choices unavailable.' } } : config) }));
  await page.route('**/api/compare', async route => {
    lastRequest = route.request().postDataJSON();
    if (delayNext) { delayNext = false; await new Promise(resolve => { delayedResolve = resolve; }); }
    let result;
    if (profile === 'malformed') result = { plans: [] };
    else result = await fixture(profile);
    if (!result.error && profile === 'water_average') result = { ...result, priority: lastRequest.priority, plans: result.plans.map((plan, i) => i === 0 ? { ...plan, crops: lastRequest.baseline } : plan) };
    await route.fulfill({ status: result.error ? profile === 'service_unavailable' ? 503 : 422 : 200, contentType: 'application/json', headers: { 'X-AgriLens-Data-Mode': 'fixture' }, body: JSON.stringify(result) }).catch(() => {});
  });
  await run('config failure is retryable', async () => {
    configUnavailable = true; await page.goto(url); await hasText(page, 'Crop choices unavailable.');
    configUnavailable = false; await page.getByRole('button', { name: 'Try again' }).click();
    await page.getByLabel('Year 1 Summer').waitFor();
  });
  await run('setup is labelled, season-filtered, keyboard usable and responsive', async () => {
    assert.equal(await page.getByLabel('Year 1 Summer').inputValue(), 'summer_a');
    assert.equal(await page.getByLabel('Year 1 Winter').locator('option').count(), 2);
    await hasText(page, 'Synthetic development data'); await noOverflow(page);
    await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(() => document.activeElement !== document.body));
    await page.screenshot({ path: new URL('setup-desktop.png', output).pathname, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 }); await noOverflow(page);
    await page.screenshot({ path: new URL('setup-mobile.png', output).pathname, fullPage: true });
  });
  await run('setup to comparison to details preserves input and uses only public endpoints', async () => {
    await page.getByRole('radio', { name: 'Less heat exposure', exact: true }).check();
    await page.getByRole('button', { name: 'Compare rotations', exact: true }).click(); await heading(page, 'Compare your options');
    assert.equal(lastRequest.priority, 'heat'); assert.equal(await page.locator('[data-plan]').count(), 3);
    await page.getByRole('button', { name: 'See details & stress test' }).click(); await heading(page, 'Details & historical stress test');
    await noOverflow(page); await page.screenshot({ path: new URL('details-mobile.png', output).pathname, fullPage: true });
    await page.getByRole('button', { name: 'Edit choices' }).click();
    assert.equal(await page.getByRole('radio', { name: 'Less heat exposure', exact: true }).isChecked(), true);
    assert.equal(await page.getByLabel('Year 1 Summer').inputValue(), 'summer_a');
    await page.getByRole('radio', { name: 'Less water', exact: true }).check();
  });
  await run('invalid season input is rejected beside the crop control', async () => {
    await page.getByLabel('Year 1 Summer').evaluate(select => {
      select.add(new Option('Invalid winter crop', 'winter_a'));
      select.value = 'winter_a'; select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.getByRole('button', { name: 'Compare rotations', exact: true }).click();
    await hasText(page, 'Choose a supported summer crop.');
    assert.equal(await page.getByLabel('Year 1 Summer').getAttribute('aria-invalid'), 'true');
    await page.getByRole('button', { name: 'Reset example' }).click();
  });
  for (const [name, count] of [['one_plan', 1], ['two_plans', 2], ['missing_metrics', 3]]) {
    await run(`${name} displays only provided plans and truthful unknowns`, async () => {
      profile = name; await page.getByRole('button', { name: 'Compare rotations', exact: true }).click(); await heading(page, 'Compare your options');
      assert.equal(await page.locator('[data-plan]').count(), count);
      if (name === 'missing_metrics') await hasText(page, 'Not evaluated');
      await page.getByRole('button', { name: 'Edit choices' }).click();
    });
  }
  await run('service errors and malformed success never replace results with invented values', async () => {
    profile = 'service_unavailable'; await page.getByRole('button', { name: 'Compare rotations', exact: true }).click(); await page.getByRole('alert').waitFor();
    assert.equal(await page.getByLabel('Year 1 Summer').inputValue(), 'summer_a');
    profile = 'malformed'; await page.getByRole('button', { name: 'Try again' }).click(); await hasText(page, 'incomplete response');
    profile = 'water_average'; await page.getByRole('button', { name: 'Try again' }).click(); await heading(page, 'Compare your options');
  });
  await run('failed scenario preserves and labels previous result; retry switches successfully', async () => {
    await page.getByRole('button', { name: 'See details & stress test' }).click();
    profile = 'incomplete_scenario'; await page.getByLabel('Historical scenario', { exact: true }).selectOption('hottest_year');
    await hasText(page, 'Showing previous result: Historical average.'); assert.equal(await page.getByLabel('Historical scenario', { exact: true }).inputValue(), 'average');
    profile = 'water_hottest_year'; await page.getByRole('button', { name: 'Try again' }).click();
    await page.waitForFunction(() => document.querySelector('#scenario')?.value === 'hottest_year' && !document.querySelector('#scenario').disabled);
    assert.equal(lastRequest.scenario, 'hottest_year');
  });
  await run('source references open their source and stay on details', async () => {
    await page.locator('a[href^="#source-"]').first().click();
    assert.equal(await page.locator('#sources').getAttribute('open'), ''); await heading(page, 'Details & historical stress test');
  });
  await run('late scenario response cannot overwrite edited choices', async () => {
    profile = 'water_average'; delayNext = true; await page.getByLabel('Historical scenario', { exact: true }).selectOption('average');
    await page.getByRole('button', { name: 'Edit choices' }).click();
    await page.getByLabel('Year 1 Summer').selectOption('summer_b'); delayedResolve();
    await page.waitForLoadState('networkidle'); await heading(page, 'Compare crop rotations');
    assert.equal(await page.getByLabel('Year 1 Summer').inputValue(), 'summer_b');
    await page.goBack(); await heading(page, 'Compare crop rotations');
  });
  await run('unadvertised scenarios are disabled', async () => {
    const scenarios = config.scenarios; config.scenarios = ['average'];
    await page.reload(); await page.getByLabel('Year 1 Summer').waitFor();
    profile = 'water_average'; await page.getByRole('button', { name: 'Compare rotations', exact: true }).click();
    await page.getByRole('button', { name: 'See details & stress test' }).click();
    assert.equal(await page.locator('#scenario option[value="hottest_year"]').isDisabled(), true);
    assert.equal(await page.locator('#scenario option[value="driest_year"]').isDisabled(), true);
    config.scenarios = scenarios;
  });
  await context.close();

  await run('Figma assets render locally and summaries follow edited crops on desktop and mobile', async () => {
    const design = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await design.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const ids = { summer_a: 'maize', summer_b: 'soybean', winter_a: 'wheat', winter_b: 'faba_bean' };
    const names = { maize: 'Maize', soybean: 'Soybean', wheat: 'Wheat', faba_bean: 'Faba bean' };
    const rename = value => JSON.parse(JSON.stringify(value), (_key, item) => typeof item === 'string' ? ids[item] || item : item);
    const illustratedConfig = rename(config);
    Object.values(illustratedConfig.crops_by_season).flat().forEach(crop => { crop.name = names[crop.id]; });
    const fulfill = (route, data) => route.fulfill({ contentType: 'application/json', headers: { 'X-AgriLens-Data-Mode': 'fixture' }, body: JSON.stringify(data) });
    await page.route('**/api/config', route => fulfill(route, illustratedConfig));
    await page.route('**/api/compare', async route => fulfill(route, rename(await fixture('water_average'))));
    await page.goto(url);
    await page.getByLabel('Year 1 Summer').waitFor();
    await page.getByLabel('Year 1 Winter').selectOption('faba_bean');
    await page.locator('[data-crop-art="1"] img[src$="faba-bean.svg"]').waitFor();
    assert.ok((await page.locator('[data-summary-crops]').textContent()).includes('Faba bean'));
    await page.getByRole('radio', { name: 'Less heat exposure', exact: true }).check();
    assert.equal(await page.locator('[data-summary-priority]').textContent(), 'Less heat exposure');
    await page.getByRole('button', { name: 'Reset example' }).click();
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await noOverflow(page);
    }
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: new URL('design-setup-desktop.png', output).pathname, fullPage: true });
    await page.getByRole('button', { name: 'Compare rotations', exact: true }).click();
    await heading(page, 'Compare your options');
    async function checkImages() {
      await page.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth > 0));
      const images = await page.locator('img').evaluateAll(elements => elements.map(img => ({ src: img.getAttribute('src'), width: img.width, height: img.height, rect: { width: img.getBoundingClientRect().width, height: img.getBoundingClientRect().height } })));
      assert.ok(images.some(img => img.src.endsWith('wheat.svg')));
      assert.ok(images.some(img => img.src.endsWith('maize.svg')));
      for (const img of images) {
        assert.ok(img.src.startsWith('/src/assets/'));
        assert.ok(Math.abs(img.width - img.rect.width) < 1 && Math.abs(img.height - img.rect.height) < 1);
      }
      assert.equal(await page.evaluate(() => document.fonts.check('16px "Readex Pro"')), true);
    }
    await checkImages();
    await page.screenshot({ path: new URL('design-compare-desktop.png', output).pathname, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 }); await noOverflow(page); await checkImages();
    await page.screenshot({ path: new URL('design-compare-mobile.png', output).pathname, fullPage: true });
    await page.getByRole('button', { name: 'See details & stress test' }).click();
    await page.locator('[data-open-details="nasa-method"]').click();
    assert.equal(await page.locator('#nasa-method').getAttribute('open'), '');
    await page.locator('[data-open-details="sources"]').click();
    assert.equal(await page.locator('#sources').getAttribute('open'), '');
    await noOverflow(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: new URL('design-details-desktop.png', output).pathname, fullPage: true });
    await design.close();
  });

  if (process.env.TEST_REAL_BACKEND === '1') {
    const real = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await real.newPage(); page.on('pageerror', error => errors.push(error.message));
    const network = [];
    page.on('request', request => { if (request.resourceType() === 'fetch') network.push(new URL(request.url()).pathname); });
    await run('real MongoDB/services: full app journey and all historical scenarios', async () => {
      await page.goto(url); await page.getByLabel('Year 1 Summer').waitFor(); await hasText(page, 'Unreviewed prototype');
      await page.getByRole('button', { name: 'Compare rotations', exact: true }).click(); await heading(page, 'Compare your options');
      assert.equal(await page.locator('[data-plan]').count(), 3); await hasText(page, '1,900–2,900');
      await page.screenshot({ path: new URL('real-compare-desktop.png', output).pathname, fullPage: true });
      await page.getByRole('button', { name: 'See details & stress test' }).click();
      for (const [scenario, year] of [['hottest_year', '2023'], ['driest_year', '2019'], ['average', null]]) {
        await page.getByLabel('Historical scenario', { exact: true }).selectOption(scenario);
        await page.waitForFunction(() => !document.querySelector('#scenario').disabled);
        assert.equal(await page.getByRole('alert').count(), 0);
        if (year) await hasText(page, `eligible rotation anchor, ${year}`);
      }
      await page.setViewportSize({ width: 390, height: 844 }); await noOverflow(page);
      await page.screenshot({ path: new URL('real-details-mobile.png', output).pathname, fullPage: true });
      assert.ok(network.every(path => ['/api/config', '/api/compare'].includes(path)));
    });
    await real.close();
  }
  assert.deepEqual(errors, [], 'Browser runtime errors');
  console.log(`${passed} browser checks passed. Screenshots: ${output.pathname}`);
} finally {
  await browser.close(); app.closeAllConnections(); await new Promise(resolve => app.close(resolve));
}
