import { toBaseURL } from './ingest.js';
import { AppError } from './i18n.js';

/** 上游请求超时（毫秒） */
const TIMEOUT_MS = 20000;

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
