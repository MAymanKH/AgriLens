import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createEngine, windows } from '../src/engine.js';
const read = name => JSON.parse(fs.readFileSync(new URL(`../../../fixtures/${name}`, import.meta.url)));
const originalCatalog = read('crops/catalog.json');
const originalClimate = read('climate/daily.json');
const settings = { regionId: 'sample_region', regionName: 'Fixture region', fixture: true };
const input = {region_id:'sample_region', baseline:['summer_a','winter_a','summer_a','winter_a'],priority:'water',scenario:'average'};
const setup = (edit = () => {}) => {
  const catalog = structuredClone(originalCatalog), climate = structuredClone(originalClimate);
  edit(catalog, climate);
  return createEngine(catalog, climate, settings);
};
const code = expected => error => error.code === expected;

test('three distinct, season-valid options preserve baseline and independently reproduce water and heat', () => {
  const engine = setup();
  const result = engine.compare(input);
  assert.deepEqual(result.plans[0].crops, input.baseline);
  assert.deepEqual(result.plans.map(p => p.id), ['baseline', 'water_conscious', 'diverse']);
  assert.equal(new Set(result.plans.map(p => JSON.stringify(p.crops))).size, 3);
  assert.deepEqual(result.plans[0].water_need_mm, {min:360,max:640});
  assert.deepEqual(result.plans[1].water_need_mm, {min:220,max:340});
  // Independent calendar filter, with winter months explicitly assigned to their harvest year.
  const counts = [2020,2021,2022].map(anchor => originalClimate.daily.filter(row => {
    const [year, month] = row.date.split('-').map(Number);
    const inSummer = [anchor, anchor+1].includes(year) && month >= 6 && month <= 8;
    const inWinter = ([anchor, anchor+1].includes(year) && month === 12) || ([anchor+1, anchor+2].includes(year) && month <= 2);
    return (inSummer || inWinter) && row.tmax_c >= 35;
  }).length);
  assert.equal(result.plans[0].hot_days, counts.reduce((a,b) => a+b,0)/3);
  for (const plan of result.plans) {
    plan.crops.forEach((id,i) => assert.ok(originalCatalog.crops.find(c => c.id === id).valid_seasons.includes(i%2?'winter':'summer')));
    plan.source_ids.forEach(id => assert.ok(result.meta.sources.some(s => s.id === id)));
  }
  assert.deepEqual(engine.compare(input), result);
});

test('all priorities and scenarios retain water totals and explicit historical years', () => {
  const engine = setup();
  for (const priority of ['water','heat','soil']) for (const scenario of engine.config().scenarios) {
    const result = engine.compare({...input, priority, scenario});
    assert.deepEqual(result.plans[0].water_need_mm, {min:360,max:640});
    assert.equal(result.meta.scenario_year, scenario === 'average' ? null : scenario === 'hottest_year' ? 2021 : 2022);
  }
  assert.equal(engine.compare({...input,priority:'soil'}).plans[1].soil_note.startsWith('3 botanical families'), true);
});

test('partial and wholly missing water propagate nulls, with explanatory warnings', () => {
  const result = setup(catalog => { for (const crop of catalog.crops) crop.water_need_mm.min = null; }).compare(input);
  for (const plan of result.plans) assert.deepEqual(plan.water_need_mm, {min:null,max:null});
  assert.ok(result.meta.warnings.some(s => s.includes('Water ranking is Not evaluated')));
});

test('one and two plan catalogs never duplicate an option', () => {
  const engine = setup(catalog => {catalog.crops = catalog.crops.filter(c => ['summer_a','winter_a'].includes(c.id));});
  const result = engine.compare(input);
  assert.equal(result.plans.length, 1);
  assert.ok(result.meta.warnings.some(s => s.includes('0 distinct')));
  const two = setup(c => {
    c.crops = c.crops.filter(c => c.id !== 'summer_b');
    c.crops.find(c => c.id === 'winter_b').grow_window.end_month = 6;
  }).compare(input);
  assert.equal(two.plans.length, 2);
  assert.equal(new Set(two.plans.map(p => JSON.stringify(p.crops))).size, 2);
  // A single dual-season crop with different windows cannot be used to fabricate alternatives.
  assert.throws(() => setup(c => {c.crops = [];}), code('INSUFFICIENT_DATA'));
});

test('malformed selections and incompatible seasons receive useful errors', () => {
  const engine = setup();
  for (const baseline of [[], ['summer_a'], ['bad','winter_a','summer_a','winter_a'], ['winter_a','winter_a','summer_a','winter_a']]) {
    assert.throws(() => engine.compare({...input,baseline}), code('INVALID_INPUT'));
  }
  assert.throws(() => engine.compare({...input,priority:'profit'}),code('INVALID_INPUT'));
  assert.throws(() => engine.compare({...input,scenario:'future'}),code('UNSUPPORTED_SCENARIO'));
  assert.throws(() => engine.compare({...input,region_id:'bad'}),code('UNKNOWN_REGION'));
});

test('overlapping or unverified baseline windows are rejected while other rotations remain usable', () => {
  for (const month of [null,6]) {
    const engine = setup(c => {c.crops.find(c => c.id === 'winter_a').grow_window.end_month = month;});
    assert.throws(() => engine.compare(input),code('INSUFFICIENT_DATA'));
    assert.equal(engine.compare({...input, baseline: engine.config().sample_baseline}).plans[0].crops.length, 4);
  }
});

test('leap day, inclusive threshold and cross-year winter dates are counted exactly', () => {
  const engine = setup((_catalog, climate) => {
    for (const row of climate.daily) row.tmax_c = 0;
    climate.daily.find(row => row.date === '2024-02-29').tmax_c = 35;
    climate.scenarios.hottest_year.year = 2024;
    climate.scenarios.driest_year.year = 2022;
  });
  assert.equal(engine.config().scenarios.includes('hottest_year'),false);
  assert.equal(engine.compare(input).plans[0].hot_days, 1/3);
  assert.equal(windows([originalCatalog.crops[2]],2023)[0][1],Date.UTC(2024,2,0));
});

test('missing dates exclude anchors and incomplete selected scenarios are never substituted', () => {
  const engine = setup((_catalog, climate) => {climate.daily = climate.daily.filter(row => row.date !== '2024-02-29');});
  assert.ok(!engine.config().scenarios.includes('driest_year'));
  assert.throws(() => engine.compare({...input,scenario:'driest_year'}),code('INSUFFICIENT_DATA'));
  const result = engine.compare(input);
  assert.ok(result.meta.assumptions.some(s => s.includes('2020, 2021;')));
});

test('null temperatures are not zero; no complete window gives insufficient data', () => {
  assert.throws(() => setup((_catalog, climate) => {climate.daily.forEach(row => row.tmax_c = null);}), code('SERVICE_UNAVAILABLE'));
  const engine = setup((_catalog, climate) => {
    climate.daily.forEach(row => row.tmax_c = null);
    climate.scenarios.hottest_year.year = null; climate.scenarios.driest_year.year = null;
  });
  assert.throws(() => engine.config(),code('INSUFFICIENT_DATA'));
});

test('malformed dependency data and inconsistent annual scenario rules fail closed', () => {
  for (const edit of [
    (c,cl) => {cl.daily.push(cl.daily[0]);},
    (c,cl) => {cl.daily[0].tmax_c = -999;},
    c => {c.crops[0].source_ids = ['absent'];},
    c => {c.crops[0].water_need_mm.min = -1;},
    (c,cl) => {cl.scenarios.hottest_year.year = 2020;},
    (c,cl) => {cl.region_id = 'other';},
  ]) assert.throws(() => setup(edit), code('SERVICE_UNAVAILABLE'));
});


function researchInputs() {
  const processed = name => JSON.parse(fs.readFileSync(new URL(`../../../data/processed/${name}`, import.meta.url)));
  const catalog = processed('crop_catalog.json');
  const proposal = processed('four_crop_proposal.json');
  const climate = processed('climate_daily_clean.json');
  catalog.crops = proposal.crops.map(proposed => ({
    ...catalog.crops.find(c => c.id === proposed.id),
    grow_window: proposed.grow_window, water_need_mm: proposed.water_need_mm,
    source_ids: [proposed.water_evidence.source_id, proposed.calendar_evidence.source_id].filter(Boolean),
  }));
  for (const source of proposal.sources) if (!catalog.sources.some(s => s.id === source.id)) catalog.sources.push({...source, supports:source.location});
  return {catalog, climate, proposal};
}

test('retained research inputs reproduce independent whole-window arithmetic without approving data', () => {
  const {catalog, climate, proposal} = researchInputs();
  const engine = createEngine(catalog,climate,{regionId:proposal.region_id,regionName:'Zankalon'});
  assert.deepEqual(engine.config().scenarios,['average']);
  const baseline = ['maize','faba_bean','maize','wheat'];
  const result = engine.compare({...input,region_id:proposal.region_id,baseline});
  assert.equal(result.plans.length,3);
  assert.deepEqual(result.plans[0].water_need_mm,{min:null,max:null});
  // Separate traversal of raw parameter cache supplies the expected average.
  const raw = JSON.parse(fs.readFileSync(new URL('../../../data/raw/nasa_power_zankalon_2016_2025.json',import.meta.url)));
  const temperatures=raw.properties.parameter.T2M_MAX;
  let total=0;
  for(let year=2016;year<=2023;year++) {
    const bounds=[[`${year}0501`,`${year}0930`],[`${year}1001`,`${year+1}0430`],[`${year+1}0501`,`${year+1}0930`],[`${year+1}1101`,`${year+2}0430`]];
    for(const [start,end] of bounds) total+=Object.entries(temperatures).filter(([date,value])=>date>=start && date<=end && value>=35).length;
  }
  assert.equal(result.plans[0].hot_days,total/8);
  assert.ok(result.meta.limitations.some(s=>s.includes('review remains pending')));
});

test('heat priority selects lower exposure and complete-year ties choose the earliest year', () => {
  const engine = setup(c => {c.crops.find(c => c.id === 'summer_b').grow_window.start_month=7;});
  const result=engine.compare({...input,priority:'heat',scenario:'hottest_year'});
  assert.ok(result.plans[1].hot_days<result.plans[0].hot_days);
  const tied=setup((_c,cl)=>{
    cl.daily.forEach(row=>{row.tmax_c=35;row.rain_mm=0;});
    cl.scenarios.hottest_year.year=2020;cl.scenarios.driest_year.year=2020;
  });
  for(const scenario of ['hottest_year','driest_year']) assert.equal(tied.compare({...input,scenario}).meta.scenario_year,2020);
});


test('unreviewed stress scenarios select extremes only among fully covered rotation anchors', () => {
  const {catalog, climate, proposal} = researchInputs();
  const engine = createEngine(catalog, climate, {regionId:proposal.region_id, regionName:'Zankalon', unreviewed:true});
  assert.deepEqual(engine.config().scenarios, ['average','hottest_year','driest_year']);
  for (const [scenario, expected] of [['hottest_year',2023],['driest_year',2019]]) {
    const result = engine.compare({...input,region_id:proposal.region_id,baseline:['maize','wheat','maize','wheat'],scenario});
    assert.equal(result.meta.scenario_year, expected);
    assert.ok(result.meta.assumptions.some(s => s.includes('2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023')));
    assert.ok(result.meta.warnings.some(s => s.includes('complete rotation coverage')));
    const raw = JSON.parse(fs.readFileSync(new URL('../../../data/raw/nasa_power_zankalon_2016_2025.json',import.meta.url)));
    const bounds = [[`${expected}0501`,`${expected}0930`],[`${expected}1101`,`${expected+1}0430`],
      [`${expected+1}0501`,`${expected+1}0930`],[`${expected+1}1101`,`${expected+2}0430`]];
    const days = bounds.reduce((n,[start,end]) => n + Object.entries(raw.properties.parameter.T2M_MAX)
      .filter(([date,t]) => date >= start && date <= end && t >= 35).length,0);
    assert.equal(result.plans[0].hot_days,days);
  }
});

test('unreviewed eligible anchors respect gaps, null declarations and earliest-year ties', () => {
  const build = (edit) => {
    const catalog = structuredClone(originalCatalog), climate = structuredClone(originalClimate);
    edit(climate);
    return createEngine(catalog,climate,{...settings,fixture:false,unreviewed:true});
  };
  const gaps=build(cl => { cl.daily = cl.daily.filter(r => r.date !== '2024-02-29'); });
  assert.equal(gaps.compare({...input,scenario:'driest_year'}).meta.scenario_year,2021);
  const disabled=build(cl => {cl.scenarios.hottest_year.year=null;});
  assert.throws(()=>disabled.compare({...input,scenario:'hottest_year'}),code('INSUFFICIENT_DATA'));
  const tied=build(cl => {
    cl.daily.forEach(r=>{r.tmax_c=35;r.rain_mm=0;});
    cl.scenarios.hottest_year.year=2020;cl.scenarios.driest_year.year=2020;
  });
  for(const scenario of ['hottest_year','driest_year']) assert.equal(tied.compare({...input,scenario}).meta.scenario_year,2020);
});

test('missing-water warning identifies only the crop with incomplete evidence once', () => {
  const result = setup(catalog => {
    catalog.crops.find(crop => crop.id === 'winter_a').water_need_mm.min = null;
  }).compare(input);
  assert.deepEqual(result.meta.warnings.filter(warning => warning.startsWith('Crop ')), [
    'Crop winter_a: water-need range is incomplete; rotation water total is Not evaluated.',
  ]);
  assert.equal(result.plans[0].water_need_mm.min, null);
  assert.ok(result.plans[0].hot_days > 0);
});
