import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enrichModel, prettyName } from '../src/core/enrich.js';

const e = (id, raw = {}, override) => enrichModel({ id, ...raw }, override);

test('upstream values beat rules; rules fill the gaps; defaults last', () => {
  const up = e('glm-4.5', { context: 131072, output: 98304 });
  assert.equal(up.sources.context, 'upstream');
  const rule = e('glm-5.1');
  assert.deepEqual(rule.limits, { context: 200000, output: 131072 });
  assert.match(rule.sources.context, /^rule:glm/);
  const unknown = e('some-new-model');
  assert.deepEqual(unknown.limits, { context: 128000, output: 8192 });
  assert.equal(unknown.sources.context, 'default');
});

test('output larger than context is clamped with a note', () => {
  const m = e('meituan/longcat-flash-lite', { context: 256000, output: 320000 });
  assert.equal(m.limits.output, 256000);
  assert.equal(m.notes.length, 1);
});

// [id, type, vision, reasoning, variant names]
const CASES = [
  ['deepseek/deepseek-v4-pro', 'chat', false, 'hybrid', ['low', 'high', 'max']],
  ['deepseek/deepseek-v4-flash-vision-exp', 'chat', true, 'hybrid', ['low', 'high', 'max']],
  ['deepseek/deepseek-v3.2-exp-thinking', 'chat', false, 'always', []],
  ['deepseek-r1', 'chat', false, 'always', []],
  ['deepseek-v3', 'chat', false, 'none', []],
  ['qwen3-235b-a22b', 'chat', false, 'hybrid', ['thinking', 'no-thinking']],
  ['qwen3-235b-a22b-instruct-2507', 'chat', false, 'none', []],
  ['qwen3-vl-30b-a3b-thinking', 'chat', true, 'always', []],
  ['qwen2.5-vl-72b-instruct', 'chat', true, 'none', []],
  ['qwen/qwen3.6-plus', 'chat', true, 'hybrid', ['thinking', 'no-thinking']],
  ['qwen3-coder-480b-a35b-instruct', 'chat', false, 'none', []],
  ['glm-4.6v', 'chat', true, 'hybrid', ['thinking', 'no-thinking']],
  ['z-ai/glm-5.3', 'chat', false, 'always', ['low', 'high', 'max']],
  ['glm-5.3-flash', 'chat', true, 'always', ['low', 'high', 'max']],
  ['glm-5.2', 'chat', false, 'hybrid', ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']],
  ['kimi-k3', 'chat', true, 'always', ['low', 'high', 'max']],
  ['gpt-6-astra', 'chat', true, 'always', ['low', 'medium', 'high', 'xhigh', 'max']],
  ['gpt-6-sol', 'chat', true, 'hybrid', ['none', 'low', 'medium', 'high', 'xhigh', 'max']],
  ['gpt-5.6-terra', 'chat', true, 'hybrid', ['none', 'low', 'medium', 'high', 'xhigh', 'max']],
  ['gpt-5.5', 'chat', true, 'hybrid', ['none', 'low', 'medium', 'high', 'xhigh']],
  ['grok-4.7', 'chat', true, 'always', ['low', 'medium', 'high', 'xhigh']],
  ['gemini-3.8-flash', 'chat', true, 'always', ['low', 'medium', 'high']],
  ['step-5-preview', 'chat', false, 'always', ['low', 'medium', 'high']],
  ['moonshotai/kimi-k2-thinking', 'chat', false, 'always', []],
  ['kimi-k2', 'chat', false, 'none', []],
  ['moonshotai/kimi-k2.6', 'chat', true, 'hybrid', ['thinking', 'no-thinking']],
  ['MiniMax-M2.7', 'chat', false, 'always', []],
  ['doubao-seed-1.6', 'chat', true, 'hybrid', ['thinking', 'no-thinking', 'auto']],
  ['doubao-1.5-thinking-pro', 'chat', false, 'always', []],
  ['doubao-1.5-vision-pro', 'chat', true, 'none', []],
  ['gpt-5', 'chat', true, 'always', ['minimal', 'low', 'medium', 'high']],
  ['gpt-5.2', 'chat', true, 'hybrid', ['none', 'low', 'medium', 'high', 'xhigh']],
  ['o3-mini', 'chat', true, 'always', ['low', 'medium', 'high']],
  ['gpt-4o', 'chat', true, 'none', []],
  ['claude-sonnet-4.5', 'chat', true, 'hybrid', ['low', 'medium', 'high']],
  ['gemini-3.1-pro-preview', 'chat', true, 'hybrid', ['low', 'high']],
  ['grok-code-fast-1', 'chat', false, 'always', []],
  ['text-embedding-v4', 'embedding', false, 'none', []],
  ['bge-reranker-v2-m3', 'rerank', false, 'none', []],
  ['qwen3-asr-flash', 'audio', false, 'none', []],
  ['qwen-image-2.0-pro', 'image', false, 'none', []],
  ['doubao-seedream-5-0-260128', 'image', false, 'none', []],
  ['cogview-4-250304', 'image', false, 'none', []],
  ['gpt-image-2', 'image', false, 'none', []],
];

for (const [id, type, vision, reasoning, variants] of CASES) {
  test(`capabilities: ${id}`, () => {
    const m = e(id);
    assert.equal(m.type, type, 'type');
    assert.equal(m.vision, vision, 'vision');
    assert.equal(m.reasoning, reasoning, 'reasoning');
    assert.deepEqual(Object.keys(m.variants), variants, 'variants');
    assert.equal(m.disabled, type !== 'chat', 'non-chat models disabled by default');
  });
}

test('variant payloads speak each vendor dialect', () => {
  assert.deepEqual(e('glm-5.1').variants['no-thinking'], { thinking: { type: 'disabled' } });
  assert.deepEqual(e('qwen3-32b').variants.thinking, { enable_thinking: true });
  assert.deepEqual(e('gpt-5.1').variants.high, { reasoningEffort: 'high' });
  assert.equal(e('deepseek/deepseek-v4-pro').interleaved, 'reasoning_content');
});

const ALL_APIS = ['chat', 'responses', 'messages'];
const withApis = (id, apis = ALL_APIS, override) => enrichModel({ id }, override, { apis });

test('api: GPT → Responses, Claude → Messages, others → Chat Completions', () => {
  assert.equal(withApis('gpt-5.5').api, 'responses');
  assert.equal(withApis('o3-mini').api, 'responses');
  assert.equal(withApis('claude-sonnet-4.6').api, 'messages');
  assert.equal(withApis('gpt-oss-120b').api, 'chat', 'open-weight models stay on Chat Completions');
  assert.equal(withApis('glm-5.1').api, 'chat');
  assert.equal(withApis('text-embedding-v4').api, 'chat', 'non-chat models never switch');
  assert.equal(e('gpt-5.5').api, 'chat', 'only chat is assumed by default');
});

test('api: unsupported preference falls back to chat; overrides need a supported api', () => {
  assert.equal(withApis('gpt-5.5', ['chat', 'messages']).api, 'chat');
  assert.equal(withApis('claude-opus-4.6', ['chat', 'messages']).api, 'messages');
  assert.equal(withApis('gpt-5.5', ALL_APIS, { api: 'chat' }).api, 'chat');
  assert.equal(withApis('glm-5.1', ALL_APIS, { api: 'messages' }).api, 'messages');
  assert.equal(withApis('glm-5.1', ['chat'], { api: 'messages' }).api, 'chat');
});

test('api: variants follow the SDK of the chosen api', () => {
  assert.deepEqual(withApis('gpt-5.1').variants.high, { reasoningEffort: 'high', reasoningSummary: 'auto', include: ['reasoning.encrypted_content'] });
  // Claude 4.6+ / 5.x: adaptive thinking + effort
  const adaptive = { thinking: { type: 'adaptive', display: 'summarized' }, effort: 'high' };
  assert.deepEqual(withApis('claude-opus-4.6').variants.high, adaptive);
  assert.deepEqual(withApis('claude-fable-5').variants.high, adaptive);
  // Opus 4.5: manual budget + effort
  assert.deepEqual(withApis('claude-opus-4.5').variants.low, { thinking: { type: 'enabled', budgetTokens: 16000 }, effort: 'low' });
  // earlier Claude: budget-only variants; dated ids are not mistaken for versions
  for (const id of ['claude-sonnet-4.5', 'claude-haiku-4-5-20251001', 'claude-3-7-sonnet-20250219', 'claude-opus-4-20250514']) {
    assert.deepEqual(Object.keys(withApis(id).variants), ['high', 'max'], id);
  }
  assert.deepEqual(withApis('claude-sonnet-4.5').variants.max, { thinking: { type: 'enabled', budgetTokens: 31999 } });
  // effort style keeps the api dialect
  assert.deepEqual(enrichModel({ id: 'gpt-5' }, {}, { apis: ALL_APIS, variantStyle: 'effort' }).variants.low, {
    reasoningEffort: 'low', reasoningSummary: 'auto', include: ['reasoning.encrypted_content'],
  });
  // toggle dialects have no Messages equivalent
  assert.deepEqual(withApis('glm-5.1', ALL_APIS, { api: 'messages' }).variants, {});
  // interleaved reasoning_content is a Chat Completions field
  assert.equal(withApis('deepseek/deepseek-v4-pro', ALL_APIS, { api: 'messages' }).interleaved, null);
});

test('variantStyle effort / off', () => {
  const effort = enrichModel({ id: 'glm-5.1' }, {}, { variantStyle: 'effort' });
  assert.deepEqual(Object.keys(effort.variants), ['low', 'medium', 'high']);
  assert.deepEqual(enrichModel({ id: 'gpt-5' }, {}, { variantStyle: 'off' }).variants, {});
});

test('user overrides win over everything', () => {
  const m = e('glm-4.5', { context: 131072 }, { context: 64000, vision: true, reasoning: 'none', name: 'X', disabled: true });
  assert.equal(m.limits.context, 64000);
  assert.equal(m.sources.context, 'override');
  assert.equal(m.vision, true);
  assert.deepEqual(m.variants, {});
  assert.equal(m.name, 'X');
  assert.equal(m.disabled, true);
});

test('upstream reasoning efforts beat inferred rule dialects', () => {
  // gateway-declared efforts replace the thinking-type toggle of an inferred (doc-less) rule
  const glm = e('glm-5.1', { reasoning: true, reasoningMode: 'hybrid', efforts: ['low', 'high', 'max'] });
  assert.equal(glm.reasoning, 'hybrid');
  assert.deepEqual(glm.variants, { low: { reasoningEffort: 'low' }, high: { reasoningEffort: 'high' }, max: { reasoningEffort: 'max' } });
  // fixed effort → no variants, even where the rule would generate toggles
  const kimi = e('kimi-k2.5', { reasoning: true, reasoningMode: 'always', efforts: [] });
  assert.equal(kimi.reasoning, 'always');
  assert.deepEqual(kimi.variants, {});
});

test('official-doc rules beat upstream values', () => {
  // the gateway reports a truncated output, a fixed effort and no reasoning toggle for DeepSeek V4
  const ds = e('deepseek-v4.1-flash', { context: 1000000, output: 128000, vision: false, reasoning: true, reasoningMode: 'always', efforts: ['high'] });
  assert.deepEqual(ds.limits, { context: 1048576, output: 393216 });
  assert.equal(ds.vision, true);
  assert.equal(ds.reasoning, 'hybrid');
  assert.deepEqual(Object.keys(ds.variants), ['low', 'high', 'max']);
  assert.equal(ds.sources.context, 'doc:deepseek:v4');
  assert.equal(ds.sources.vision, 'doc:deepseek:v4-flash');
  // upstream still fills fields the doc rule leaves open (Grok 4.7 has no documented output cap)
  const grok = e('grok-4.7', { context: 200000, output: 128000 });
  assert.equal(grok.limits.context, 500000);
  assert.equal(grok.sources.output, 'upstream');
  // manual overrides still win
  assert.equal(e('glm-5.3', {}, { context: 200000 }).limits.context, 200000);
});

test('upstream booleans override rules', () => {
  assert.equal(e('kimi-k2', { vision: true }).vision, true);
  assert.equal(e('glm-5.1', { reasoning: false }).reasoning, 'none');
  assert.equal(e('glm-5.1', { reasoning: true }).reasoning, 'hybrid', 'keeps the finer-grained rule mode');
});

test('prettyName', () => {
  assert.equal(prettyName('qwen3-235b-a22b-instruct-2507'), 'Qwen3 235B A22B Instruct 2507');
  assert.equal(prettyName('claude-haiku-4-5-20251001'), 'Claude Haiku 4.5 20251001');
  assert.equal(prettyName('deepseek/deepseek-v3.1-terminus'), 'DeepSeek V3.1 Terminus');
  assert.equal(prettyName('qwen-max-2025-01-25'), 'Qwen Max 2025-01-25');
  assert.equal(prettyName('MiniMax-M2.7'), 'MiniMax M2.7');
});
