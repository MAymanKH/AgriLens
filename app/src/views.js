import { slots, slotNames, priorities, planNames, scenarioName, modeNotice, number as formatNumber, waterRange as formatWaterRange, safeUrl, percentageDifference, waterMidpoint } from './model.js';
import { t as translate, cropLabel, regionLabel, serviceText, visibleWarnings } from './i18n.js';

export const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
function localizedViews(language = 'en') {
  const t = (key, values) => translate(language, key, values);
  const prose = value => serviceText(language, value);
  const number = value => formatNumber(value, language);
  const year = value => new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : 'en', { useGrouping: false }).format(value);
  const waterRange = range => formatWaterRange(range, language);
  const scenario = (id, mode) => scenarioName(id, mode, language);
  const region = config => regionLabel(language, config.region);
  const list = values => `<ul>${values.map(value => `<li><bdi>${escape(prose(value))}</bdi></li>`).join('')}</ul>`;
  const button = (action, label, style = 'secondary') => `<button type="button" class="${style}" data-action="${action}">${t(label)}</button>`;
  const errorView = state => state.error ? `<section class="notice error" role="alert"><h2>${t(state.failedScenario ? 'Scenario unavailable' : 'Unable to compare')}</h2><p>${escape(prose(state.error.message) === state.error.message && language === 'ar' ? t(state.error.code) : prose(state.error.message))}</p>${language === 'ar' && prose(state.error.message) === state.error.message ? `<p class="form-hint">${t('Original service text')}</p><p dir="auto">${escape(state.error.message)}</p>` : ''}${state.failedScenario ? `<p>${t('Requested:')} ${escape(scenario(state.failedScenario, state.mode))}. ${t('Showing previous result:')} ${escape(scenario(state.result.scenario, state.mode))}.</p>` : ''}${button('retry', 'Try again')}</section>` : '';

  const icon = name => `<img class="metric-icon" src="/src/assets/${name}.svg" alt="" width="24" height="24">`;
  const cropAssets = { wheat: ['wheat', 50.9268, 72.8122], maize: ['maize', 40.7711, 72.2603], soybean: ['soybean', 56, 74], faba_bean: ['faba-bean', 59.7741, 72.3281] };
  const cropArt = id => {
    const asset = Object.hasOwn(cropAssets, id) ? cropAssets[id] : null;
    return asset ? `<img src="/src/assets/${asset[0]}.svg" alt="" width="${asset[1]}" height="${asset[2]}">` : '';
  };
  const cropName = (config, id) => cropLabel(language, id, [...config.crops_by_season.summer, ...config.crops_by_season.winter].find(crop => crop.id === id)?.name || id);

  function updateSetupSummary(root, state) {
    root.querySelectorAll('[data-crop-art]').forEach(element => {
      element.innerHTML = cropArt(state.baseline[Number(element.dataset.cropArt)]);
    });
    root.querySelector('[data-summary-priority]').textContent = t(priorities[state.priority]);
    root.querySelector('[data-summary-crops]').innerHTML = state.baseline.map(id => `<span>${escape(cropName(state.config, id))}</span>`).join('');
  }

  function setup(state) {
    const { config, baseline, priority, busy, fieldErrors } = state;
    return `<div class="page-heading"><h1 tabindex="-1">${t('Compare crop rotations')}</h1><p>${t('Choose four seasonal crops and explore the trade-offs over two years.')}</p></div>
      <div class="setup-layout"><form id="setup-form" novalidate aria-busy="${busy}"><h2>${t('What are you growing now?')}</h2><p class="form-hint">${t('Choose a crop for each season.')}</p>
      <div class="region"><span>${t('Sample region')}</span><strong>${escape(region(config))}</strong></div>
      ${errorView(state)}
      <div class="years">${[0, 1].map(year => `<fieldset class="year"><legend>${t(year === 0 ? 'Year 1' : 'Year 2')}</legend>${[year * 2, year * 2 + 1].map(i => {
        const season = slots[i].endsWith('summer') ? 'summer' : 'winter';
        return `<div class="field"><label for="crop-${i}">${t(season === 'summer' ? 'Summer crop' : 'Winter crop')}</label><div class="crop-control"><div class="crop-art" data-crop-art="${i}">${cropArt(baseline[i])}</div><select id="crop-${i}" name="${slots[i]}" aria-label="${t(slotNames[i])}" ${busy ? 'disabled' : ''} ${fieldErrors[i] ? `aria-invalid="true" aria-describedby="crop-error-${i}"` : ''}>${config.crops_by_season[season].map(crop => `<option value="${escape(crop.id)}" ${baseline[i] === crop.id ? 'selected' : ''}>${escape(cropName(config, crop.id))}</option>`).join('')}</select></div>${fieldErrors[i] ? `<p class="field-error" id="crop-error-${i}">${escape(t(fieldErrors[i]))}</p>` : ''}</div>`;
      }).join('')}</fieldset>`).join('')}</div>
      <fieldset class="priority"><legend>${t('What matters most?')}</legend><div class="priority-options">${config.priorities.map(id => `<label><input type="radio" name="priority" value="${id}" ${id === priority ? 'checked' : ''} ${busy ? 'disabled' : ''}><span>${icon({ water: 'droplet', heat: 'thermometer', soil: 'sprout' }[id])}${t(priorities[id])}</span></label>`).join('')}</div></fieldset>
      <div class="actions"><button class="primary" type="submit" ${busy ? 'disabled' : ''}>${t(busy ? 'Comparing…' : 'Compare rotations')}</button>${!busy ? button('reset', 'Reset example', 'text-button') : ''}</div>
      </form><aside class="setup-note"><h2>${t('Your field')}</h2><p class="form-hint">${t('A two-year rotation in the supported sample region.')}</p><dl class="field-summary"><div><dt>${t('Location')}</dt><dd>${escape(region(config))}</dd></div><div><dt>${t('Rotation')}</dt><dd>${t('Four seasons · Two years')}</dd></div><div><dt>${t('Compare by')}</dt><dd data-summary-priority>${t(priorities[priority])}</dd></div></dl><div class="summary-crops" data-summary-crops>${baseline.map(id => `<span>${escape(cropName(config, id))}</span>`).join('')}</div><p>${t('Change your crops and priority without starting again.')}</p><div class="summary-note"><h3>${t('What will you compare?')}</h3><p>${icon('droplet')} ${t('Indicative water needs')}</p><p>${icon('thermometer')} ${t('Historical heat exposure')}</p><p>${icon('sprout')} ${t('Crop diversity and soil notes')}</p></div></aside></div>`;
  }

  function cropSequence(plan, config) {
    return `<ol class="crop-sequence">${plan.crops.map((id, i) => `<li><span>${t(slotNames[i])}</span><div class="crop-art">${cropArt(id)}</div><strong class="crop-chip ${Object.hasOwn(cropAssets, id) ? cropAssets[id][0] : 'other'}">${escape(cropName(config, id))}</strong></li>`).join('')}</ol>`;
  }

  function warnings(result) {
    const messages = visibleWarnings(result.meta.warnings).filter(message => !/^Crop .+: water-need range is incomplete;/.test(message));
    return messages.length ? `<aside class="notice warnings"><h2>${icon('alert-triangle')} ${t('Before using these results')}</h2>${list(messages)}</aside>` : '';
  }

  function missingWater(plan, result, config) {
    const missing = result.meta.warnings.flatMap(warning => {
      const match = warning.match(/^Crop (.+): water-need range is incomplete; rotation water total is Not evaluated\.$/);
      return match && plan.crops.includes(match[1]) ? [cropName(config, match[1])] : [];
    });
    return `<span>${t('Not evaluated')}</span><small>${escape(missing.length
      ? t('{crops}: water data incomplete; rotation total unavailable.', { crops: missing.join(language === 'ar' ? '، ' : ', ') })
      : t('Crop-water data incomplete for this rotation.'))}</small>`;
  }

  function waterValue(plan, result, config) {
    return waterMidpoint(plan.water_need_mm) === null ? missingWater(plan, result, config)
      : `<bdi dir="ltr">${waterRange(plan.water_need_mm)}</bdi><small>${t('mm / four growing periods')}</small>`;
  }

  function metricDifference(baseline, alternative) {
    const difference = percentageDifference(baseline, alternative);
    if (difference === null) return `<span>${t('Not evaluated')}</span><small>${t(baseline === 0 ? 'Baseline is zero; percentage unavailable.' : 'Data incomplete; percentage unavailable.')}</small>`;
    const percent = new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : 'en', { style: 'percent', maximumFractionDigits: 1 }).format(Math.abs(difference) / 100);
    const label = difference === 0 ? 'No change (0%)' : difference < 0 ? '{percent} lower' : '{percent} higher';
    return `<strong class="metric-difference ${difference < 0 ? 'metric-lower' : difference > 0 ? 'metric-higher' : ''}">${escape(t(label, { percent }))}</strong><small>${t('Compared with your rotation')}</small>`;
  }

  function compare(state) {
    const { result, config } = state;
    return `<div class="page-heading heading-actions"><div><h1 tabindex="-1">${t('Compare your options')}</h1><p>${escape(region(config))} · ${t('Priority:')} ${t(priorities[result.priority])}</p></div>${button('setup', 'Edit choices')}</div>
      <p class="scenario-caption">${t('Showing')} ${escape(scenario(result.scenario, state.mode))}${result.meta.scenario_year === null ? '' : `, ${year(result.meta.scenario_year)}`}. ${t('Period:')} <bdi>${escape(result.meta.climate_period)}</bdi>.</p>
      ${result.plans.length < 3 ? `<p class="notice">${t(result.plans.length === 1 ? 'No other valid rotation is available.' : 'One distinct valid alternative is available.')}</p>` : ''}
      <div class="plans">${result.plans.map(plan => `<article class="plan ${plan.id === 'baseline' ? 'baseline' : ''}" data-plan="${plan.id}"><div class="plan-heading"><h2>${t(planNames[plan.id])}</h2>${plan.id === 'baseline' ? `<span>${t('Unchanged baseline')}</span>` : ''}</div>${plan.id !== 'baseline' ? directComparison([result.plans[0], plan], config, result) : `${cropSequence(plan, config)}
      <dl class="metrics"><div><dt>${icon('droplet')} ${t('Indicative water need')}</dt><dd>${waterValue(plan, result, config)}</dd></div><div><dt>${icon('thermometer')} ${t('Historical hot-day exposure')}</dt><dd><bdi dir="ltr">${number(plan.hot_days)}</bdi>${plan.hot_days === null ? '' : `<small>${t('crop-days across the rotation')}</small>`}</dd></div></dl>
      <p class="soil-note"><span class="metric-label">${icon('sprout')} ${t('Crop diversity and soil')}</span><bdi>${escape(prose(plan.soil_note || t('Diversity note: Not evaluated')))}</bdi></p><p class="reason" dir="auto">${escape(prose(plan.reasons[0] || t('See sources and limitations for available evidence.')))}</p>`}<p class="threshold">${result.meta.heat_threshold_c === null ? `${t('Heat threshold:')} ${t('Not evaluated')}` : `${t('Heat threshold:')} ${number(result.meta.heat_threshold_c)} ${t('°C. See details for the method.')}`}</p></article>`).join('')}</div>
      <div class="actions">${button('details', 'See details & stress test', 'primary')}</div>${warnings(result)}`;
  }

  function metricValues(plans, value, numeric) {
    const values = plans.map(numeric);
    return plans.map((plan, index) => {
      const other = values[1 - index];
      const current = values[index];
      const color = current === null || other === null || current === other ? ''
        : current < other ? 'metric-lower' : 'metric-higher';
      return `<td><span class="metric-value ${color}">${value(plan)}</span></td>`;
    }).join('');
  }

  function directComparison(plans, config, result) {
    const rows = [
      ...slotNames.map((name, i) => [t(name), plan => `<div class="crop-art">${cropArt(plan.crops[i])}</div>${escape(cropName(config, plan.crops[i]))}`]),
      [t('Indicative water need'), plan => waterValue(plan, result, config), plan => waterMidpoint(plan.water_need_mm)],
      [t('Historical hot-day exposure'), plan => `<bdi dir="ltr">${number(plan.hot_days)}</bdi>${plan.hot_days === null ? '' : `<small>${t('crop-days across the rotation')}</small>`}`, plan => plan.hot_days],
      [t('Crop diversity and soil'), plan => `<bdi>${escape(prose(plan.soil_note || t('Diversity note: Not evaluated')))}</bdi>`],
    ];
    return `<div class="direct-comparison"><table><caption class="sr-only">${t('Your rotation vs {plan}', { plan: t(planNames[plans[1].id]) })}</caption><thead><tr>${plans.map(plan => `<th scope="col">${t(planNames[plan.id])}</th>`).join('')}</tr></thead>${rows.map(([label, value, numeric]) => {
      const complete = numeric && plans.every(plan => numeric(plan) !== null);
      const difference = complete ? `<tr><td colspan="2" class="difference-cell">${metricDifference(...plans.map(numeric))}${label === t('Indicative water need') ? `<small>${t('Based on range midpoints')}</small>` : ''}</td></tr>` : '';
      return `<tbody><tr><th scope="rowgroup" colspan="2">${label}</th></tr><tr>${numeric ? metricValues(plans, value, numeric) : plans.map(plan => `<td>${value(plan)}</td>`).join('')}</tr>${difference}</tbody>`;
    }).join('')}</table></div>`;
  }

  function details(state) {
    const { result, config, busy } = state;
    const meta = result.meta;
    const plans = result.plans;
    return `<div class="page-heading heading-actions"><div><h1 tabindex="-1">${t('Details & historical stress test')}</h1><p>${escape(region(config))}</p></div>${button('setup', 'Edit choices')}</div>
      <section class="scenario-panel" aria-busy="${busy}"><label for="scenario">${t('Historical scenario')}</label><select id="scenario" ${busy ? 'disabled' : ''}>${['average', 'hottest_year', 'driest_year'].map(id => `<option value="${id}" ${result.scenario === id ? 'selected' : ''} ${!config.scenarios.includes(id) ? 'disabled' : ''}>${escape(scenario(id, state.mode))}${config.scenarios.includes(id) ? '' : t(' (unavailable)')}</option>`).join('')}</select>${busy ? `<p role="status">${t('Loading the requested scenario. The previous result remains below.')}</p>` : ''}</section>
      ${errorView(state)}
      <div class="details-layout"><div><section class="exposure"><h2>${t('Historical heat exposure')}</h2><p class="scenario-caption">${t('Showing')} ${escape(scenario(result.scenario, state.mode))}${meta.scenario_year === null ? '' : `, ${year(meta.scenario_year)}`}. ${t('Climate period:')} <bdi>${escape(meta.climate_period)}</bdi>.</p><p>${t('Threshold:')} ${meta.heat_threshold_c === null ? t('Not evaluated') : `${number(meta.heat_threshold_c)} ${t('°C')}`}. ${t('Exposure is not a prediction of crop damage.')}</p>
      <table><caption>${t('Returned plans, with fixed indicative water ranges')}</caption><thead><tr><th scope="col">${t('Rotation')}</th><th scope="col">${t('Hot-day exposure')} <span>${t('crop-days')}</span></th><th scope="col">${t('Water need')} <span>${t('mm / four growing periods')}</span></th></tr></thead><tbody>${plans.map(plan => `<tr><th scope="row">${t(planNames[plan.id])}</th><td><bdi dir="ltr">${number(plan.hot_days)}</bdi></td><td>${waterValue(plan, result, config)}</td></tr>`).join('')}</tbody></table></section>
      ${warnings(result)}
      <div class="explanations" id="method"><details id="why-options"><summary>${t('Why these options?')}</summary>${plans.map(plan => `<section><h3>${t(planNames[plan.id])}</h3>${cropSequence(plan, config)}${list(plan.reasons)}<p><bdi>${escape(prose(plan.soil_note))}</bdi></p><p>${t('Sources:')} ${plan.source_ids.length ? plan.source_ids.map(id => `<a href="#source-${encodeURIComponent(id)}">${escape(id)}</a>`).join(', ') : t('Not evaluated')}</p></section>`).join('')}</details>
      <details id="nasa-method"><summary>${t('NASA data and method')}</summary><p>${t('Historical stress tests illustrate past conditions, not forecasts. Fixed crop-water ranges do not represent delivered irrigation or measured savings.')}</p>${meta.assumptions.length ? list(meta.assumptions) : `<p>${t('No further method assumptions were supplied.')}</p>`}</details>
      <details id="sources"><summary>${t('Sources and limitations')}</summary>${meta.limitations.length ? list(meta.limitations) : `<p>${t('No additional limitations were supplied.')}</p>`}<ul class="sources">${meta.sources.map(source => `<li id="source-${encodeURIComponent(source.id)}"><a dir="auto" href="${escape(safeUrl(source.url))}" target="_blank" rel="noopener noreferrer">${escape(prose(source.title))}</a><span>${escape(source.id)}</span></li>`).join('')}</ul></details></div>
      <div class="actions">${button('compare', 'Back to comparison')}</div></div><aside class="contents"><h2>${t('On this page')}</h2><a href="#why-options" data-open-details="why-options">${t('Why these options?')}</a><a href="#nasa-method" data-open-details="nasa-method">${t('NASA data and method')}</a><a href="#sources" data-open-details="sources">${t('Sources and limitations')}</a><p>${t('Historical comparisons, not forecasts.')}</p></aside></div>`;
  }

  function render(state) {
    const screen = state.screen;
    const notice = state.config ? modeNotice(state.mode) : '';
    const body = !state.config ? `<h1 tabindex="-1">${t('Compare crop rotations')}</h1>${state.error ? errorView(state) : `<p role="status">${t('Loading crop choices…')}</p>`}` : screen === 'setup' ? setup(state) : screen === 'compare' ? compare(state) : details(state);
    return `<main id="main" class="screen-${screen}">${notice ? `<aside class="data-notice">${escape(t(notice))}</aside>` : ''}${body}</main>`;
  }

  return { render, updateSetupSummary };
}

export function render(state) { return localizedViews(state.language).render(state); }
export function updateSetupSummary(root, state) { localizedViews(state.language).updateSetupSummary(root, state); }

export function renderSteps(state) {
  const steps = [['setup', 'Setup'], ['compare', 'Compare'], ['details', 'Details']];
  return `<nav aria-label="${translate(state.language, 'Comparison steps')}"><ol class="steps">${steps.map(([id, name], i) => `<li ${state.screen === id ? 'aria-current="step"' : ''}><span class="step-number">${formatNumber(i + 1, state.language)}</span>${translate(state.language, name)}</li>`).join('')}</ol></nav>`;
}
