import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('../../../../docs/research/power_1991_2020/', import.meta.url);
const auditSha = '882e15e51ef99b7eb60e0a3ec8d73097074d1cd50a90b05b6c24ae783a194fe6';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const variables = ['T2M_MAX', 'T2M_MIN', 'RH2M', 'PRECTOTCORR', 'ALLSKY_SFC_SW_DWN', 'WS2M'];
const units = ['C', 'C', '%', 'mm/day', 'MJ/m^2/day', 'm/s'];
const check = condition => { if (!condition) throw new Error('Historical reference failed validation'); };

// Only this pinned, audited revision is eligible. No network or synthetic fallback.
export function loadHistoricalReference(read = name => readFileSync(new URL(name, root))) {
  const bytes = read('audit.json');
  check(digest(bytes) === auditSha);
  const audit = JSON.parse(bytes);
  const daily = [];
  for (const [index, chunk] of audit.chunks.entries()) {
    const first = 1991 + index * 10;
    const payload = read(chunk.raw_file);
    check(digest(payload) === chunk.sha256);
    const raw = JSON.parse(payload);
    check(raw.header.start === `${first}0101` && raw.header.end === `${first + 9}1231` && raw.header.time_standard === 'LST');
    check(raw.geometry.type === 'Point' && Math.abs(raw.geometry.coordinates[0] - 31.43332) <= .00051 && Math.abs(raw.geometry.coordinates[1] - 30.58057) <= .00051);
    const parameters = raw.properties.parameter;
    const dates = [];
    for (let stamp = Date.UTC(first, 0, 1); stamp < Date.UTC(first + 10, 0, 1); stamp += 86400000) dates.push(new Date(stamp).toISOString().slice(0, 10));
    variables.forEach((variable, i) => {
      check(raw.parameters[variable].units === units[i] && Object.keys(parameters[variable]).length === dates.length);
      for (const date of dates) {
        const value = parameters[variable][date.replaceAll('-', '')];
        check(typeof value === 'number' && Number.isFinite(value) && value !== raw.header.fill_value && value !== -999);
        if (i >= 3) check(value >= 0);
        if (variable === 'RH2M') check(value >= 0 && value <= 100);
      }
    });
    for (const date of dates) {
      const key = date.replaceAll('-', '');
      check(parameters.T2M_MIN[key] <= parameters.T2M_MAX[key]);
      daily.push({ date, tmax_c: parameters.T2M_MAX[key], rain_mm: parameters.PRECTOTCORR[key] });
    }
  }
  check(daily.length === 10958);
  return {
    status: 'available', scientific_approval: 'pending', region_id: 'zankalon_sharkia',
    coordinates: audit.request_coordinates, period: { first_year: 1991, last_year: 2020 },
    units: { tmax: 'C', rain: 'mm/day' }, daily,
    provenance: {
      source_url: 'https://power.larc.nasa.gov/docs/services/api/temporal/daily/',
      retrieved_at: audit.chunks.map(chunk => chunk.retrieved_at_utc).sort().at(-1),
      missing_days: 0, spatial_resolution: 'NASA POWER gridded data; not field measurements', time_standard: 'LST',
      audit_sha256: auditSha,
      artifacts: audit.chunks.map(({ raw_file, sha256, request_url, retrieved_at_utc }) => ({ raw_file, sha256, request_url, retrieved_at_utc })),
    },
  };
}

export function historicalReference(mode, regionId, coordinates, load = loadHistoricalReference) {
  if (mode !== 'unreviewed' || regionId !== 'zankalon_sharkia') return undefined;
  if (Math.abs(coordinates.lat - 30.58057) > .00051 || Math.abs(coordinates.lon - 31.43332) > .00051) return { status: 'unavailable' };
  try { return load(); } catch { return { status: 'unavailable' }; }
}
