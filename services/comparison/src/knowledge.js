import { requireInput } from './errors.js';

// Search only the service snapshots already checked by createEngine.
export function searchKnowledge(query, catalog, climate, mode) {
  requireInput(typeof query === 'string' && query.trim().length > 0 && query.length <= 500, 'Provide a search query of 1–500 characters.');
  const terms = query.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) || [];
  const matches = value => terms.some(term => JSON.stringify(value).toLowerCase().includes(term));
  const crops = catalog.crops.filter(matches);
  const daily = climate.daily.filter(matches);
  return {
    region_id: catalog.region_id, mode, query,
    crops, sources: catalog.sources.filter(source => crops.some(crop => crop.source_ids.includes(source.id))),
    climate: { period: climate.period, coordinates: climate.coordinates, units: climate.units,
      scenarios: climate.scenarios, provenance: climate.provenance,
      daily: daily.slice(0, 20), matching_days: daily.length, truncated: daily.length > 20 },
    limitations: ['Search covers the current service-owned crop and climate snapshots, not private records or archived snapshots.',
      'Daily search is a bounded sample, not an aggregate. Use comparisons for rotation metrics.',
      mode === 'fixture' ? 'Synthetic development data, not NASA measurements.' : mode === 'unreviewed' ? 'Research review is pending. Historical scenarios are not forecasts.' : 'Historical observations are not forecasts.'],
  };
}
