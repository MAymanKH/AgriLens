import { mountAssistant } from './assistant.js';
import { requestJson, validateConfig, validateComparison, ApiError } from './api.js';
import { inputErrors, slots, priorities, scenarioName } from './model.js';
import { render, updateSetupSummary } from './views.js';
import { t, readLanguage, saveLanguage } from './i18n.js';

const root = document.querySelector('#app');
const state = { language: readLanguage(), config: null, baseline: [], priority: 'water', result: null, resultRequest: null, mode: 'unknown', screen: 'setup', busy: false, error: null, failedScenario: null, fieldErrors: [] };
let assistant;
let active;
let version = 0;
function paint(focus = false) {
  document.documentElement.lang = state.language;
  document.documentElement.dir = state.language === 'ar' ? 'rtl' : 'ltr';
  document.title = `AgriLens | ${t(state.language, 'Compare crop rotations')}`;
  document.querySelectorAll('[data-i18n]').forEach(element => {
    element.textContent = t(state.language, element.dataset.i18n);
  });
  const toggle = document.querySelector('#language-toggle');
  toggle.textContent = state.language === 'ar' ? 'English' : 'العربية';
  toggle.lang = state.language === 'ar' ? 'en' : 'ar';
  toggle.setAttribute('aria-label', state.language === 'ar' ? 'Switch to English' : 'التبديل إلى العربية');
  root.innerHTML = render(state);
  assistant?.refresh();
  if (focus) root.querySelector('h1').focus();
}
function announce(message, values = {}) {
  document.querySelector('#status').textContent = t(state.language, message, values);
}
function announceError(error) {
  const message = state.language === 'ar' && t(state.language, error.message) === error.message
    ? error.code || 'SERVICE_UNAVAILABLE' : error.message;
  announce(message);
}
document.querySelector('#language-toggle').addEventListener('click', () => {
  state.language = state.language === 'ar' ? 'en' : 'ar';
  saveLanguage(state.language);
  const sections = [...root.querySelectorAll('details[id]')].map(element => ({ id: element.id, open: element.open }));
  paint();
  for (const { id, open } of sections) root.querySelector(`#${id}`).open = open;
  announce('Language changed.');
});
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
    state.error = error; paint(); announceError(error);
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
    announce('Showing {scenario}. {count} rotation options.', { scenario: scenarioName(result.scenario, state.mode, state.language), count: result.plans.length });
  } catch (error) {
    if (current !== version) return;
    state.busy = false; state.error = error;
    state.failedScenario = scenarioSwitch ? scenario : null;
    paint(); root.querySelector('[role="alert"] button')?.focus(); announceError(error);
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
assistant = mountAssistant({
  context: () => structuredClone({ language: state.language, config: state.config, mode: state.mode, baseline: state.baseline, priority: state.priority, result: state.result, resultRequest: state.resultRequest, screen: state.screen, busy: state.busy }),
  apply: async action => {
    if (state.busy || action.region_id !== state.config.region.id || !Array.isArray(action.baseline) || action.baseline.length !== 4 || inputErrors(state.config, action.baseline).some(Boolean) || !state.config.priorities.includes(action.priority) || !state.config.scenarios.includes(action.scenario)) throw new Error(t(state.language, 'The assistant returned unsupported crop choices. Please clarify your choices.'));
    navigate('setup');
    state.baseline = [...action.baseline]; state.priority = action.priority;
    state.result = null; state.resultRequest = null; state.fieldErrors = [];
    await compare(action.scenario);
  },
});
history.replaceState({ screen: 'setup' }, '', '#setup');
paint(); loadConfig();
