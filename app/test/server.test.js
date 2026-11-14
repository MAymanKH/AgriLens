import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createAppServer } from '../server.js';

async function listen(server) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return `http://127.0.0.1:${server.address().port}`; }
async function close(server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }

test('serves the app, proxies only public endpoints, preserves status/mode, and fails truthfully', async () => {
  const seen = [];
  const upstream = http.createServer(async (request, response) => {
    let body = ''; for await (const chunk of request) body += chunk;
    seen.push({ path: request.url, body });
    response.writeHead(request.method === 'POST' ? 422 : 200, { 'Content-Type': 'application/json', 'X-AgriLens-Data-Mode': 'unreviewed' });
    response.end(JSON.stringify(request.method === 'POST' ? { error: { code: 'INSUFFICIENT_DATA', message: 'Not enough data.' } } : { region: 'test' }));
  });
  const upstreamUrl = await listen(upstream);
  const app = createAppServer({ comparisonUrl: upstreamUrl });
  const url = await listen(app);
  try {
    const page = await fetch(url); assert.equal(page.status, 200); assert.match(await page.text(), /id="app"/);
    assert.match(page.headers.get('Content-Security-Policy'), /connect-src 'self'/);
    for (const [path, type] of [['wheat.svg', 'image/svg+xml'], ['readex-regular.ttf', 'font/ttf']]) {
      const asset = await fetch(`${url}/src/assets/${path}`);
      assert.equal(asset.status, 200);
      assert.ok(asset.headers.get('Content-Type').startsWith(type));
      assert.ok((await asset.arrayBuffer()).byteLength > 0);
    }
    const config = await fetch(`${url}/api/config`);
    assert.equal(config.headers.get('X-AgriLens-Data-Mode'), 'unreviewed');
    assert.deepEqual(await config.json(), { region: 'test' });
    const comparison = await fetch(`${url}/api/compare`, { method: 'POST', body: '{"baseline":[]}' });
    assert.equal(comparison.status, 422); assert.equal((await comparison.json()).error.code, 'INSUFFICIENT_DATA');
    assert.equal(seen[1].body, '{"baseline":[]}');
    for (const path of ['/internal/crops', '/api/config?region=x', '/server.js', '/package.json']) assert.equal((await fetch(url + path)).status, 404);
    await close(upstream);
    const unavailable = await fetch(`${url}/api/config`);
    assert.equal(unavailable.status, 503); assert.equal((await unavailable.json()).error.code, 'SERVICE_UNAVAILABLE');
  } finally { await close(app); if (upstream.listening) await close(upstream); }
});
