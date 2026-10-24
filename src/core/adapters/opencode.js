/**
 * @file OpenCode 适配器：NormalizedModel[] → opencode.json。
 * 规范见 https://opencode.ai/docs/providers/ ，Schema 见 https://opencode.ai/config.json 。
 *
 * OpenCode 模型 schema 为 additionalProperties: false 且没有 disabled 字段，
 * 因此禁用的对话模型保留在 models 中并写入 provider 级 blacklist；禁用的非对话模型直接省略。
 * provider 用 @ai-sdk/openai-compatible（Chat Completions），走其他接口的模型用 provider.npm 单独指定 SDK。
 */

/** 非 Chat Completions 接口对应的 AI SDK 包；两者都在 options.baseURL 后追加 /responses、/messages */
const API_NPM = { responses: '@ai-sdk/openai', messages: '@ai-sdk/anthropic' };

/**
 * 由 provider id 生成环境变量名，例如 qnaigc → QNAIGC_API_KEY。
 * @param {string} [id]
 * @returns {string}
 */
export const envVarFor = (id) => `${String(id || 'custom').replace(/[^a-z0-9]+/gi, '_').toUpperCase()}_API_KEY`;

/**
 * 按写入方式生成 options.apiKey 的值。
 * @param {import('../pipeline.js').Provider} provider
 * @returns {string | undefined} undefined 表示不写入
 */
function apiKeyValue({ apiKeyMode, apiKey, id }) {
  if (apiKeyMode === 'inline') return apiKey || undefined;
  if (apiKeyMode === 'none') return undefined;
  return `{env:${envVarFor(id)}}`;
}

/** @param {import('../enrich.js').NormalizedModel} m */
function toModelEntry(m) {
  const entry = { name: m.name };
  if (m.type === 'chat') {
    entry.attachment = m.vision;
    entry.reasoning = m.reasoning !== 'none';
    entry.tool_call = m.toolCall;
    if (m.interleaved) entry.interleaved = { field: m.interleaved };
    entry.modalities = { input: m.vision ? ['text', 'image'] : ['text'], output: ['text'] };
  }
  entry.limit = { context: m.limits.context, output: m.limits.output };
  if (API_NPM[m.api]) entry.provider = { npm: API_NPM[m.api] };
  // store 是 OpenAI 参数，Anthropic SDK 没有
  if (m.api !== 'messages') entry.options = { store: false };
  if (Object.keys(m.variants).length) entry.variants = m.variants;
  return entry;
}

/**
 * @param {import('../enrich.js').NormalizedModel[]} models
 * @param {import('../pipeline.js').Provider} provider
 * @returns {object}
 */
export function toOpenCode(models, provider) {
  const entries = {};
  const blacklist = [];
  for (const m of models) {
    if (m.disabled && m.type !== 'chat') continue;
    entries[m.id] = toModelEntry(m);
    if (m.disabled) blacklist.push(m.id);
  }

  const apiKey = apiKeyValue(provider);
  return {
    $schema: 'https://opencode.ai/config.json',
    provider: {
      [provider.id]: {
        npm: '@ai-sdk/openai-compatible',
        name: provider.name || provider.id,
        options: { baseURL: provider.baseURL, ...(apiKey && { apiKey }) },
        models: entries,
        ...(blacklist.length && { blacklist }),
      },
    },
  };
}
