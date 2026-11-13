const SLOTS = ['y1_summer', 'y1_winter', 'y2_summer', 'y2_winter'];
const text = value => typeof value === 'string' && value.trim().length > 0;
const check = (condition, message) => { if (!condition) throw new Error(message); };
const nullableNumber = value => value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
const month = value => value === null || (Number.isInteger(value) && value >= 1 && value <= 12);
function onlyKeys(object, keys, name) {
  check(object && typeof object === 'object' && !Array.isArray(object), `Invalid ${name}.`);
  check(Object.keys(object).every(key => keys.includes(key)), `Unknown ${name} field; review the storage schema before importing.`);
}

// Explicit projection keeps MongoDB IDs and pending research fields private.
function toApi(document) {
  return {
    region_id: document.region.id,
    slot_order: [...document.slot_order],
    crops: document.crops.map(crop => ({
      id: crop.id, name: crop.name, valid_seasons: [...crop.valid_seasons],
      grow_window: { start_month: crop.grow_window.start_month, end_month: crop.grow_window.end_month },
      water_need_mm: { min: crop.water_need_mm.min, max: crop.water_need_mm.max },
      family: crop.family, is_legume: crop.is_legume, source_ids: [...crop.source_ids]
    })),
    sources: document.sources.map(({id, url, supports}) => ({id, url, supports}))
  };
}

function validateApi(catalog, {eligible = false} = {}) {
  check(text(catalog.region_id), 'Missing region ID.');
  check(JSON.stringify(catalog.slot_order) === JSON.stringify(SLOTS), 'Invalid slot order.');
  check(Array.isArray(catalog.crops) && Array.isArray(catalog.sources), 'Missing crops or sources.');
  const sourceIds = new Set();
  for (const source of catalog.sources) {
    check(text(source.id) && !sourceIds.has(source.id), 'Duplicate or missing source ID.');
    check(text(source.supports), 'Missing source description.');
    let url;
    try { url = new URL(source.url); } catch { throw new Error('Invalid source URL.'); }
    check(['https:', 'http:'].includes(url.protocol), 'Invalid source URL.');
    sourceIds.add(source.id);
  }
  const cropIds = new Set();
  for (const crop of catalog.crops) {
    check(text(crop.id) && text(crop.name) && !cropIds.has(crop.id), 'Duplicate or missing crop ID/name.');
    cropIds.add(crop.id);
    check(Array.isArray(crop.valid_seasons) && crop.valid_seasons.length > 0 &&
      new Set(crop.valid_seasons).size === crop.valid_seasons.length &&
      crop.valid_seasons.every(s => ['summer', 'winter'].includes(s)), 'Invalid crop season.');
    check(crop.grow_window && month(crop.grow_window.start_month) && month(crop.grow_window.end_month), 'Invalid growing window.');
    if (eligible) check(crop.grow_window.start_month !== null && crop.grow_window.end_month !== null, 'Unverified growing window.');
    const water = crop.water_need_mm;
    check(water && nullableNumber(water.min) && nullableNumber(water.max), 'Invalid water range.');
    check(water.min === null || water.max === null || water.min <= water.max, 'Reversed water range.');
    check(crop.family === null || text(crop.family), 'Invalid crop family.');
    check(crop.is_legume === null || typeof crop.is_legume === 'boolean', 'Invalid legume flag.');
    check(Array.isArray(crop.source_ids) && new Set(crop.source_ids).size === crop.source_ids.length &&
      crop.source_ids.every(id => sourceIds.has(id)), 'Unresolved or duplicate source ID.');
    if (eligible) check(crop.source_ids.length > 0, 'Missing crop evidence.');
  }
}

function validateSnapshot(doc, {live = false} = {}) {
  check(doc && doc.schema_version === 1, 'Unsupported catalog schema version.');
  onlyKeys(doc, ['_id', 'schema_version', 'decision_revision', 'region', 'kind', 'status', 'created_at', 'approval', 'limitations', 'slot_order', 'crops', 'sources'], 'catalog');
  for (const crop of doc.crops || []) {
    // These extension fields already exist in the supplied staging artifact.
    // They are preserved for Research review and never become API fields.
    onlyKeys(crop, ['id', 'name', 'valid_seasons', 'grow_window', 'water_need_mm', 'family', 'is_legume', 'source_ids',
      'kc_stages', 'heat_threshold_c', 'regulatory_status', 'regulatory_note', 'evidence_status', 'eligible_for_live', 'evidence_review', 'eligibility_status'], 'crop');
    onlyKeys(crop.grow_window, ['start_month', 'end_month', 'description'], 'growing window');
    onlyKeys(crop.water_need_mm, ['min', 'max'], 'water range');
  }
  check(text(doc._id) && /^[a-f0-9]{40}$/.test(doc.decision_revision), 'Missing revision identity.');
  check(['observed', 'fixture'].includes(doc.kind) && ['staging', 'sealed', 'approved', 'rejected'].includes(doc.status), 'Invalid catalog state.');
  check(doc.created_at instanceof Date && !Number.isNaN(doc.created_at.getTime()), 'Invalid creation date.');
  check(doc.region && text(doc.region.id) && text(doc.region.name), 'Invalid region.');
  const coords = doc.region.coordinates;
  check(coords && (coords.lat === null || (Number.isFinite(coords.lat) && Math.abs(coords.lat) <= 90)) &&
    (coords.lon === null || (Number.isFinite(coords.lon) && Math.abs(coords.lon) <= 180)), 'Invalid coordinates.');
  check(Array.isArray(doc.limitations) && doc.limitations.every(text), 'Invalid limitations.');
  check(doc.approval === null || (doc.approval && typeof doc.approval === 'object'), 'Invalid approval.');
  validateApi(toApi(doc), {eligible: live});
  for (const source of doc.sources) check(text(source.title), 'Missing source title.');
  if (doc.kind === 'fixture') check(doc.status !== 'approved', 'Fixtures cannot be approved.');
  if (live) {
    check(doc.kind === 'observed' && doc.status === 'approved', 'Catalog is not approved.');
    check(coords.lat !== null && coords.lon !== null, 'Missing approved coordinates.');
    check(doc.crops.length >= 4 && doc.crops.length <= 6, 'Live catalog needs 4–6 approved crops.');
    check(doc.approval && text(doc.approval.research_record) && text(doc.approval.technical_record) &&
      doc.approval.approved_at instanceof Date && !Number.isNaN(doc.approval.approved_at.getTime()), 'Missing approval records.');
    for (const crop of doc.crops) {
      check(crop.eligible_for_live !== false, 'Crop is explicitly ineligible.');
      check(!crop.evidence_status || crop.evidence_status === 'approved', 'Crop evidence is pending.');
      check(!crop.evidence_review || Object.values(crop.evidence_review).every(review => review.status === 'approved'), 'Crop evidence review is pending.');
      check(!crop.eligibility_status || crop.eligibility_status === 'approved', 'Crop eligibility is pending.');
    }
  }
}

function cropFitsSlot(crop, slot) {
  return SLOTS.includes(slot) && crop.valid_seasons.includes(slot.endsWith('summer') ? 'summer' : 'winter');
}

// Reports the month wrap only. Mapping to actual rotation years belongs to
// the Research-approved calendar method, which is still pending.
function crossesYear(window) {
  if (window.start_month === null || window.end_month === null) return null;
  return window.start_month > window.end_month;
}
module.exports = { SLOTS, validateApi, validateSnapshot, toApi, cropFitsSlot, crossesYear };
