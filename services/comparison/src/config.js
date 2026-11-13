import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export function configuration(overrides = {}) {
  const env = {};
  for (const name of ['.env.example', '.env']) {
    const file = fileURLToPath(new URL(`../../../${name}`, import.meta.url));
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (!line.trim() || line.trimStart().startsWith('#')) continue;
      const separator = line.indexOf('=');
      if (separator < 1) throw new Error(`Invalid setting in ${name}`);
      env[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
    }
  }
  Object.assign(env, process.env, overrides);
  const integer = (name, fallback) => {
    const value = Number(env[name] || fallback);
    if (!Number.isInteger(value) || value <= 0) throw new Error(`Invalid ${name}`);
    return value;
  };
  const mode = env.DATA_MODE || 'live';
  if (!['live', 'fixture'].includes(mode)) throw new Error('DATA_MODE must be live or fixture.');
  for (const name of ['CLIMATE_BASE_URL', 'CROP_BASE_URL']) {
    const address = new URL(env[name]);
    if (!['http:', 'https:'].includes(address.protocol) || address.username || address.password || address.search || address.hash) throw new Error(`Invalid ${name}`);
  }
  return {
    mode, host: env.HOST || '127.0.0.1', port: integer('PORT', env.COMPARISON_PORT || 8000),
    regionId: env.COMPARISON_REGION_ID || (mode === 'fixture' ? 'sample_region' : 'zankalon_sharkia'),
    regionName: env.COMPARISON_REGION_NAME || (mode === 'fixture' ? 'Development region' : 'Zankalon, Sharkia Governorate, Egypt'),
    climateUrl: env.CLIMATE_BASE_URL, cropUrl: env.CROP_BASE_URL,
    origin: env.APP_ORIGIN || 'http://localhost:5173',
    connectMs: integer('HTTP_CONNECT_TIMEOUT_MS', 1000), readMs: integer('HTTP_READ_TIMEOUT_MS', 3000),
    totalMs: integer('HTTP_TOTAL_TIMEOUT_MS', 5000), heatThreshold: 35,
  };
}
