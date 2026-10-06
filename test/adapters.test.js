import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ingest } from '../src/core/ingest.js';
import { convert, deriveProvider } from '../src/core/pipeline.js';

const raws = ingest(JSON.parse(readFileSync(new URL('./fixtures/nscloud-models.json', import.meta.url), 'utf8'))).models;
const provider = { id: 'nscloud', name: 'NSCloud', baseURL: 'https://aillm.nscloud.ai/v1/models', apiKey: 'sk-test', apiKeyMode: 'env' };

// Keys allowed by https://opencode.ai/config.json → ProviderConfig.models.* (additionalProperties: false)
const OPENCODE_MODEL_KEYS = new Set(['id', 'name', 'family', 'release_date', 'attachment', 'reasoning', 'temperature', 'tool_call',
  'interleaved', 'cost', 'limit', 'modalities', 'experimental', 'status', 'provider', 'options', 'headers', 'variants']);

test('OpenCode: provider block, env api key, schema-safe model keys', () => {
  const { config, filename } = convert({ raws, provider, target: 'opencode' });
  assert.equal(filename, 'opencode.json');
  assert.equal(config.$schema, 'https://opencode.ai/config.json');
  const p = config.provider.nscloud;
  assert.equal(p.npm, '@ai-sdk/openai-compatible');
  assert.equal(p.options.baseURL, 'https://aillm.nscloud.ai/v1');
  assert.equal(p.options.apiKey, '{env:NSCLOUD_API_KEY}');
  for (const [id, m] of Object.entries(p.models)) {
    for (const k of Object.keys(m)) assert.ok(OPENCODE_MODEL_KEYS.has(k), `${id}: unexpected key ${k}`);
    assert.ok(m.limit.context > 0 && m.limit.output > 0, `${id}: limits`);
    assert.deepEqual(m.options, { store: false });
  }
  // non-chat models are dropped, not blacklisted
  assert.equal(p.models['gpt-image-2'], undefined);
  assert.equal(p.blacklist, undefined);
});

test('OpenCode: disabled chat models go to blacklist', () => {
  const { config } = convert({ raws, provider, overrides: { 'gpt-5': { disabled: true } } });
  const p = config.provider.nscloud;
  assert.ok(p.models['gpt-5']);
  assert.deepEqual(p.blacklist, ['gpt-5']);
});

test('OpenCode: api key modes', () => {
  const inline = convert({ raws, provider: { ...provider, apiKeyMode: 'inline' } }).config.provider.nscloud;
  assert.equal(inline.options.apiKey, 'sk-test');
  const none = convert({ raws, provider: { ...provider, apiKeyMode: 'none' } }).config.provider.nscloud;
  assert.equal('apiKey' in none.options, false);
});

test('OpenCode: vision, reasoning and variants are emitted', () => {
  const m = convert({ raws, provider }).config.provider.nscloud.models['glm-4.6v'];
  assert.equal(m.attachment, true);
  assert.deepEqual(m.modalities.input, ['text', 'image']);
  assert.equal(m.reasoning, true);
  assert.deepEqual(Object.keys(m.variants), ['thinking', 'no-thinking']);
});

test('Cherry Studio: provider bundle and deep link', () => {
  const { config, deepLink } = convert({ raws, provider, target: 'cherry' });
  assert.equal(config.provider.apiHost, 'https://aillm.nscloud.ai/v1/');
  assert.equal(config.provider.apiKey, '', 'key only inlined when apiKeyMode is inline');
  const kimi = config.provider.models.find((m) => m.id === 'moonshotai/kimi-k2.6');
  assert.deepEqual(kimi.type, ['text', 'vision', 'reasoning', 'function_calling']);
  assert.ok(!config.provider.models.some((m) => m.id === 'gpt-image-2'));

  const url = new URL(deepLink);
  assert.equal(url.protocol, 'cherrystudio:');
  const data = JSON.parse(Buffer.from(url.searchParams.get('data'), 'base64').toString('utf8'));
  assert.deepEqual(data, { id: 'nscloud', baseUrl: 'https://aillm.nscloud.ai/v1/', apiKey: 'sk-test', name: 'NSCloud', type: 'openai' });
});

test('deriveProvider from host', () => {
  assert.deepEqual(deriveProvider('https://api.qnaigc.com/v1'), { id: 'qnaigc', name: 'Qnaigc' });
  assert.equal(deriveProvider('https://aillm.nscloud.ai/v1').id, 'nscloud');
  assert.equal(deriveProvider('http://localhost:11434/v1').id, 'local');
});
