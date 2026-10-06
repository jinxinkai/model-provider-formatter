/**
 * @file 全局状态：输入与用户修改是状态，转换结果由 computed 派生。
 */

import { reactive, computed, watch } from 'vue';
import { ingest, toBaseURL } from '@core/ingest.js';
import { fetchModels } from '@core/fetch.js';
import { convert, deriveProvider, ingestText, TARGETS } from '@core/pipeline.js';
import { AppError } from '@core/i18n.js';
import { locale } from './i18n.js';

/**
 * @typedef {object} Status 状态栏内容；有 key 时按当前语言渲染，否则显示 text
 * @property {''|'ok'|'err'} kind
 * @property {string} [key]
 * @property {Record<string, unknown>} [params]
 * @property {string} [text]
 */

/** 纯静态部署（GitHub Pages，构建时 VITE_STATIC=true）：没有 Koa 代理，浏览器直连上游，需上游允许跨域 */
export const IS_STATIC = import.meta.env.VITE_STATIC === 'true';

export const state = reactive({
  /** @type {import('@core/ingest.js').RawModel[]} */
  raws: [],
  source: '',
  apiUrl: '',
  /** 只保存在内存中，不持久化 */
  apiKey: '',
  /** @type {import('@core/pipeline.js').Provider} */
  provider: { id: '', name: '', baseURL: '', apiKeyMode: 'env' },
  /** 用户手动改过的字段不再随 Base URL 自动推断 */
  touched: { id: false, name: false },
  /** @type {Record<string, import('@core/enrich.js').Override>} */
  overrides: {},
  variantStyle: 'auto',
  target: 'opencode',
  /** @type {Status} */
  status: { kind: '' },
  loading: false,
});

/** 转换结果；未加载模型时为 null */
export const result = computed(() =>
  state.raws.length
    ? convert({
      raws: state.raws,
      provider: { ...state.provider, apiKey: state.apiKey },
      target: state.target,
      overrides: state.overrides,
      variantStyle: state.variantStyle,
    })
    : null,
);

// ─── 设置持久化（不含 API Key） ───
const STORE_KEY = 'mpf:settings';
try {
  const s = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
  if (s.apiUrl) state.apiUrl = s.apiUrl;
  if (['env', 'inline', 'none'].includes(s.apiKeyMode)) state.provider.apiKeyMode = s.apiKeyMode;
  if (['auto', 'effort', 'off'].includes(s.variantStyle)) state.variantStyle = s.variantStyle;
  if (TARGETS[s.target]) state.target = s.target;
} catch {}
watch(
  () => ({ apiUrl: state.apiUrl, apiKeyMode: state.provider.apiKeyMode, variantStyle: state.variantStyle, target: state.target }),
  (s) => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(s));
    } catch {}
  },
);

/**
 * 设置状态栏。
 * @param {Status} status
 */
export function setStatus(status) {
  state.status = status;
}

/**
 * 以错误设置状态栏：AppError 按 key 渲染，其余显示原文。
 * @param {Error} err
 */
export function setError(err) {
  setStatus(err instanceof AppError ? { kind: 'err', key: err.key, params: err.params } : { kind: 'err', text: err.message });
}

/**
 * 更新 Base URL，并在用户未手动修改时推断 provider id 与名称。
 * @param {string} baseURL
 * @throws {AppError} 地址无效
 */
export function setProviderBase(baseURL) {
  if (!baseURL) return;
  state.provider.baseURL = toBaseURL(baseURL);
  const guess = deriveProvider(state.provider.baseURL);
  if (!state.touched.id) state.provider.id = guess.id;
  if (!state.touched.name) state.provider.name = guess.name;
}

/**
 * 载入新的模型列表并清空手动修改。
 * @param {{ models: import('@core/ingest.js').RawModel[], source: string, baseURL?: string }} input
 */
function loadModels({ models, source, baseURL }) {
  state.raws = models;
  state.source = source;
  state.overrides = {};
  if (baseURL) setProviderBase(baseURL);
  if (!state.provider.id) state.provider.id = 'custom';
  const chat = result.value.models.filter((m) => m.type === 'chat').length;
  setStatus({ kind: 'ok', key: 'status.loaded', params: { source, total: models.length, chat } });
}

/**
 * 拉取上游模型列表：静态部署时浏览器直连，否则经 Koa 代理（绕过 CORS）。
 * @param {string} url
 * @returns {Promise<{ baseURL: string, payload: unknown }>}
 */
async function requestModels(url) {
  if (IS_STATIC) return fetchModels(url, state.apiKey);
  const res = await fetch('api/models', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept-Language': locale.value },
    body: JSON.stringify({ url, apiKey: state.apiKey }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

/** 拉取并载入上游模型列表 */
export async function fetchFromApi() {
  const url = state.apiUrl.trim();
  if (!url) return setStatus({ kind: 'err', key: 'api.missingUrl' });
  state.loading = true;
  setStatus({ kind: '', key: 'status.fetching' });
  try {
    const { payload, baseURL } = await requestModels(url);
    loadModels({ ...ingest(payload), baseURL });
  } catch (err) {
    setError(err);
  } finally {
    state.loading = false;
  }
}

/**
 * 解析粘贴或上传的文本。
 * @param {string} text
 */
export async function loadText(text) {
  try {
    loadModels(await ingestText(text));
  } catch (err) {
    setError(err);
  }
}

/**
 * 合并某个模型的手动修改；值为 undefined 的字段会被移除（恢复推断结果）。
 * @param {string} id
 * @param {import('@core/enrich.js').Override} patch
 */
export function setOverride(id, patch) {
  const next = { ...state.overrides[id], ...patch };
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
  state.overrides[id] = next;
}

/**
 * 批量操作。
 * @param {'chat'|'all'|'reset'} mode chat 仅启用对话模型；all 全部启用；reset 清空所有手动修改
 */
export function bulk(mode) {
  if (mode === 'reset') {
    state.overrides = {};
    return;
  }
  for (const m of result.value.models) setOverride(m.id, { disabled: mode === 'chat' && m.type !== 'chat' });
}
