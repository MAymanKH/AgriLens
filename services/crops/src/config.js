const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../../..');

// Same literal KEY=value precedence as tools/dev.py; no shell interpolation.
function configuration(overrides = {}) {
  const env = {};
  for (const name of ['.env.example', '.env']) {
    const file = path.join(ROOT, name);
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
  if (!['live', 'fixture', 'unreviewed'].includes(mode)) throw new Error('DATA_MODE must be live, unreviewed or fixture.');
  return {
    mode, host: env.HOST || '127.0.0.1', port: integer('PORT', env.CROP_PORT || 8002),
    uri: env.MONGODB_URI || 'mongodb://127.0.0.1:27017',
    dbName: env.CROP_DB_NAME || 'agrilens_crops', catalogId: env.CROP_CATALOG_ID || '',
    timeout: integer('MONGODB_SERVER_SELECTION_TIMEOUT_MS', 2000)
  };
}
module.exports = { ROOT, configuration };
