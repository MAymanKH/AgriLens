const path = require('node:path');
const {ROOT, configuration} = require('./config');
const {connect, model} = require('./database');
const {createApp} = require('./app');

async function main() {
  const config = configuration(process.argv.includes('--fixture') ? {DATA_MODE: 'fixture'} : {});
  let connection;
  let Model;
  let connecting;
  async function getModel() {
    if (connection && connection.readyState === 1) return Model;
    if (!connecting) connecting = (async () => {
      await connection?.close();
      connection = await connect(config);
      Model = model(connection);
      return Model;
    })().finally(() => {connecting = undefined;});
    return connecting;
  }
  const app = createApp({mode: config.mode, catalogId: config.catalogId, getModel,
    fixture: config.mode === 'fixture' ? require(path.join(ROOT, 'fixtures/crops/catalog.json')) : undefined,
    knownRegion: require(path.join(ROOT, 'data/processed/mongodb/crop_catalog_document.json')).region.id});
  const server = app.listen(config.port, config.host, () => {
    console.log(`Crop service: http://${config.host}:${config.port} (${config.mode})`);
    if (config.mode === 'fixture') console.log('SYNTHETIC DEVELOPMENT FIXTURES — not agricultural results.');
    else if (!config.catalogId) console.log('Research catalog is staging. Live responses remain unavailable until approval.');
  });
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? 'Port is already in use.' : 'Cannot start HTTP server.'); process.exitCode = 1; connection?.close(); });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    server.close(async () => { await connection?.close(); process.exit(0); });
    setTimeout(() => process.exit(1), 4000).unref();
  });
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
