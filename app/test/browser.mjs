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
async function noOverflow(page) {
  const overflow = await page.evaluate(() => ({
    width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
    elements: [...document.querySelectorAll('body *')].filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && (rect.left < -1 || rect.right > innerWidth + 1);
    }).slice(0, 8).map(element => ({ tag: element.tagName, class: element.className, text: element.textContent.slice(0, 80) })),
  }));
  assert.ok(overflow.scrollWidth <= overflow.width, JSON.stringify(overflow));
}
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
    await page.locator('#language-toggle').click();
    await page.getByRole('heading', { name: 'تعذّرت المقارنة', exact: true }).waitFor();
    await page.locator('#language-toggle').click();
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
      if (name === 'missing_metrics') {
        await page.locator('[data-plan="water_conscious"] .direct-comparison').getByText('Not evaluated', { exact: true }).first().waitFor();
      }
      await page.getByRole('button', { name: 'Edit choices' }).click();
    });
  }
  await run('service errors and malformed success never replace results with invented values', async () => {
    profile = 'service_unavailable'; await page.getByRole('button', { name: 'Compare rotations', exact: true }).click(); await page.getByRole('alert').waitFor();
    assert.equal(await page.getByLabel('Year 1 Summer').inputValue(), 'summer_a');
    profile = 'malformed'; await page.getByRole('button', { name: 'Try again' }).click(); await hasText(page, 'incomplete response');
    profile = 'water_average'; await page.getByRole('button', { name: 'Try again' }).click(); await heading(page, 'Compare your options');
  });
  await run('every alternative immediately compares all aspects inside its own card', async () => {
    await heading(page, 'Compare your options');
    const data = await fixture('water_average');
    assert.equal(await page.locator('.direct-comparison').count(), 2);
    assert.equal(await page.locator('[data-compare-plan], .compare-plan').count(), 0);
    for (const alternative of data.plans.slice(1)) {
      const card = page.locator(`[data-plan="${alternative.id}"]`);
      const comparison = card.locator('.direct-comparison');
      assert.deepEqual(await comparison.locator('thead th').allTextContents(), ['Your rotation', alternative.id === 'water_conscious' ? 'Alternative 1' : 'Alternative 2']);
      assert.deepEqual(await comparison.locator('tbody th').allTextContents(), ['Year 1 Summer', 'Year 1 Winter', 'Year 2 Summer', 'Year 2 Winter', 'Indicative water need', 'Historical hot-day exposure', 'Crop diversity and soil']);
      for (const [i, plan] of [data.plans[0], alternative].entries()) {
        const cells = await comparison.locator(`tbody td:nth-child(${i + 1})`).allTextContents();
        for (let slot = 0; slot < 4; slot++) {
          const crop = Object.values(config.crops_by_season).flat().find(crop => crop.id === plan.crops[slot]);
          assert.equal(cells[slot], crop.name);
        }
        assert.ok(cells[4].includes(`${plan.water_need_mm.min.toLocaleString('en')}–${plan.water_need_mm.max.toLocaleString('en')}`));
        assert.ok(cells[5].includes(String(plan.hot_days)));
        assert.equal(cells[6], plan.soil_note);
      }
      assert.equal(await comparison.locator('a').count(), 0);
      await card.getByRole('heading', { level: 2 }).click();
      await heading(page, 'Compare your options');
    }
    await noOverflow(page);
    await page.screenshot({ path: new URL('inline-comparison-mobile.png', output).pathname, fullPage: true });
    await page.locator('#language-toggle').click();
    await heading(page, 'قارن البدائل');
    assert.equal(await page.locator('.direct-comparison').count(), 2);
    await noOverflow(page);
    await page.screenshot({ path: new URL('inline-comparison-arabic-mobile.png', output).pathname, fullPage: true });
    await page.locator('#language-toggle').click();
    await page.setViewportSize({ width: 1440, height: 1000 }); await noOverflow(page);
    await page.screenshot({ path: new URL('inline-comparison-desktop.png', output).pathname, fullPage: true });
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
    assert.equal(await page.locator('#why-options').getAttribute('open'), null);
    await page.locator('[data-open-details="why-options"]').click();
    assert.equal(await page.locator('#why-options').getAttribute('open'), '');
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
    await page.getByLabel('Year 1 Summer').selectOption('soybean');
    await page.locator('[data-crop-art="0"] img[src$="soybean.svg"]').waitFor();
    assert.ok((await page.locator('[data-summary-crops]').textContent()).includes('Soybean'));
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
      assert.ok(images.some(img => img.src.endsWith('soybean.svg')));
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
    await run('Arabic switches every screen without changing requests, results or saved language', async () => {
      const calls = [];
      let arabicProfile = 'missing_metrics';
      await page.unroute('**/api/compare');
      await page.route('**/api/compare', async route => {
        calls.push(route.request().postDataJSON());
        const data = rename(await fixture(arabicProfile));
        await route.fulfill({ status: data.error ? 422 : 200, contentType: 'application/json', headers: { 'X-AgriLens-Data-Mode': 'fixture' }, body: JSON.stringify(data) });
      });
      assert.equal(await page.locator('#why-options').getAttribute('open'), null);
      await page.locator('#language-toggle').click();
      await heading(page, 'التفاصيل وتجربة ظروف السنين اللي فاتت');
      assert.equal(await page.locator('html').getAttribute('lang'), 'ar');
      assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
      assert.equal(await page.locator('#sources').getAttribute('open'), '');
      assert.equal(calls.length, 0);
      assert.equal(await page.locator('#why-options').getAttribute('open'), null);
      await page.getByRole('button', { name: 'عدّل اختياراتك', exact: true }).click();
      await page.getByLabel('شتاء السنة الأولى', { exact: true }).selectOption('faba_bean');
      assert.ok((await page.locator('[data-summary-crops]').textContent()).includes('فول بلدي'));
      await page.getByRole('radio', { name: 'تعرّض أقل للحرارة', exact: true }).check();
      assert.equal(await page.locator('[data-summary-priority]').textContent(), 'تعرّض أقل للحرارة');
      await page.locator('#language-toggle').click();
      assert.equal(await page.getByLabel('Year 1 Winter').inputValue(), 'faba_bean');
      assert.equal(await page.getByRole('radio', { name: 'Less heat exposure', exact: true }).isChecked(), true);
      await page.locator('#language-toggle').click();
      await page.reload();
      await page.getByLabel('صيف السنة الأولى', { exact: true }).waitFor();
      assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
      await page.getByLabel('صيف السنة الأولى', { exact: true }).evaluate(select => {
        select.add(new Option('Invalid crop', 'wheat'));
        select.value = 'wheat'; select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await page.getByRole('button', { name: 'قارن الدورات', exact: true }).click();
      await hasText(page, 'اختار محصول صيفي من القائمة.');
      assert.equal(calls.length, 0);
      await page.getByRole('button', { name: 'رجّع المثال', exact: true }).click();
      for (const width of [390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 }); await noOverflow(page);
      }
      await page.screenshot({ path: new URL('arabic-setup-desktop.png', output).pathname, fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: new URL('arabic-setup-mobile.png', output).pathname, fullPage: true });
      await page.getByRole('button', { name: 'قارن الدورات', exact: true }).click();
      await heading(page, 'قارن البدائل');
      assert.deepEqual(calls[0], { region_id: config.region.id, baseline: ['maize', 'wheat', 'maize', 'wheat'], priority: 'water', scenario: 'average' });
      await hasText(page, 'لم يتم التقييم');
      await noOverflow(page);
      await page.screenshot({ path: new URL('arabic-compare-mobile.png', output).pathname, fullPage: true });
      await page.getByRole('button', { name: 'التفاصيل وتجربة ظروف السنين اللي فاتت', exact: true }).click();
      arabicProfile = 'incomplete_scenario';
      await page.getByLabel('السيناريو التاريخي', { exact: true }).selectOption('hottest_year');
      await page.getByRole('alert').waitFor();
      await hasText(page, 'النتيجة السابقة المعروضة: المتوسط التاريخي');
      assert.equal(await page.locator('#scenario').inputValue(), 'average');
      await noOverflow(page);
      await page.screenshot({ path: new URL('arabic-details-mobile.png', output).pathname, fullPage: true });
      await page.setViewportSize({ width: 1440, height: 1000 }); await noOverflow(page);
      arabicProfile = 'water_hottest_year';
      await page.getByRole('button', { name: 'جرّب تاني', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('#scenario')?.value === 'hottest_year' && !document.querySelector('#scenario').disabled);
      assert.equal(await page.getByRole('alert').count(), 0);
      await page.locator('#language-toggle').click();
      await heading(page, 'Details & historical stress test');
      assert.equal(await page.locator('#scenario').inputValue(), 'hottest_year');
      assert.equal(await page.locator('html').getAttribute('dir'), 'ltr');
      await page.reload(); await page.getByLabel('Year 1 Summer').waitFor();
      assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    });
    await run('prototype screens omit repeated review warnings and translate complete service content', async () => {
      const response = rename(await fixture('water_average'));
      response.plans[0].reasons = ['Your baseline is preserved unchanged.'];
      response.plans[0].soil_note = '2 botanical families; 1 legume slots. Soil outcomes are not predicted.';
      response.meta.warnings = ['UNREVIEWED PROTOTYPE: retained research inputs and proposed crop calendars. Scientific review was waived; these results are not validated agricultural recommendations.'];
      response.meta.sources[0].title = 'Historical daily climate input';
      response.meta.assumptions = ['Common complete anchors: 2016, 2017; arithmetic mean of per-anchor crop-day counts.'];
      illustratedConfig.region.name += ' (unreviewed prototype)';
      await page.unroute('**/api/config'); await page.unroute('**/api/compare');
      const send = (route, data) => route.fulfill({ contentType: 'application/json', headers: { 'X-AgriLens-Data-Mode': 'unreviewed' }, body: JSON.stringify(data) });
      await page.route('**/api/config', route => send(route, illustratedConfig));
      await page.route('**/api/compare', route => send(route, response));
      await page.reload(); await page.getByLabel('Year 1 Summer').waitFor();
      assert.equal(await page.locator('.data-notice').count(), 0);
      assert.ok(!(await page.locator('main').textContent()).includes('unreviewed prototype'));
      await page.getByRole('button', { name: 'Compare rotations', exact: true }).click();
      await heading(page, 'Compare your options');
      assert.equal(await page.locator('.warnings').count(), 0);
      await page.locator('#language-toggle').click();
      await hasText(page, 'دورتك الأصلية زي ما هي، من غير تغيير.');
      assert.ok(!(await page.locator('main').textContent()).includes('botanical families'));
      await page.getByRole('button', { name: 'التفاصيل وتجربة ظروف السنين اللي فاتت', exact: true }).click();
      await page.locator('#nasa-method > summary').click();
      await page.locator('#sources > summary').click();
      await hasText(page, 'البيانات المناخية اليومية التاريخية');
      assert.ok(!(await page.locator('main').textContent()).includes('Common complete anchors'));
      await page.setViewportSize({ width: 390, height: 844 }); await noOverflow(page);
      await page.screenshot({ path: new URL('arabic-service-details-mobile.png', output).pathname, fullPage: true });
    });
    await design.close();
  });

  await run('assistant submits through the manual comparison flow and ignores stale actions', async () => {
    const chat = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await chat.newPage(); p.on('pageerror', error => errors.push(error.message));
    await p.route('**/api/config', route => route.fulfill({ contentType: 'application/json', headers: { 'X-AgriLens-Data-Mode': 'fixture' }, body: JSON.stringify(config) }));
    let submitted;
    await p.route('**/api/compare', async route => {
      submitted = route.request().postDataJSON();
      const result = await fixture('water_average');
      await route.fulfill({ contentType: 'application/json', headers: { 'X-AgriLens-Data-Mode': 'fixture' }, body: JSON.stringify(result) });
    });
    let release, delay = false;
    await p.route('**/api/assistant', async route => {
      const body = route.request().postDataJSON();
      assert.equal(body.context.mode, 'fixture'); assert.ok(body.context.baseline.length === 4);
      if (delay) await new Promise(resolve => { release = resolve; });
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ reply: '<script>unsafe()</script> Choices ready.', action: { region_id: config.region.id, baseline: config.sample_baseline, priority: 'water', scenario: 'average' }, sources: [{id:'unsafe',url:'javascript:alert(1)'}] }) });
    });
    await p.goto(url); await p.getByLabel('Year 1 Summer').waitFor();
    await p.getByRole('button', {name:'Ask AgriLens', exact:true}).click();
    await p.getByLabel('Your question').fill('Use the example crops with less water and compare.');
    await p.getByRole('button', {name:'Send', exact:true}).click();
    await heading(p, 'Compare your options');
    await p.waitForFunction(() => !document.querySelector('#assistant-question').disabled);
    assert.deepEqual(submitted.baseline, config.sample_baseline);
    assert.equal(await p.locator('#assistant-panel script').count(), 0);
    assert.equal(await p.locator('#assistant-panel a').count(), 0);
    await p.screenshot({path:new URL('assistant-mobile.png',output).pathname,fullPage:true});
    await p.getByRole('button', {name:'Ask AgriLens',exact:true}).click();
    await p.getByRole('button', {name:'Edit choices',exact:true}).click();
    await p.getByRole('button', {name:'Ask AgriLens',exact:true}).click();
    delay = true;
    await p.getByLabel('Your question').fill('Compare again.');
    await p.getByRole('button', {name:'Send',exact:true}).click();
    await p.waitForFunction(() => document.querySelector('#assistant-question').disabled);
    await p.getByRole('button', {name:'Ask AgriLens',exact:true}).click();
    await p.getByRole('radio', {name:'Less heat exposure',exact:true}).check();
    while (!release) await new Promise(resolve => setTimeout(resolve, 10));
    release();
    await p.getByRole('button', {name:'Ask AgriLens',exact:true}).click();
    await hasText(p, 'Your page changed while I was answering.');
    assert.ok(await p.getByRole('radio', {name:'Less heat exposure',exact:true}).isChecked());
    await p.getByRole('button', {name:'Ask AgriLens',exact:true}).click();
    await p.locator('#language-toggle').click();
    await p.getByRole('button', {name:'اسأل أجريلينس',exact:true}).click();
    await p.getByLabel('سؤالك').waitFor();
    await p.screenshot({path:new URL('assistant-arabic-mobile.png',output).pathname,fullPage:true});
    await chat.close();
  });

  if (process.env.TEST_REAL_BACKEND === '1') {
    const real = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await real.newPage(); page.on('pageerror', error => errors.push(error.message));
    const network = [];
    page.on('request', request => { if (request.resourceType() === 'fetch') network.push(new URL(request.url()).pathname); });
    await run('real MongoDB/services: full app journey and all historical scenarios', async () => {
      await page.goto(url); await page.getByLabel('Year 1 Summer').waitFor();
      assert.equal(await page.locator('.data-notice').count(), 0);
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
