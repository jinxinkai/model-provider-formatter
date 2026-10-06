import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ingest, parseText, toBaseURL, normalizeEntry } from '../src/core/ingest.js';

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('OpenAI /v1/models with context_length / max_tokens (0 treated as missing)', async () => {
  const { models, source } = ingest(await parseText(fixture('qnaigc-models.json')));
  assert.equal(source, '/v1/models');
  assert.equal(models.length, 81);
  const glm = models.find((m) => m.id === 'glm-4.5');
  assert.deepEqual([glm.context, glm.output], [131072, 98304]);
  const q = models.find((m) => m.id === 'qwen3-30b-a3b');
  assert.equal(q.context, 40000);
  assert.equal(q.output, undefined, 'max_tokens: 0 must be treated as unknown');
  assert.equal(models.find((m) => m.id === 'z-ai/glm-4.5-air-free').context, undefined);
});

test('LiteLLM-style max_input_tokens / max_output_tokens / mode', async () => {
  const { models } = ingest(await parseText(fixture('nscloud-models.json')));
  const gpt = models.find((m) => m.id === 'gpt-5.6-sol');
  assert.deepEqual([gpt.context, gpt.output, gpt.type], [922000, 128000, 'chat']);
  assert.equal(models.find((m) => m.id === 'claude-opus-4.6').context, undefined);
});

test('OpenRouter-style entries', () => {
  const m = normalizeEntry({
    id: 'deepseek/deepseek-v4-pro',
    name: 'DeepSeek: V4 Pro',
    context_length: 1000000,
    top_provider: { max_completion_tokens: 384000 },
    architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
    supported_parameters: ['tools', 'reasoning'],
  });
  assert.deepEqual(m, {
    id: 'deepseek/deepseek-v4-pro', name: 'DeepSeek: V4 Pro', context: 1000000, output: 384000,
    vision: true, reasoning: true, toolCall: true,
  });
});

test('bare arrays, { models: [] } and string lists', () => {
  assert.equal(ingest(['a', 'b', 'a']).models.length, 2);
  assert.equal(ingest({ models: [{ name: 'llama3:8b', model: 'llama3:8b' }] }).models[0].id, 'llama3:8b');
  assert.throws(() => ingest({ foo: 1 }), /无法识别/);
  assert.throws(() => ingest({ error: { message: 'unauthorized' } }), /无法识别/, '错误响应不能被当成模型');
});

test('OpenAPI YAML: model enums, examples, embedded /models examples, servers', async () => {
  const yaml = `
openapi: 3.0.3
info: { title: Gateway, version: '1' }
servers: [{ url: https://gw.example.com/v1 }]
paths:
  /chat/completions:
    post:
      requestBody:
        content:
          application/json:
            schema:
              properties:
                model:
                  anyOf:
                    - type: string
                    - type: string
                      enum: [glm-5.1, qwen3.6-plus]
                  example: kimi-k2.6
  /models:
    get:
      responses:
        '200':
          content:
            application/json:
              example:
                object: list
                data:
                  - { id: deepseek-v4-pro, object: model, context_length: 1000000 }
`;
  const res = ingest(await parseText(yaml));
  assert.equal(res.baseURL, 'https://gw.example.com/v1');
  assert.match(res.source, /OpenAPI/);
  assert.deepEqual(res.models.map((m) => m.id).sort(), ['deepseek-v4-pro', 'glm-5.1', 'kimi-k2.6', 'qwen3.6-plus']);
  assert.equal(res.models.find((m) => m.id === 'deepseek-v4-pro').context, 1000000);
});

test('toBaseURL accepts hosts, base URLs and /models URLs', () => {
  assert.equal(toBaseURL('api.qnaigc.com'), 'https://api.qnaigc.com/v1');
  assert.equal(toBaseURL('https://api.qnaigc.com/v1/models'), 'https://api.qnaigc.com/v1');
  assert.equal(toBaseURL('https://ark.cn-beijing.volces.com/api/v3/'), 'https://ark.cn-beijing.volces.com/api/v3');
  assert.equal(toBaseURL('http://localhost:11434/v1'), 'http://localhost:11434/v1');
});

test('errors are AppErrors that render in either locale', async () => {
  const { localize } = await import('../src/core/i18n.js');
  try {
    ingest({ foo: 1 });
    assert.fail('should throw');
  } catch (err) {
    assert.equal(err.key, 'input.unknownFormat');
    assert.match(localize(err, 'en'), /^Unrecognized input/);
    assert.match(localize(err, 'zh'), /^无法识别/);
  }
});
