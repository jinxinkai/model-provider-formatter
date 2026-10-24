/**
 * @file Cherry Studio 适配器：NormalizedModel[] → 提供商导入包 + DeepLink。
 *
 * DeepLink（cherrystudio://providers/api-keys?v=1&data=<base64(JSON)>）只能携带提供商连接信息且必须带 apiKey，
 * 见 CherryHQ/cherry-studio providersImport.ts；模型能力标签放在导入包中供对照。
 *
 * DeepLink 的 type 决定提供商唯一的接口（useProviderDeepLinkImport.ts），同一 id 再次导入会覆盖接口配置，
 * 因此模型用到几种接口就拆成几个提供商，id 加后缀区分。
 */

import { APIS } from '../enrich.js';

/** 接口 → Cherry Studio 提供商类型（同时是模型的 endpoint_type）与 id / 名称后缀 */
const API_PROVIDER = {
  chat: { type: 'openai', suffix: '', label: '' },
  responses: { type: 'openai-response', suffix: '-responses', label: ' (Responses)' },
  messages: { type: 'anthropic', suffix: '-anthropic', label: ' (Anthropic)' },
};

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
 * @typedef {object} DeepLink
 * @property {import('../enrich.js').Api} api
 * @property {string} id
 * @property {string} name
 * @property {string} link
 */

/**
 * 按接口把启用的模型分组；没有启用的模型时仍保留 Chat Completions 提供商。
 * @param {import('../enrich.js').NormalizedModel[]} models
 * @param {import('../pipeline.js').Provider} provider
 * @returns {Array<{ api: import('../enrich.js').Api, id: string, name: string, type: string, models: import('../enrich.js').NormalizedModel[] }>}
 */
function groupByApi(models, provider) {
  const enabled = models.filter((m) => !m.disabled);
  const apis = APIS.filter((api) => enabled.some((m) => m.api === api));
  return (apis.length ? apis : ['chat']).map((api) => {
    const { type, suffix, label } = API_PROVIDER[api];
    return { api, id: provider.id + suffix, name: (provider.name || provider.id) + label, type, models: enabled.filter((m) => m.api === api) };
  });
}

/**
 * 每个接口一条 DeepLink。
 * @param {import('../enrich.js').NormalizedModel[]} models
 * @param {import('../pipeline.js').Provider} provider
 * @returns {DeepLink[]}
 */
export function cherryDeepLinks(models, provider) {
  return groupByApi(models, provider).map(({ api, id, name, type }) => {
    const data = { id, baseUrl: cherryHost(provider.baseURL), apiKey: provider.apiKey || '', name, type };
    return { api, id, name, link: `cherrystudio://providers/api-keys?v=1&data=${encodeURIComponent(base64(JSON.stringify(data)))}` };
  });
}

/**
 * 导入包只包含启用的模型。
 * @param {import('../enrich.js').NormalizedModel[]} models
 * @param {import('../pipeline.js').Provider} provider
 * @returns {object}
 */
export function toCherryStudio(models, provider) {
  return {
    providers: groupByApi(models, provider).map((g) => ({
      id: g.id,
      type: g.type,
      name: g.name,
      apiKey: provider.apiKeyMode === 'inline' ? provider.apiKey || '' : '',
      apiHost: cherryHost(provider.baseURL),
      enabled: true,
      isSystem: false,
      models: g.models.map((m) => {
        const type = cherryTypes(m);
        return {
          id: m.id,
          provider: g.id,
          name: m.name,
          group: FAMILY_LABEL[m.family] || m.family,
          type,
          capabilities: type.map((t) => ({ type: t, isUserSelected: true })),
          endpoint_type: g.type,
        };
      }),
    })),
  };
}
