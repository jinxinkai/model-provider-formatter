import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';

let server;
let base;
let upstream;
let upstreamURL;

before(async () => {
  // Fake upstream /v1/models that checks the forwarded bearer token.
  upstream = createServer((req, res) => {
    if (req.url !== '/v1/models') return res.writeHead(404).end();
    if (req.headers.authorization !== 'Bearer sk-test') return res.writeHead(401).end('{"error":"no key"}');
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ object: 'list', data: [{ id: 'glm-5.1', object: 'model' }] }));
  });
  await new Promise((r) => upstream.listen(0, '127.0.0.1', r));
  upstreamURL = `http://127.0.0.1:${upstream.address().port}/v1`;

  const dist = mkdtempSync(join(tmpdir(), 'mpf-dist-'));
  mkdirSync(join(dist, 'assets'));
  writeFileSync(join(dist, 'index.html'), '<!doctype html><div id="app"></div>');
  writeFileSync(join(dist, 'assets', 'index-abc123.js'), 'console.log(1)');

  server = createApp({ staticDir: dist }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  upstream.close();
});

const post = (body) => fetch(`${base}/api/models`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('GET /api/health', async () => {
  const res = await fetch(`${base}/api/health`);
  assert.deepEqual(await res.json(), { ok: true });
});

test('POST /api/models proxies upstream with the bearer token', async () => {
  const res = await post({ url: upstreamURL, apiKey: 'sk-test' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.baseURL, upstreamURL);
  assert.equal(body.payload.data[0].id, 'glm-5.1');
});

test('POST /api/models surfaces upstream errors as 502', async () => {
  const res = await post({ url: upstreamURL });
  assert.equal(res.status, 502);
  assert.match((await res.json()).error, /HTTP 401/);
});

test('POST /api/models without url is a 400', async () => {
  const res = await post({});
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, '缺少 API 地址');
});

test('static: index revalidates, hashed assets are immutable', async () => {
  const index = await fetch(`${base}/`);
  assert.equal(index.status, 200);
  assert.equal(index.headers.get('cache-control'), 'no-cache');
  const asset = await fetch(`${base}/assets/index-abc123.js`);
  assert.match(asset.headers.get('cache-control'), /immutable/);
});

test('POST /api/models answers in the Accept-Language locale', async () => {
  const res = await fetch(`${base}/api/models`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept-Language': 'en' }, body: '{}' });
  assert.equal((await res.json()).error, 'API URL is required');
});

test('POST /api/models rejects an unparsable URL with 400', async () => {
  const res = await post({ url: 'http://exa mple' });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /API 地址无效/);
});
