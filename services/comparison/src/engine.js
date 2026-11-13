import { ApiError, requireInput } from './errors.js';

export const slots = ['y1_summer', 'y1_winter', 'y2_summer', 'y2_winter'];
export const priorities = ['water', 'heat', 'soil'];
export const scenarios = ['average', 'hottest_year', 'driest_year'];
const dayMs = 86400000;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const url = value => {
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
};
const dataCheck = condition => {
  if (!condition) throw new ApiError('SERVICE_UNAVAILABLE', 'An internal service returned invalid data. Retry shortly.');
};
export function validateRequest(input) {
  requireInput(input && typeof input === 'object' && !Array.isArray(input), 'Provide a JSON comparison request.');
  requireInput(Object.keys(input).every(key => ['region_id', 'baseline', 'priority', 'scenario'].includes(key)), 'Remove unsupported request fields.');
  requireInput(text(input.region_id), 'Provide region_id.');
  requireInput(Array.isArray(input.baseline) && input.baseline.length === 4 && input.baseline.every(text), 'Provide exactly four crop IDs in slot order.');
  requireInput(priorities.includes(input.priority), 'Choose water, heat or soil priority.');
  if (!scenarios.includes(input.scenario)) throw new ApiError('UNSUPPORTED_SCENARIO', 'Choose average, hottest_year or driest_year.');
}

function validateCatalog(catalog, regionId) {
  dataCheck(catalog?.region_id === regionId && JSON.stringify(catalog.slot_order) === JSON.stringify(slots));
  dataCheck(Array.isArray(catalog.crops) && catalog.crops.length <= 6 && Array.isArray(catalog.sources));
  const sources = new Set();
  for (const source of catalog.sources) {
    dataCheck(text(source.id) && !sources.has(source.id) && source.id !== 'climate_power' && url(source.url) && text(source.supports));
    sources.add(source.id);
  }
  const ids = new Set();
  for (const crop of catalog.crops) {
    dataCheck(text(crop.id) && !ids.has(crop.id) && text(crop.name));
    ids.add(crop.id);
    dataCheck(Array.isArray(crop.valid_seasons) && crop.valid_seasons.length > 0 && crop.valid_seasons.every(s => ['summer', 'winter'].includes(s)));
    const window = crop.grow_window;
    dataCheck(window && [window.start_month, window.end_month].every(m => m === null || (Number.isInteger(m) && m >= 1 && m <= 12)));
    const water = crop.water_need_mm;
    dataCheck(water && [water.min, water.max].every(v => v === null || (finite(v) && v >= 0)) && (water.min === null || water.max === null || water.min <= water.max));
    dataCheck(crop.family === null || text(crop.family));
    dataCheck(crop.is_legume === null || typeof crop.is_legume === 'boolean');
    dataCheck(Array.isArray(crop.source_ids) && crop.source_ids.every(id => sources.has(id)));
  }
}

function validateClimate(climate, regionId) {
  dataCheck(climate?.region_id === regionId && climate.units?.tmax === 'C' && climate.units?.rain === 'mm/day');
  const { first_year: first, last_year: last } = climate.period || {};
  dataCheck(Number.isInteger(first) && Number.isInteger(last) && first >= 1900 && last >= first && last - first <= 100);
  const { lat, lon } = climate.coordinates || {};
  dataCheck(finite(lat) && Math.abs(lat) <= 90 && finite(lon) && Math.abs(lon) <= 180);
  const provenance = climate.provenance;
  dataCheck(provenance && url(provenance.source_url) && text(provenance.retrieved_at) && text(provenance.spatial_resolution) && text(provenance.time_standard) && Number.isInteger(provenance.missing_days) && provenance.missing_days >= 0);
  dataCheck(Array.isArray(climate.daily) && climate.daily.length <= 37000);
  const daily = new Map();
  for (const row of climate.daily) {
    const stamp = Date.parse(row.date);
    dataCheck(typeof row.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === row.date && !daily.has(stamp));
    dataCheck(stamp >= Date.UTC(first, 0, 1) && stamp < Date.UTC(last + 1, 0, 1));
    dataCheck((row.tmax_c === null || (finite(row.tmax_c) && row.tmax_c >= -100 && row.tmax_c <= 70)) && (row.rain_mm === null || (finite(row.rain_mm) && row.rain_mm >= 0)));
    daily.set(stamp, row);
  }
  return daily;
}

export function windows(crops, anchor) {
  return crops.map((crop, i) => {
    const { start_month: start, end_month: end } = crop.grow_window;
    const year = anchor + Math.floor(i / 2);
    return [Date.UTC(year, start - 1, 1), Date.UTC(year + (start > end ? 1 : 0), end, 0)];
  });
}
function validRotation(crops) {
  if (crops.some(crop => !crop.source_ids.length || [crop.grow_window.start_month, crop.grow_window.end_month].some(v => v === null))) return false;
  const periods = windows(crops, 2020);
  return periods.every((period, i) => i === 0 || period[0] > periods[i - 1][1]);
}
const key = crops => JSON.stringify(crops.map(c => c.id));
const lexical = (a, b) => a < b ? -1 : a > b ? 1 : 0;

export function createEngine(catalog, climate, { regionId, regionName, heatThreshold = 35, fixture = false }) {
  validateCatalog(catalog, regionId);
  const daily = validateClimate(climate, regionId);
  dataCheck(finite(heatThreshold));
  const byId = new Map(catalog.crops.map(crop => [crop.id, crop]));
  const choices = slots.map(slot => catalog.crops.filter(c => c.valid_seasons.includes(slot.split('_')[1])).sort((a, b) => lexical(a.id, b.id)));
  const rotations = [];
  function generate(crops) {
    if (crops.length === 4) { if (validRotation(crops)) rotations.push(crops); return; }
    for (const crop of choices[crops.length]) generate([...crops, crop]);
  }
  generate([]);
  if (!rotations.length) throw new ApiError('INSUFFICIENT_DATA', 'No complete, sourced, nonoverlapping crop rotation is available.');

  const years = [];
  for (let year = climate.period.first_year; year <= climate.period.last_year; year++) {
    let heat = 0, rain = 0, count = 0, complete = true;
    for (let stamp = Date.UTC(year, 0, 1); stamp < Date.UTC(year + 1, 0, 1); stamp += dayMs) {
      const row = daily.get(stamp);
      if (!row || row.tmax_c === null || row.rain_mm === null) { complete = false; break; }
      heat += row.tmax_c; rain += row.rain_mm; count++;
    }
    if (complete) years.push({ year, heat: heat / count, rain });
  }
  const selected = {
    hottest_year: [...years].sort((a, b) => b.heat - a.heat || a.year - b.year)[0]?.year,
    driest_year: [...years].sort((a, b) => a.rain - b.rain || a.year - b.year)[0]?.year,
  };
  for (const scenario of ['hottest_year', 'driest_year']) {
    const declared = climate.scenarios?.[scenario];
    dataCheck(declared && (declared.year === null || Number.isInteger(declared.year)) && text(declared.rule));
    if (declared.year !== null) dataCheck(declared.year === selected[scenario]);
    else selected[scenario] = undefined;
  }
  const cache = new Map();
  function exposure(crops, year) {
    let total = 0;
    for (const [i, period] of windows(crops, year).entries()) {
      const cacheKey = `${crops[i].id}:${period[0]}`;
      if (!cache.has(cacheKey)) {
        let value = 0;
        for (let stamp = period[0]; stamp <= period[1]; stamp += dayMs) {
          const row = daily.get(stamp);
          if (!row || row.tmax_c === null) { value = null; break; }
          if (row.tmax_c >= heatThreshold) value++;
        }
        cache.set(cacheKey, value);
      }
      const value = cache.get(cacheKey);
      if (value === null) return null;
      total += value;
    }
    return total;
  }
  // All options use the same anchors so missing data cannot bias their comparison.
  const anchors = [];
  for (let year = climate.period.first_year; year <= climate.period.last_year; year++) {
    if (rotations.every(crops => exposure(crops, year) !== null)) anchors.push(year);
  }
  function available(scenario) {
    return scenario === 'average' ? anchors.length > 0 : selected[scenario] !== undefined && rotations.every(crops => exposure(crops, selected[scenario]) !== null);
  }
  function measure(crops, scenario) {
    const values = crops.map(c => c.water_need_mm);
    const water = values.some(v => v.min === null || v.max === null) ? { min: null, max: null } : {
      min: values.reduce((sum, v) => sum + v.min, 0), max: values.reduce((sum, v) => sum + v.max, 0),
    };
    dataCheck(water.min === null || (finite(water.min) && finite(water.max)));
    const families = crops.some(c => c.family === null) ? null : new Set(crops.map(c => c.family)).size;
    const legumes = crops.some(c => c.is_legume === null) ? null : crops.filter(c => c.is_legume).length;
    return { crops, water, families, legumes, distinct: new Set(crops.map(c => c.id)).size,
      hot: scenario === 'average' ? anchors.reduce((sum, year) => sum + exposure(crops, year), 0) / anchors.length : exposure(crops, selected[scenario]) };
  }
  function compareScore(a, b, priority) {
    const water = m => m.water.min === null ? Infinity : (m.water.min + m.water.max) / 2;
    const diversity = m => m.families === null ? Infinity : -m.families;
    const score = m => priority === 'water' ? [water(m), m.hot, diversity(m), -m.distinct] : priority === 'heat' ? [m.hot, water(m), diversity(m), -m.distinct] : [diversity(m), -m.distinct, water(m), m.hot];
    const left = score(a), right = score(b);
    for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1;
    return lexical(key(a.crops), key(b.crops));
  }
  function config() {
    const supported = scenarios.filter(available);
    if (!supported.includes('average')) throw new ApiError('INSUFFICIENT_DATA', 'No comparable historical rotation windows are complete.');
    return {
      region: { id: regionId, name: fixture ? `SYNTHETIC fixture: ${regionName}` : regionName },
      slot_order: slots, crops_by_season: Object.fromEntries(['summer', 'winter'].map(season => [season,
        catalog.crops.filter(c => c.valid_seasons.includes(season) && rotations.some(r => r.includes(c))).map(({ id, name }) => ({ id, name }))])),
      priorities, scenarios: supported, sample_baseline: rotations[0].map(c => c.id),
    };
  }
  function compare(input) {
    validateRequest(input);
    if (input.region_id !== regionId) throw new ApiError('UNKNOWN_REGION', 'Choose the configured region.');
    const baseline = input.baseline.map((id, i) => {
      const crop = byId.get(id);
      requireInput(crop && choices[i].includes(crop), `Choose a supported ${slots[i]} crop for slot ${i + 1}.`);
      return crop;
    });
    if (!validRotation(baseline)) throw new ApiError('INSUFFICIENT_DATA', 'The baseline has missing calendar evidence or overlapping growing windows. Edit the crop choices.');
    if (!available(input.scenario)) throw new ApiError('INSUFFICIENT_DATA', 'This historical scenario lacks complete four-slot coverage. Choose an available scenario.');
    const alternatives = rotations.filter(r => key(r) !== key(baseline)).map(r => measure(r, input.scenario));
    alternatives.sort((a, b) => compareScore(a, b, input.priority));
    const chosen = [measure(baseline, input.scenario)];
    if (alternatives.length) chosen.push(alternatives[0]);
    const remaining = alternatives.filter(m => m !== chosen[1]);
    remaining.sort((a, b) => compareScore(a, b, 'soil'));
    if (remaining.length) chosen.push(remaining[0]);
    const warnings = [];
    if (fixture) warnings.push('SYNTHETIC DEVELOPMENT FIXTURE. Not NASA measurements or agricultural recommendations.');
    if (chosen.length < 3) warnings.push(`Only ${chosen.length - 1} distinct valid alternatives are available.`);
    if (chosen.some(m => m.water.min === null)) warnings.push('Water need is Not evaluated where any crop range is incomplete.');
    if (chosen.some(m => m.families === null || m.legumes === null)) warnings.push('Some family or legume information is Not evaluated.');
    if (chosen.length > 1 && chosen.every(m => m.hot === chosen[0].hot)) warnings.push('Heat exposure is unchanged because these growing windows have equal threshold-day totals.');
    if (input.priority === 'water' && chosen.every(m => m.water.min === null)) warnings.push('Water ranking is Not evaluated; alternatives use heat exposure and descriptive diversity tie-breaks.');
    return {
      region_id: regionId, priority: input.priority, scenario: input.scenario,
      plans: chosen.map((m, i) => ({
        id: ['baseline', 'water_conscious', 'diverse'][i], crops: m.crops.map(c => c.id), water_need_mm: m.water, hot_days: m.hot,
        soil_note: `${m.families === null ? 'Family diversity not evaluated' : `${m.families} botanical ${m.families === 1 ? 'family' : 'families'}`}; ${m.legumes === null ? 'legume presence not evaluated' : `${m.legumes} legume slots`}. Soil outcomes are not predicted.`,
        reasons: [i === 0 ? 'Your baseline is preserved unchanged.' : i === 1 ? `First distinct alternative ranked by ${input.priority} priority; trade-offs remain visible.` : 'Remaining alternative selected by family count, then distinct crop count.',
          'Water uses summed indicative ranges; heat uses whole-month growing-window exposure.'],
        source_ids: [...new Set([...m.crops.flatMap(c => c.source_ids), 'climate_power'])],
      })),
      meta: {
        heat_threshold_c: heatThreshold, climate_period: `${climate.period.first_year}-${climate.period.last_year}`,
        scenario_year: input.scenario === 'average' ? null : selected[input.scenario],
        sources: [...catalog.sources.map(s => ({ id: s.id, title: s.supports, url: s.url })),
          { id: 'climate_power', title: fixture ? 'Synthetic climate fixture' : 'Historical daily climate input', url: climate.provenance.source_url }],
        assumptions: ['Inclusive whole months; winter harvest crosses into the next year when its end month precedes its start month.',
          input.scenario === 'average' ? `Common complete anchors: ${anchors.join(', ')}; arithmetic mean of per-anchor crop-day counts.` : climate.scenarios[input.scenario].rule,
          'Water ranking uses range midpoints, then heat exposure; soil priority uses botanical family count, then distinct crop count. Remaining ties use water, heat and crop IDs.',
          `Climate retrieved ${climate.provenance.retrieved_at}; ${climate.provenance.time_standard}; ${climate.provenance.spatial_resolution}.`],
        limitations: ['Historical exposure is not a forecast or observed crop damage.', 'Indicative crop-water ranges are not measured irrigation savings.',
          'Family diversity and legume presence do not quantify soil improvement.', 'Calculation follows the documented prototype convention; scientific evidence review remains pending.'],
        warnings,
      },
    };
  }
  return { config, compare };
}
