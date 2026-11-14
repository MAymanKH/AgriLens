import { requestJson, validateConfig, validateComparison, ApiError } from './api.js';
import { inputErrors, slots, priorities, scenarioName } from './model.js';
import { render, updateSetupSummary } from './views.js';

const root = document.querySelector('#app');
const state = { config: null, baseline: [], priority: 'water', result: null, resultRequest: null, mode: 'unknown', screen: 'setup', busy: false, error: null, failedScenario: null, fieldErrors: [] };
let active;
let version = 0;
function paint(focus = false) {
  root.innerHTML = render(state);
  if (focus) root.querySelector('h1').focus();
}
function announce(message) { document.querySelector('#status').textContent = message; }
function stop() { version++; active?.abort(); state.busy = false; }
function navigate(screen, push = true) {
  stop();
  state.screen = state.result || screen === 'setup' ? screen : 'setup';
  state.error = null; state.failedScenario = null;
  if (push) history.pushState({ screen: state.screen }, '', `#${state.screen}`);
  paint(true);
}

async function loadConfig() {
  stop(); active = new AbortController(); const current = version;
  state.error = null; paint();
  try {
    const response = await requestJson('/api/config', { signal: active.signal });
    if (current !== version) return;
    state.config = validateConfig(response.data); state.mode = response.mode;
    state.baseline = [...state.config.sample_baseline];
    state.priority = state.config.priorities.includes('water') ? 'water' : state.config.priorities[0];
    paint(true); announce('Crop choices loaded.');
  } catch (error) {
    if (current !== version) return;
    state.error = error; paint(); announce(error.message);
  }
}

async function compare(scenario = 'average') {
  const scenarioSwitch = state.screen === 'details';
  state.fieldErrors = inputErrors(state.config, state.baseline);
  if (state.fieldErrors.some(Boolean) || !Object.hasOwn(priorities, state.priority)) { paint(); root.querySelector('[aria-invalid="true"]')?.focus(); return; }
  stop(); active = new AbortController(); const current = version;
  const request = scenarioSwitch ? { ...state.resultRequest, scenario } : { region_id: state.config.region.id, baseline: [...state.baseline], priority: state.priority, scenario };
  state.busy = true; state.error = null; state.failedScenario = null;
  paint(); announce('Comparing rotations.');
  try {
    const response = await requestJson('/api/compare', { body: request, signal: active.signal });
    if (current !== version) return;
    if (response.mode !== state.mode) throw new ApiError('SERVICE_UNAVAILABLE', 'The data source changed. Reload the app to load matching crop choices.');
    const result = validateComparison(response.data, request, state.config);
    state.result = result; state.resultRequest = request; state.busy = false;
    if (!scenarioSwitch) navigate('compare');
    else { paint(); root.querySelector('#scenario').focus(); }
    announce(`Showing ${scenarioName(result.scenario, state.mode)}. ${result.plans.length} rotation options.`);
  } catch (error) {
    if (current !== version) return;
    state.busy = false; state.error = error;
    state.failedScenario = scenarioSwitch ? scenario : null;
    paint(); root.querySelector('[role="alert"] button')?.focus(); announce(error.message);
  }
}

root.addEventListener('submit', event => {
  if (event.target.id !== 'setup-form') return;
  event.preventDefault(); if (!state.busy) compare();
});
root.addEventListener('change', event => {
  const index = slots.indexOf(event.target.name);
  if (index >= 0) { state.baseline[index] = event.target.value; state.fieldErrors[index] = ''; state.result = null; state.resultRequest = null; }
  if (event.target.name === 'priority') { state.priority = event.target.value; state.result = null; state.resultRequest = null; }
  if (index >= 0 || event.target.name === 'priority') updateSetupSummary(root, state);
  if (event.target.id === 'scenario' && !state.busy) compare(event.target.value);
});
root.addEventListener('click', event => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (['setup', 'compare', 'details'].includes(action)) navigate(action);
  if (action === 'reset') {
    state.baseline = [...state.config.sample_baseline];
    state.priority = state.config.priorities.includes('water') ? 'water' : state.config.priorities[0];
    state.result = null; state.resultRequest = null; state.error = null; state.fieldErrors = [];
    paint(); root.querySelector('#crop-0').focus();
  }
  if (action === 'retry' && !state.busy) { if (!state.config) loadConfig(); else compare(state.failedScenario || 'average'); }
  const source = event.target.closest('a[href^="#source-"]');
  const disclosure = event.target.closest('[data-open-details]');
  if (disclosure) {
    event.preventDefault();
    const target = document.getElementById(disclosure.dataset.openDetails);
    if (target.tagName === 'DETAILS') target.open = true;
    target.tabIndex = -1; target.focus(); target.scrollIntoView({ block: 'start' });
  }
  if (source) {
    event.preventDefault();
    root.querySelector('#sources').open = true;
    const target = document.getElementById(source.hash.slice(1));
    target.tabIndex = -1; target.focus(); target.scrollIntoView({ block: 'center' });
  }
});
window.addEventListener('popstate', event => navigate(event.state?.screen || 'setup', false));
history.replaceState({ screen: 'setup' }, '', '#setup');
paint(); loadConfig();
