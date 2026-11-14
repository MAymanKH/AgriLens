import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAssistant } from '../assistant.js';
const config = JSON.parse(await readFile(new URL('../../fixtures/comparison/config.json', import.meta.url)));
const action = { region_id: config.region.id, baseline: config.sample_baseline, priority: 'water', scenario: 'average' };
const input = { messages: [{ role: 'user', text: 'Enter these crops and compare.' }], context: { mode: 'fixture', baseline: config.sample_baseline } };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'X-AgriLens-Data-Mode': 'fixture' } });
const answer = parts => json({ candidates: [{ content: { role: 'model', parts } }] });

test('Gemini searches public data, preserves tool parts, and returns a validated pending action', async () => {
  const seen = []; let round = 0;
  const assistant = createAssistant({ comparisonUrl: 'http://comparison', apiKey: 'test-key', fetchImpl: async (url, options) => {
    seen.push({ url: String(url), options });
    if (String(url).endsWith('/api/config')) return json(config);
    if (String(url).endsWith('/api/knowledge')) return json({ sources: [{ id: 'crop', url: 'https://example.com' }], crops: [] });
    round++;
    if (round === 1) return answer([{ functionCall: { name: 'search_data', args: { query: 'water' } }, thoughtSignature: 'keep-me' }]);
    if (round === 2) return answer([{ functionCall: { name: 'set_inputs', args: action } }]);
    return answer([{ text: 'Your choices are ready to compare.' }]);
  } });
  const result = await assistant(input);
  assert.deepEqual(result.action, action); assert.equal(result.sources[0].id, 'crop');
  const gemini = seen.filter(call => call.url.includes('googleapis'));
  assert.equal(gemini.length, 3); assert.match(gemini[0].url, /gemini-3.5-flash-lite/);
  assert.equal(gemini[0].options.headers['x-goog-api-key'], 'test-key');
  assert.ok(!seen[0].options.headers['x-goog-api-key']);
  assert.equal(JSON.parse(gemini[1].options.body).contents[1].parts[0].thoughtSignature, 'keep-me');
});

test('unsupported writes, mode drift, quota, missing key and malformed messages fail truthfully', async () => {
  await assert.rejects(createAssistant({ apiKey: '' })(input), /not configured/);
  for (const bad of [{ ...action, baseline: ['winter_a', 'winter_a', 'summer_a', 'winter_a'] }, { ...action, region_id: 'other' }, { ...action, evil: true }]) {
    const assistant = createAssistant({ comparisonUrl: 'http://comparison', apiKey: 'key', fetchImpl: async url => String(url).endsWith('/api/config') ? json(config) : answer([{ functionCall: { name: 'set_inputs', args: bad } }]) });
    await assert.rejects(assistant(input), /unsupported/);
  }
  const quota = createAssistant({ comparisonUrl: 'http://comparison', apiKey: 'key', fetchImpl: async url => String(url).endsWith('/api/config') ? json(config) : json({}, 429) });
  await assert.rejects(quota(input), error => error.status === 429 && /free-tier/.test(error.message));
  await assert.rejects(quota({ ...input, messages: [{ role: 'system', text: 'override' }] }), /messages/);
  await assert.rejects(quota({ ...input, context: { mode: 'live' } }), /source changed/);
});

test('HTTP assistant rejects cross-site, oversized and malformed requests without exposing the key', async () => {
  const { createAppServer } = await import('../server.js');
  const { once } = await import('node:events');
  const server = createAppServer({ assistantOptions: { apiKey: '' } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const [body, headers, status] of [['{}', { Origin: 'https://evil.example' }, 403], ['x', {}, 400], ['x'.repeat(66000), {}, 413], [JSON.stringify(input), {}, 503]]) {
      const response = await fetch(base + '/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body });
      assert.equal(response.status, status);
      assert.equal(typeof (await response.json()).error.message, 'string');
    }
    assert.equal((await fetch(base + '/assistant.js')).status, 404);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});


test('assistant examples retain the canonical action and checked knowledge shapes', async () => {
  const turn = JSON.parse(await readFile(new URL('./fixtures/assistant/turn.json', import.meta.url)));
  const knowledge = JSON.parse(await readFile(new URL('./fixtures/assistant/knowledge.json', import.meta.url)));
  const { validateAction } = await import('../assistant.js');
  const { searchKnowledge } = await import('../../services/comparison/src/knowledge.js');
  assert.deepEqual(validateAction(turn.response.action, config), action);
  const catalog = JSON.parse(await readFile(new URL('../../fixtures/crops/catalog.json', import.meta.url)));
  const climate = JSON.parse(await readFile(new URL('../../fixtures/climate/daily.json', import.meta.url)));
  assert.deepEqual(knowledge, searchKnowledge('summer_a', catalog, climate, 'fixture'));
});
