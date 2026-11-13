import http from 'node:http';
import https from 'node:https';
import { ApiError } from './errors.js';

// The absolute timer also covers peers that keep streaming bytes or headers.
export function getJson(address, settings, signal) {
  return new Promise((resolve, reject) => {
    const unavailable = () => new ApiError('SERVICE_UNAVAILABLE', 'An internal service is unavailable or returned invalid data. Retry shortly.');
    const transport = new URL(address).protocol === 'https:' ? https : http;
    let connectTimer;
    const request = transport.get(address, { signal, agent: false }, response => {
      clearTimeout(connectTimer);
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 8 * 1024 * 1024) { request.destroy(unavailable()); return; }
        chunks.push(chunk);
      });
      response.on('error', () => reject(unavailable()));
      response.on('end', () => {
        try {
          if (!String(response.headers['content-type']).toLowerCase().includes('application/json')) throw unavailable();
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (response.statusCode !== 200) {
            const code = body?.error?.code;
            if ((response.statusCode === 422 && ['INSUFFICIENT_DATA', 'UNSUPPORTED_SCENARIO'].includes(code)) || (response.statusCode === 404 && code === 'UNKNOWN_REGION')) {
              throw new ApiError(code, code === 'UNKNOWN_REGION' ? 'The configured region is unavailable.' : 'An internal dataset is not ready for comparison.');
            }
            throw unavailable();
          }
          const mode = response.headers['x-agrilens-data-mode'];
          if ((settings.mode === 'live' && mode === 'fixture') || (settings.mode === 'fixture' && mode !== 'fixture')) throw unavailable();
          resolve(body);
        } catch (error) { reject(error instanceof ApiError ? error : unavailable()); }
      });
    });
    connectTimer = setTimeout(() => request.destroy(unavailable()), settings.connectMs);
    request.on('socket', socket => {
      socket.once(transport === https ? 'secureConnect' : 'connect', () => clearTimeout(connectTimer));
    });
    request.setTimeout(settings.readMs, () => request.destroy(unavailable()));
    request.on('error', () => reject(unavailable()));
    request.on('close', () => clearTimeout(connectTimer));
  });
}
