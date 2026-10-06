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
  ['deepseek/deepseek-v4-pro', 'chat', false, 'hybrid', ['thinking', 'no-thinking']],
  ['deepseek/deepseek-v4-flash-vision-exp', 'chat', true, 'hybrid', ['thinking', 'no-thinking']],
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
  ['z-ai/glm-5.3', 'chat', false, 'hybrid', ['thinking', 'no-thinking']],
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
