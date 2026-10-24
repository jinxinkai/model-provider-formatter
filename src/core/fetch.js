import { toBaseURL } from './ingest.js';
import { AppError } from './i18n.js';

const TIMEOUT_MS = 20000;
const PROBE_TIMEOUT_MS = 8000;

/** 待探测接口的路径；chat 默认支持，不探测 */
const PROBES = { responses: '/responses', messages: '/messages' };
/** 不存在的路径，作为对照 */
const CONTROL_PATH = '/mpf-probe-not-found';

/**
 * 拉取上游 `GET {baseURL}/models`。供 Koa 代理和 CLI 使用（浏览器直连会遇到 CORS）。
 * @param {string} url 用户输入的 API 地址
 * @param {string} [apiKey] 作为 Bearer Token 转发，不做存储
 * @returns {Promise<{ baseURL: string, payload: unknown }>}
 * @throws {AppError} 地址无效、网络错误、非 2xx 响应或响应不是 JSON
 */
export async function fetchModels(url, apiKey) {
  const baseURL = toBaseURL(url);
  const target = `${baseURL}/models`;
  const headers = { Accept: 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  let res;
  try {
    res = await fetch(target, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    throw new AppError('fetch.network', { url: target, reason: err.cause?.message || err.message });
  }
  const text = await res.text();
  if (!res.ok) throw new AppError('fetch.http', { url: target, status: res.status, body: text.slice(0, 300) });
  try {
    return { baseURL, payload: JSON.parse(text) };
  } catch {
    throw new AppError('fetch.notJson', { url: target, body: text.slice(0, 200) });
  }
}

/**
 * 探测上游支持哪些接口：不带 Key POST 空请求体。路由存在时网关返回 401 / 400 等，
 * 不存在时与对照路径一样返回 404。鉴权先于路由的网关对所有路径返回同一状态码，无法区分，按不支持处理。
 * 浏览器直连会被 CORS 拦截，只供 Koa 代理和 CLI 使用。
 * @param {string} baseURL 已规范化的 base URL
 * @returns {Promise<import('./enrich.js').Api[]>} 总是包含 chat
 */
export async function probeApis(baseURL) {
  const status = async (path) => {
    try {
      const res = await fetch(`${baseURL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      await res.body?.cancel();
      return res.status;
    } catch {
      return 0;
    }
  };
  const [control, ...found] = await Promise.all([CONTROL_PATH, ...Object.values(PROBES)].map(status));
  return ['chat', ...Object.keys(PROBES).filter((_, i) => found[i] && found[i] !== control && found[i] !== 404 && found[i] !== 405)];
}
