import http from 'node:http';
import { createAssistant, assistantHttp } from './assistant.js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const files = new Map([
  ['/', ['index.html', 'text/html']],
  ['/src/markdown.js', ['src/markdown.js', 'text/javascript']],
  ['/src/assistant.js', ['src/assistant.js', 'text/javascript']],
  ['/src/main.js', ['src/main.js', 'text/javascript']],
  ['/src/api.js', ['src/api.js', 'text/javascript']],
  ['/src/i18n.js', ['src/i18n.js', 'text/javascript']],
  ['/src/farmer-benefits.js', ['src/farmer-benefits.js', 'text/javascript']],
  ['/src/model.js', ['src/model.js', 'text/javascript']],
  ['/src/views.js', ['src/views.js', 'text/javascript']],
  ['/src/styles.css', ['src/styles.css', 'text/css']],
  ...['wheat', 'maize', 'soybean', 'faba-bean', 'droplet', 'thermometer', 'sprout', 'alert-triangle'].map(name => [`/src/assets/${name}.svg`, [`src/assets/${name}.svg`, 'image/svg+xml']]),
  ...['regular', 'semibold'].map(weight => [`/src/assets/readex-${weight}.ttf`, [`src/assets/readex-${weight}.ttf`, 'font/ttf']]),
]);

export function createAppServer({ comparisonUrl = 'https://agriapi.mohamedayman.net', timeoutMs = 8000, assistantOptions = {} } = {}) {
  const upstream = new URL(comparisonUrl);
  if (!['http:', 'https:'].includes(upstream.protocol) || upstream.username || upstream.password || upstream.search || upstream.hash || upstream.pathname !== '/') {
    throw new Error('COMPARISON_BASE_URL must be an HTTP origin without credentials.');
  }
  const assistant = createAssistant({ comparisonUrl, ...assistantOptions });
  return http.createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    const sendError = (status, message) => {
      if (response.destroyed || response.writableEnded) return;
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message } }));
    };
    try {
      const path = new URL(request.url, 'http://localhost').pathname;
      if (request.url === '/api/assistant') { await assistantHttp(request, response, assistant); return; }
      if (request.url === '/api/config' && request.method === 'GET' || request.url === '/api/compare' && request.method === 'POST') {
        const chunks = [];
        let size = 0;
        for await (const chunk of request) {
          size += chunk.length;
          if (size > 65536) { sendError(413, 'The comparison request is too large.'); return; }
          chunks.push(chunk);
        }
        const result = await fetch(new URL(path, upstream), {
          method: request.method,
          headers: { 'Content-Type': 'application/json' },
          body: request.method === 'POST' ? Buffer.concat(chunks) : undefined,
          signal: AbortSignal.timeout(timeoutMs),
          redirect: 'error',
        });
        const body = await result.text();
        response.writeHead(result.status, {
          'Content-Type': 'application/json',
          ...(result.headers.has('X-AgriLens-Data-Mode') ? { 'X-AgriLens-Data-Mode': result.headers.get('X-AgriLens-Data-Mode') } : {}),
        });
        response.end(body);
      } else if (request.method === 'GET' && files.has(path) && !new URL(request.url, 'http://localhost').search) {
        const [file, type] = files.get(path);
        const content = await readFile(new URL(file, import.meta.url));
        response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
        response.end(content);
      } else {
        response.writeHead(404, { 'Content-Type': 'text/plain' });
        response.end('Not found');
      }
    } catch {
      sendError(503, 'Comparison is unavailable. Your choices are kept. Try again.');
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createAppServer({ comparisonUrl: process.env.COMPARISON_BASE_URL });
  const port = Number(process.env.APP_PORT || 5173);
  server.listen(port, process.env.APP_HOST || '127.0.0.1', () => console.log(`AgriLens app: http://localhost:${port}`));
}
