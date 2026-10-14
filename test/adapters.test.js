import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ingest } from '../src/core/ingest.js';
import { convert, deriveProvider } from '../src/core/pipeline.js';
import { inputVarFor } from '../src/core/adapters/vscode.js';

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

// Keys documented at https://code.visualstudio.com/docs/agent-customization/language-models#_custom-endpoint-configuration-reference
const VSCODE_MODEL_KEYS = new Set(['id', 'name', 'url', 'apiType', 'toolCalling', 'vision', 'maxInputTokens', 'maxOutputTokens', 'contextWindow',
  'editTools', 'thinking', 'streaming', 'zeroDataRetentionEnabled', 'supportsReasoningEffort', 'reasoningEffortFormat', 'modelOptions', 'requestHeaders']);

test('VS Code: customendpoint provider, input-variable key, documented model keys', () => {
  const { config, filename } = convert({ raws, provider, target: 'vscode' });
  assert.equal(filename, 'chatLanguageModels.json');
  assert.equal(config.length, 1);
  const [p] = config;
  assert.equal(p.vendor, 'customendpoint');
  assert.equal(p.name, 'NSCloud');
  assert.equal(p.apiKey, '${input:nscloudApiKey}');
  assert.equal(p.apiType, 'chat-completions');
  for (const m of p.models) {
    for (const k of Object.keys(m)) assert.ok(VSCODE_MODEL_KEYS.has(k), `${m.id}: unexpected key ${k}`);
    assert.equal(m.url, 'https://aillm.nscloud.ai/v1/chat/completions');
    assert.ok(m.maxInputTokens > 0 && m.maxOutputTokens > 0, `${m.id}: limits`);
  }
  // only enabled chat models
  assert.ok(!p.models.some((m) => m.id === 'gpt-image-2'));
});

test('VS Code: context window is split into input + output, output capped at half', () => {
  const { config, models } = convert({ raws, provider, target: 'vscode' });
  for (const m of config[0].models) {
    const n = models.find((x) => x.id === m.id);
    assert.equal(m.maxInputTokens + m.maxOutputTokens, n.limits.context, m.id);
    assert.equal(m.maxOutputTokens, Math.min(n.limits.output, Math.floor(n.limits.context / 2)), m.id);
  }
});

test('VS Code: disabled models are omitted, api key modes', () => {
  const ids = convert({ raws, provider, target: 'vscode', overrides: { 'gpt-5': { disabled: true } } }).config[0].models.map((m) => m.id);
  assert.ok(!ids.includes('gpt-5'));
  assert.equal(convert({ raws, provider: { ...provider, apiKeyMode: 'inline' }, target: 'vscode' }).config[0].apiKey, 'sk-test');
  assert.equal('apiKey' in convert({ raws, provider: { ...provider, apiKeyMode: 'none' }, target: 'vscode' }).config[0], false);
  assert.equal(inputVarFor('my-provider_2'), '${input:myProvider2ApiKey}');
});

test('VS Code: reasoning effort only for effort-style variants', () => {
  const models = convert({ raws, provider, target: 'vscode' }).config[0].models;
  const gpt = models.find((m) => m.id === 'gpt-5');
  assert.equal(gpt.thinking, true);
  assert.deepEqual(gpt.supportsReasoningEffort, ['minimal', 'low', 'medium', 'high']);
  assert.equal(gpt.reasoningEffortFormat, 'chat-completions');
  const glm = models.find((m) => m.id === 'glm-4.6v');
  assert.equal(glm.thinking, true);
  assert.equal(glm.supportsReasoningEffort, undefined, 'thinking.type toggles have no VS Code equivalent');

  const unified = convert({ raws, provider, target: 'vscode', variantStyle: 'effort' }).config[0].models.find((m) => m.id === 'glm-4.6v');
  assert.deepEqual(unified.supportsReasoningEffort, ['low', 'medium', 'high']);
});

test('deriveProvider from host', () => {
  assert.deepEqual(deriveProvider('https://api.qnaigc.com/v1'), { id: 'qnaigc', name: 'Qnaigc' });
  assert.equal(deriveProvider('https://aillm.nscloud.ai/v1').id, 'nscloud');
  assert.equal(deriveProvider('http://localhost:11434/v1').id, 'local');
  assert.equal(deriveProvider('http://192.168.8.88:8788/v1').id, 'local');
  assert.equal(deriveProvider('http://8.8.8.8/v1').id, 'custom');
});
