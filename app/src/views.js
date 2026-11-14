import { slots, slotNames, priorities, planNames, scenarioName, modeNotice, number, waterRange, safeUrl } from './model.js';

export const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const list = values => `<ul>${values.map(value => `<li>${escape(value)}</li>`).join('')}</ul>`;
const button = (action, label, style = 'secondary') => `<button type="button" class="${style}" data-action="${action}">${label}</button>`;
const errorView = state => state.error ? `<section class="notice error" role="alert"><h2>${state.failedScenario ? 'Scenario unavailable' : 'Unable to compare'}</h2><p>${escape(state.error.message)}</p>${state.failedScenario ? `<p>Requested: ${escape(scenarioName(state.failedScenario, state.mode))}. Showing previous result: ${escape(scenarioName(state.result.scenario, state.mode))}.</p>` : ''}${button('retry', 'Try again')}</section>` : '';

const icon = name => `<img class="metric-icon" src="/src/assets/${name}.svg" alt="" width="24" height="24">`;
const cropAssets = { wheat: ['wheat', 50.9268, 72.8122], maize: ['maize', 40.7711, 72.2603], faba_bean: ['faba-bean', 59.7741, 72.3281] };
const cropArt = id => {
  const asset = Object.hasOwn(cropAssets, id) ? cropAssets[id] : null;
  return asset ? `<img src="/src/assets/${asset[0]}.svg" alt="" width="${asset[1]}" height="${asset[2]}">` : '';
};
const cropName = (config, id) => [...config.crops_by_season.summer, ...config.crops_by_season.winter].find(crop => crop.id === id)?.name || id;

export function updateSetupSummary(root, state) {
  root.querySelectorAll('[data-crop-art]').forEach(element => {
    element.innerHTML = cropArt(state.baseline[Number(element.dataset.cropArt)]);
  });
  root.querySelector('[data-summary-priority]').textContent = priorities[state.priority];
  root.querySelector('[data-summary-crops]').innerHTML = state.baseline.map(id => `<span>${escape(cropName(state.config, id))}</span>`).join('');
}

function setup(state) {
  const { config, baseline, priority, busy, fieldErrors } = state;
  return `<div class="page-heading"><h1 tabindex="-1">Compare crop rotations</h1><p>Choose four seasonal crops and explore the trade-offs over two years.</p></div>
    <div class="setup-layout"><form id="setup-form" novalidate aria-busy="${busy}"><h2>What are you growing now?</h2><p class="form-hint">Choose a crop for each season.</p>
    <div class="region"><span>Sample region</span><strong>${escape(config.region.name)}</strong></div>
    ${errorView(state)}
    <div class="years">${[0, 1].map(year => `<fieldset class="year"><legend>Year ${year + 1}</legend>${[year * 2, year * 2 + 1].map(i => {
      const season = slots[i].endsWith('summer') ? 'summer' : 'winter';
      return `<div class="field"><label for="crop-${i}">${season === 'summer' ? 'Summer crop' : 'Winter crop'}</label><div class="crop-control"><div class="crop-art" data-crop-art="${i}">${cropArt(baseline[i])}</div><select id="crop-${i}" name="${slots[i]}" aria-label="${slotNames[i]}" ${busy ? 'disabled' : ''} ${fieldErrors[i] ? `aria-invalid="true" aria-describedby="crop-error-${i}"` : ''}>${config.crops_by_season[season].map(crop => `<option value="${escape(crop.id)}" ${baseline[i] === crop.id ? 'selected' : ''}>${escape(crop.name)}</option>`).join('')}</select></div>${fieldErrors[i] ? `<p class="field-error" id="crop-error-${i}">${escape(fieldErrors[i])}</p>` : ''}</div>`;
    }).join('')}</fieldset>`).join('')}</div>
    <fieldset class="priority"><legend>What matters most?</legend><div class="priority-options">${config.priorities.map(id => `<label><input type="radio" name="priority" value="${id}" ${id === priority ? 'checked' : ''} ${busy ? 'disabled' : ''}><span>${icon({ water: 'droplet', heat: 'thermometer', soil: 'sprout' }[id])}${priorities[id]}</span></label>`).join('')}</div></fieldset>
    <div class="actions"><button class="primary" type="submit" ${busy ? 'disabled' : ''}>${busy ? 'Comparing…' : 'Compare rotations'}</button>${!busy ? button('reset', 'Reset example', 'text-button') : ''}</div>
    </form><aside class="setup-note"><h2>Your field</h2><p class="form-hint">A two-year rotation in the supported sample region.</p><dl class="field-summary"><div><dt>Location</dt><dd>${escape(config.region.name)}</dd></div><div><dt>Rotation</dt><dd>Four seasons · Two years</dd></div><div><dt>Compare by</dt><dd data-summary-priority>${priorities[priority]}</dd></div></dl><div class="summary-crops" data-summary-crops>${baseline.map(id => `<span>${escape(cropName(config, id))}</span>`).join('')}</div><p>Change your crops and priority without starting again.</p><div class="summary-note"><h3>What will you compare?</h3><p>${icon('droplet')} Indicative water needs</p><p>${icon('thermometer')} Historical heat exposure</p><p>${icon('sprout')} Crop diversity and soil notes</p></div></aside></div>`;
}

function cropSequence(plan, config) {
  return `<ol class="crop-sequence">${plan.crops.map((id, i) => `<li><span>${slotNames[i]}</span><div class="crop-art">${cropArt(id)}</div><strong class="crop-chip ${Object.hasOwn(cropAssets, id) ? cropAssets[id][0] : 'other'}">${escape(cropName(config, id))}</strong></li>`).join('')}</ol>`;
}

function warnings(result) {
  return result.meta.warnings.length ? `<aside class="notice warnings"><h2>${icon('alert-triangle')} Before using these results</h2>${list(result.meta.warnings)}</aside>` : '';
}

function compare(state) {
  const { result, config } = state;
  return `<div class="page-heading heading-actions"><div><h1 tabindex="-1">Compare your options</h1><p>${escape(config.region.name)} · Priority: ${priorities[result.priority]}</p></div>${button('setup', 'Edit choices')}</div>
    <p class="scenario-caption">Showing ${escape(scenarioName(result.scenario, state.mode))}${result.meta.scenario_year === null ? '' : `, ${result.meta.scenario_year}`}. Period: ${escape(result.meta.climate_period)}.</p>
    ${result.plans.length < 3 ? `<p class="notice">${result.plans.length === 1 ? 'No other valid rotation is available.' : 'One distinct valid alternative is available.'}</p>` : ''}
    <div class="plans">${result.plans.map(plan => `<article class="plan ${plan.id === 'baseline' ? 'baseline' : ''}" data-plan="${plan.id}"><div class="plan-heading"><h2>${planNames[plan.id]}</h2>${plan.id === 'baseline' ? '<span>Unchanged baseline</span>' : ''}</div>${cropSequence(plan, config)}
    <dl class="metrics"><div><dt>${icon('droplet')} Indicative water need</dt><dd>${waterRange(plan.water_need_mm)}${waterRange(plan.water_need_mm) === 'Not evaluated' ? '' : '<small>mm / four growing periods</small>'}</dd></div><div><dt>${icon('thermometer')} Historical hot-day exposure</dt><dd>${number(plan.hot_days)}${plan.hot_days === null ? '' : '<small>crop-days across the rotation</small>'}</dd></div></dl>
    <p class="threshold">${result.meta.heat_threshold_c === null ? 'Heat threshold: Not evaluated' : `Heat threshold: ${number(result.meta.heat_threshold_c)} °C. See details for the method.`}</p>
    <p class="soil-note"><span class="metric-label">${icon('sprout')} Crop diversity and soil</span>${escape(plan.soil_note || 'Diversity note: Not evaluated')}</p><p class="reason">${escape(plan.reasons[0] || 'See sources and limitations for available evidence.')}</p></article>`).join('')}</div>
    <div class="actions">${button('details', 'See details & stress test', 'primary')}</div>${warnings(result)}`;
}

function details(state) {
  const { result, config, busy } = state;
  const meta = result.meta;
  return `<div class="page-heading heading-actions"><div><h1 tabindex="-1">Details & historical stress test</h1><p>${escape(config.region.name)}</p></div>${button('setup', 'Edit choices')}</div>
    <section class="scenario-panel" aria-busy="${busy}"><label for="scenario">Historical scenario</label><select id="scenario" ${busy ? 'disabled' : ''}>${['average', 'hottest_year', 'driest_year'].map(id => `<option value="${id}" ${result.scenario === id ? 'selected' : ''} ${!config.scenarios.includes(id) ? 'disabled' : ''}>${escape(scenarioName(id, state.mode))}${config.scenarios.includes(id) ? '' : ' (unavailable)'}</option>`).join('')}</select>${busy ? '<p role="status">Loading the requested scenario. The previous result remains below.</p>' : ''}</section>
    ${errorView(state)}
    <div class="details-layout"><div><section class="exposure"><h2>Historical heat exposure</h2><p class="scenario-caption">Showing ${escape(scenarioName(result.scenario, state.mode))}${meta.scenario_year === null ? '' : `, ${meta.scenario_year}`}. Climate period: ${escape(meta.climate_period)}.</p><p>Threshold: ${meta.heat_threshold_c === null ? 'Not evaluated' : `${number(meta.heat_threshold_c)} °C`}. Exposure is not a prediction of crop damage.</p>
    <table><caption>Returned plans, with fixed indicative water ranges</caption><thead><tr><th scope="col">Rotation</th><th scope="col">Hot-day exposure <span>crop-days</span></th><th scope="col">Water need <span>mm / four growing periods</span></th></tr></thead><tbody>${result.plans.map(plan => `<tr><th scope="row">${planNames[plan.id]}</th><td>${number(plan.hot_days)}</td><td>${waterRange(plan.water_need_mm)}</td></tr>`).join('')}</tbody></table></section>
    ${warnings(result)}
    <div class="explanations" id="method"><details open><summary>Why these options?</summary>${result.plans.map(plan => `<section><h3>${planNames[plan.id]}</h3>${cropSequence(plan, config)}${list(plan.reasons)}<p>${escape(plan.soil_note)}</p><p>Sources: ${plan.source_ids.length ? plan.source_ids.map(id => `<a href="#source-${encodeURIComponent(id)}">${escape(id)}</a>`).join(', ') : 'Not evaluated'}</p></section>`).join('')}</details>
    <details id="nasa-method"><summary>NASA data and method</summary><p>Historical stress tests illustrate past conditions, not forecasts. Fixed crop-water ranges do not represent delivered irrigation or measured savings.</p>${meta.assumptions.length ? list(meta.assumptions) : '<p>No further method assumptions were supplied.</p>'}</details>
    <details id="sources"><summary>Sources and limitations</summary>${meta.limitations.length ? list(meta.limitations) : '<p>No additional limitations were supplied.</p>'}<ul class="sources">${meta.sources.map(source => `<li id="source-${encodeURIComponent(source.id)}"><a href="${escape(safeUrl(source.url))}" target="_blank" rel="noopener noreferrer">${escape(source.title)}</a><span>${escape(source.id)}</span></li>`).join('')}</ul></details></div>
    <div class="actions">${button('compare', 'Back to comparison')}</div></div><aside class="contents"><h2>On this page</h2><a href="#method" data-open-details="method">Why these options?</a><a href="#nasa-method" data-open-details="nasa-method">NASA data and method</a><a href="#sources" data-open-details="sources">Sources and limitations</a><p>Historical comparisons, not forecasts.</p></aside></div>`;
}

export function render(state) {
  const screen = state.screen;
  const steps = [['setup', 'Setup'], ['compare', 'Compare'], ['details', 'Details']];
  const nav = `<nav aria-label="Comparison steps"><ol class="steps">${steps.map(([id, name], i) => `<li ${screen === id ? 'aria-current="step"' : ''}><span class="step-number">${i + 1}</span>${name}</li>`).join('')}</ol></nav>`;
  const notice = state.config ? modeNotice(state.mode) : '';
  const body = !state.config ? `<h1 tabindex="-1">Compare crop rotations</h1>${state.error ? errorView(state) : '<p role="status">Loading crop choices…</p>'}` : screen === 'setup' ? setup(state) : screen === 'compare' ? compare(state) : details(state);
  return `<div class="progress-band">${nav}</div><main id="main" class="screen-${screen}">${notice ? `<aside class="data-notice">${escape(notice)}</aside>` : ''}${body}</main>`;
}
