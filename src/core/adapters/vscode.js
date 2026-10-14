/**
 * @file VS Code Copilot 适配器：NormalizedModel[] → chatLanguageModels.json（Custom Endpoint 提供商）。
 * 规范见 https://code.visualstudio.com/docs/agent-customization/language-models#_add-a-custom-endpoint-model 。
 *
 * 文件是提供商数组，这里只生成一个 vendor: customendpoint 的条目。VS Code 没有禁用字段，
 * 因此只输出启用的对话模型；推理只支持 reasoning_effort，开关类方言（thinking.type 等）不映射。
 */

/**
 * 由 provider id 生成 VS Code 输入变量，例如 my-provider → ${input:myProviderApiKey}。
 * VS Code 首次请求时提示输入并存入 Secret Storage，配置文件中不出现明文。
 * @param {string} [id]
 * @returns {string}
 */
export const inputVarFor = (id) => {
  const camel = String(id || 'custom').toLowerCase().replace(/[^a-z0-9]+([a-z0-9])?/g, (_, c = '') => c.toUpperCase());
  return `\${input:${camel || 'custom'}ApiKey}`;
};

/**
 * 按写入方式生成 apiKey 的值。
 * @param {import('../pipeline.js').Provider} provider
 * @returns {string | undefined} undefined 表示不写入
 */
function apiKeyValue({ apiKeyMode, apiKey, id }) {
  if (apiKeyMode === 'inline') return apiKey || undefined;
  if (apiKeyMode === 'none') return undefined;
  return inputVarFor(id);
}

/**
 * 变体全部是 reasoningEffort 时返回可选档位，供 VS Code 的 Thinking Effort 选择器使用。
 * @param {Record<string, object>} variants
 * @returns {string[]}
 */
function effortLevels(variants) {
  const levels = Object.values(variants).map((v) => v.reasoningEffort);
  return levels.length && levels.every(Boolean) ? levels : [];
}

/**
 * 单个模型的 VS Code 配置。maxInputTokens + maxOutputTokens 即上下文窗口；
 * 上游常把输出上限报成与上下文相同，因此输出最多占一半，避免输入预算被挤没。
 * @param {import('../enrich.js').NormalizedModel} m
 * @param {string} url
 * @returns {object}
 */
function toModelEntry(m, url) {
  const efforts = effortLevels(m.variants);
  const { context } = m.limits;
  const output = Math.min(m.limits.output, Math.floor(context / 2));
  return {
    id: m.id,
    name: m.name,
    url,
    toolCalling: m.toolCall,
    vision: m.vision,
    maxInputTokens: context - output,
    maxOutputTokens: output,
    thinking: m.reasoning !== 'none',
    ...(efforts.length && { supportsReasoningEffort: efforts, reasoningEffortFormat: 'chat-completions' }),
  };
}

/**
 * @param {import('../enrich.js').NormalizedModel[]} models
 * @param {import('../pipeline.js').Provider} provider
 * @returns {object[]}
 */
export function toVSCode(models, provider) {
  // 写全 API 路径，避免 VS Code 自动补 /v1 时产生歧义
  const url = `${provider.baseURL}/chat/completions`;
  const apiKey = apiKeyValue(provider);
  return [
    {
      name: provider.name || provider.id,
      vendor: 'customendpoint',
      ...(apiKey && { apiKey }),
      apiType: 'chat-completions',
      models: models.filter((m) => m.type === 'chat' && !m.disabled).map((m) => toModelEntry(m, url)),
    },
  ];
}
