import { slots, priorities, inputErrors, safeUrl } from './model.js';

export class ApiError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const text = value => typeof value === 'string' && value.length > 0;
const metric = value => value === null || typeof value === 'number' && Number.isFinite(value) && value >= 0;
const texts = value => Array.isArray(value) && value.every(text);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function check(valid) {
  if (!valid) throw new ApiError('SERVICE_UNAVAILABLE', 'The comparison service returned an incomplete response. Try again.');
}
export function validateConfig(config) {
  check(object(config) && object(config.region) && text(config.region.id) && text(config.region.name));
  check(JSON.stringify(config.slot_order) === JSON.stringify(slots) && object(config.crops_by_season));
  for (const season of ['summer', 'winter']) {
    const crops = config.crops_by_season[season];
    check(Array.isArray(crops) && crops.length > 0 && crops.every(crop => object(crop) && text(crop.id) && text(crop.name)));
    check(new Set(crops.map(crop => crop.id)).size === crops.length);
  }
  check(Array.isArray(config.sample_baseline) && config.sample_baseline.length === 4 && inputErrors(config, config.sample_baseline).every(error => !error));
  check(texts(config.priorities) && config.priorities.length > 0 && config.priorities.every(id => Object.hasOwn(priorities, id)));
  check(texts(config.scenarios) && config.scenarios.includes('average') && config.scenarios.every(id => ['average', 'hottest_year', 'driest_year'].includes(id)));
  return config;
}
export function validateComparison(result, request, config) {
  check(object(result) && result.region_id === request.region_id && result.priority === request.priority && result.scenario === request.scenario);
  check(Array.isArray(result.plans) && result.plans.length >= 1 && result.plans.length <= 3);
  check(object(result.meta));
  const meta = result.meta;
  check(metric(meta.heat_threshold_c) && text(meta.climate_period) && (meta.scenario_year === null || Number.isInteger(meta.scenario_year)));
  check(request.scenario === 'average' || meta.scenario_year !== null);
  check(Array.isArray(meta.sources) && meta.sources.every(source => object(source) && text(source.id) && text(source.title) && safeUrl(source.url)));
  const sourceIds = new Set(meta.sources.map(source => source.id));
  check(sourceIds.size === meta.sources.length);
  for (const key of ['warnings', 'assumptions', 'limitations']) check(texts(meta[key]));
  const ids = new Set();
  const rotations = new Set();
  for (const plan of result.plans) {
    check(object(plan) && ['baseline', 'water_conscious', 'diverse'].includes(plan.id) && !ids.has(plan.id));
    ids.add(plan.id);
    check(Array.isArray(plan.crops) && plan.crops.length === 4 && inputErrors(config, plan.crops).every(error => !error));
    const key = JSON.stringify(plan.crops);
    check(!rotations.has(key)); rotations.add(key);
    check(object(plan.water_need_mm) && metric(plan.water_need_mm.min) && metric(plan.water_need_mm.max));
    check(plan.water_need_mm.min === null || plan.water_need_mm.max === null || plan.water_need_mm.min <= plan.water_need_mm.max);
    check(metric(plan.hot_days) && typeof plan.soil_note === 'string' && texts(plan.reasons) && texts(plan.source_ids) && plan.source_ids.every(id => sourceIds.has(id)));
  }
  check(result.plans[0].id === 'baseline' && JSON.stringify(result.plans[0].crops) === JSON.stringify(request.baseline));
  return result;
}

export async function requestJson(path, { body, signal, timeoutMs = 8000 } = {}) {
  try {
    const response = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok) throw new ApiError(text(data?.error?.code) ? data.error.code : 'SERVICE_UNAVAILABLE', text(data?.error?.message) ? data.error.message : 'Comparison is unavailable. Try again.');
    return { data, mode: response.headers.get('X-AgriLens-Data-Mode') || 'unknown' };
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof ApiError) throw error;
    throw new ApiError('SERVICE_UNAVAILABLE', 'Comparison is unavailable or timed out. Your choices are kept. Try again.');
  }
}
