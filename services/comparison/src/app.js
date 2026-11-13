import http from 'node:http';
import { ApiError, statuses, requireInput } from './errors.js';
import { createEngine, validateRequest } from './engine.js';
import { getJson } from './client.js';

async function readBody(request) {
  requireInput(String(request.headers['content-type']).split(';')[0].trim() === 'application/json', 'Send Content-Type: application/json.');
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    requireInput(size <= 65536, 'Provide a JSON request body under 64 KiB.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new ApiError('INVALID_INPUT', 'Request body must contain valid JSON.'); }
}

export function createServer(settings) {
  const server = http.createServer(async (request, response) => {
    const controller = new AbortController();
    const send = (status, body) => {
      if (response.destroyed || response.writableEnded) return;
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(body));
    };
    const fail = error => {
      const code = error instanceof ApiError ? error.code : 'SERVICE_UNAVAILABLE';
      send(statuses[code], { error: { code, message: error instanceof ApiError ? error.message : 'Comparison is unavailable. Retry shortly.' } });
    };
    const timer = setTimeout(() => {
      controller.abort();
      fail(new ApiError('SERVICE_UNAVAILABLE', 'Comparison timed out. Retry shortly.'));
      request.resume();
    }, settings.totalMs);
    response.on('close', () => { clearTimeout(timer); controller.abort(); });
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-AgriLens-Data-Mode', settings.mode);
    response.setHeader('Access-Control-Expose-Headers', 'X-AgriLens-Data-Mode');
    response.setHeader('Vary', 'Origin');
    if (request.headers.origin === settings.origin) response.setHeader('Access-Control-Allow-Origin', settings.origin);
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    try {
      const address = new URL(request.url, 'http://localhost');
      if (request.method === 'OPTIONS') { send(200, {}); return; }
      const known = (request.method === 'GET' && ['/health', '/api/config'].includes(address.pathname)) || (request.method === 'POST' && address.pathname === '/api/compare');
      if (!known) { send(404, { error: { code: 'INVALID_INPUT', message: 'Use GET /api/config or POST /api/compare.' } }); return; }
      requireInput(!address.search, 'Remove unsupported query parameters.');
      let input;
      if (address.pathname === '/api/compare') {
        input = await readBody(request);
        if (controller.signal.aborted) return;
        validateRequest(input);
        if (input.region_id !== settings.regionId) throw new ApiError('UNKNOWN_REGION', 'Choose the configured region.');
      }
      const query = `?region_id=${encodeURIComponent(settings.regionId)}`;
      const [catalog, climate] = await Promise.all([
        getJson(`${settings.cropUrl.replace(/\/$/, '')}/internal/crops${query}`, settings, controller.signal),
        getJson(`${settings.climateUrl.replace(/\/$/, '')}/internal/climate${query}`, settings, controller.signal),
      ]);
      if (controller.signal.aborted) return;
      const engine = createEngine(catalog, climate, { ...settings, fixture: settings.mode === 'fixture', unreviewed: settings.mode === 'unreviewed' });
      const config = engine.config();
      if (address.pathname === '/health') send(200, { status: 'ok' });
      else if (input) send(200, engine.compare(input));
      else send(200, config);
    } catch (error) {
      fail(addressIsHealth(request.url) ? new ApiError('SERVICE_UNAVAILABLE', 'Comparison dependencies are not ready. Retry shortly.') : error);
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  });
  server.requestTimeout = settings.totalMs;
  server.headersTimeout = Math.max(settings.totalMs, 1000);
  return server;
}
function addressIsHealth(address) { return address.split('?')[0] === '/health'; }
