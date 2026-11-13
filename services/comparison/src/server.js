import { configuration } from './config.js';
import { createServer } from './app.js';

const settings = configuration();
const server = createServer(settings);
server.listen(settings.port, settings.host, () => console.log(`Comparison service: http://${settings.host}:${settings.port} (${settings.mode})`));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    server.close();
    server.closeAllConnections();
  });
}
