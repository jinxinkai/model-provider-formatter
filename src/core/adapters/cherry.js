/**
 * @file Cherry Studio 适配器：NormalizedModel[] → 提供商导入包 + DeepLink。
 *
 * DeepLink（cherrystudio://providers/api-keys?v=1&data=<base64(JSON)>）只能携带提供商连接信息且必须带 apiKey，
 * 见 CherryHQ/cherry-studio providersImport.ts；模型能力标签放在导入包中供对照。
 */

/** family → Cherry Studio 分组名 */
const FAMILY_LABEL = {
  openai: 'OpenAI', anthropic: 'Claude', google: 'Gemini', deepseek: 'DeepSeek', qwen: 'Qwen', zhipu: 'GLM',
  moonshot: 'Kimi', minimax: 'MiniMax', doubao: 'Doubao', xai: 'Grok', meituan: 'LongCat', tencent: 'Hunyuan',
  stepfun: 'StepFun', xiaomi: 'MiMo', baidu: 'ERNIE', mistral: 'Mistral', meta: 'Llama', other: 'Other',
};

/**
 * 映射为 Cherry Studio 的 ModelType 列表。
 * @param {import('../enrich.js').NormalizedModel} m
 * @returns {string[]} 'text' | 'vision' | 'reasoning' | 'function_calling' | 'embedding' | 'rerank'
 */
function cherryTypes(m) {
  if (m.type === 'embedding' || m.type === 'rerank') return [m.type];
  if (m.type !== 'chat') return [];
  return ['text', m.vision && 'vision', m.reasoning !== 'none' && 'reasoning', m.toolCall && 'function_calling'].filter(Boolean);
}

/**
 * 末尾带 "/" 时 Cherry Studio 原样使用地址，不再自动追加 /v1/。
 * @param {string} baseURL
 */
const cherryHost = (baseURL) => (baseURL.endsWith('/') ? baseURL : `${baseURL}/`);

/**
 * UTF-8 安全的 base64 编码（浏览器与 Node 通用）。
 * @param {string} str
 */
const base64 = (str) => btoa(String.fromCharCode(...new TextEncoder().encode(str)));

/**
 * 生成一键导入提供商的 DeepLink。
 * @param {import('../pipeline.js').Provider} provider
 * @returns {string}
 */
export function cherryDeepLink(provider) {
  const data = {
    id: provider.id,
    baseUrl: cherryHost(provider.baseURL),
    apiKey: provider.apiKey || '',
    name: provider.name || provider.id,
    type: 'openai',
  };
  return `cherrystudio://providers/api-keys?v=1&data=${encodeURIComponent(base64(JSON.stringify(data)))}`;
}

/**
 * 生成 Cherry Studio 提供商导入包（仅包含启用的模型）。
 * @param {import('../enrich.js').NormalizedModel[]} models
 * @param {import('../pipeline.js').Provider} provider
 * @returns {object}
 */
export function toCherryStudio(models, provider) {
  return {
    provider: {
      id: provider.id,
      type: 'openai',
      name: provider.name || provider.id,
      apiKey: provider.apiKeyMode === 'inline' ? provider.apiKey || '' : '',
      apiHost: cherryHost(provider.baseURL),
      enabled: true,
      isSystem: false,
      models: models.filter((m) => !m.disabled).map((m) => {
        const type = cherryTypes(m);
        return {
          id: m.id,
          provider: provider.id,
          name: m.name,
          group: FAMILY_LABEL[m.family] || m.family,
          type,
          capabilities: type.map((t) => ({ type: t, isUserSelected: true })),
        };
      }),
    },
  };
}
