const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {ROOT, configuration} = require('../src/config');
const {connect, model, ensureCollection} = require('../src/database');
const {validateSnapshot} = require('../src/catalog');
const {importStaging, verifyExisting} = require('../src/repository');

async function main() {
  const action = process.argv[2];
  if (!['import', 'verify', 'inspect'].includes(action)) throw new Error('Use import, verify, or inspect.');
  const config = configuration();
  if (!/^mongodb:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?(?:\/|$)/.test(config.uri)) {
    throw new Error('This development importer requires a local MongoDB address.');
  }
  // Existing research checker verifies the source package without changing files.
  if (action !== 'inspect') execFileSync('python3', [path.join(ROOT, 'scripts/build_research_data.py'), '--check'], {stdio: 'inherit', cwd: ROOT});
  const doc = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/processed/mongodb/crop_catalog_document.json'), 'utf8'));
  doc.created_at = new Date(doc.created_at.$date);
  validateSnapshot(doc);
  const connection = await connect(config);
  try {
    const version = (await connection.db.admin().command({buildInfo: 1})).version;
    if (!version.startsWith('8.0.')) throw new Error('The team runtime requires MongoDB 8.0.');
    const Model = model(connection);
    let result = 'read';
    if (action === 'import') { await ensureCollection(connection); result = await importStaging(Model, doc); }
    const stored = await Model.findById(doc._id).lean();
    if (!stored) throw new Error('Catalog is not imported. Run npm run import:data.');
    if (action === 'verify') result = verifyExisting(stored, doc);
    console.log(JSON.stringify({result, database: config.dbName, collection: 'crop_catalogs', id: stored._id,
      status: stored.status, approval: stored.approval, crops: stored.crops.length, sources: stored.sources.length,
      limitations: stored.limitations, ...(action === 'inspect' ? {records: stored.crops} : {})}, null, 2));
  } finally { await connection.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
