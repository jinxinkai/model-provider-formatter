/**
 * @file 转换管道：输入 → ingest → enrich → 适配器。Web 前端、Koa 服务端与 CLI 共用。
 */

import { ingest, parseText, toBaseURL } from './ingest.js';
import { enrichAll } from './enrich.js';
import { toOpenCode } from './adapters/opencode.js';
import { toCherryStudio, cherryDeepLink } from './adapters/cherry.js';
import { AppError } from './i18n.js';

/**
 * @typedef {object} Provider 输出配置中的提供商信息
 * @property {string} id
 * @property {string} [name]
 * @property {string} baseURL
 * @property {string} [apiKey]
 * @property {'env'|'inline'|'none'} [apiKeyMode] 配置中 apiKey 的写法，默认 env
 */

/** 支持的目标客户端 */
export const TARGETS = {
  opencode: { label: 'OpenCode', filename: 'opencode.json', build: toOpenCode },
  cherry: { label: 'Cherry Studio', filename: 'cherry-studio-provider.json', build: toCherryStudio },
};

/** 推断 provider id 时忽略的通用子域名 */
const GENERIC_LABELS = ['api', 'www', 'openai', 'llm', 'ai-api'];

/**
 * 由 base URL 推断提供商 id 与名称，例如 https://api.qnaigc.com/v1 → { id: 'qnaigc', name: 'Qnaigc' }。
 * @param {string} baseURL
 * @returns {{ id: string, name: string }}
 */
export function deriveProvider(baseURL) {
  try {
    const host = new URL(baseURL).hostname;
    if (/^(localhost|127\.|0\.0\.0\.0|\[?::1)/.test(host)) return { id: 'local', name: 'Local' };
    const labels = host.split('.').filter((l) => !GENERIC_LABELS.includes(l));
    const id = (labels.at(-2) || labels[0] || 'custom').toLowerCase();
    return { id, name: id[0].toUpperCase() + id.slice(1) };
  } catch {
    return { id: 'custom', name: 'Custom' };
  }
}

/**
 * 解析文本（JSON / YAML / OpenAPI）并转换为 RawModel 列表。
 * @param {string} text
 */
export async function ingestText(text) {
  return ingest(await parseText(text));
}

/**
 * 执行完整转换。
 * @param {object} args
 * @param {import('./ingest.js').RawModel[]} args.raws
 * @param {Provider} args.provider
 * @param {keyof TARGETS} [args.target]
 * @param {Record<string, import('./enrich.js').Override>} [args.overrides]
 * @param {'auto'|'effort'|'off'} [args.variantStyle]
 * @returns {{ models: import('./enrich.js').NormalizedModel[], config: object, filename: string, deepLink?: string }}
 */
export function convert({ raws, provider, target = 'opencode', overrides, variantStyle }) {
  const t = TARGETS[target];
  if (!t) throw new AppError('convert.unknownTarget', { target });
  const models = enrichAll(raws, { overrides, variantStyle });
  const p = { ...provider, baseURL: toBaseURL(provider.baseURL) };
  return {
    models,
    config: t.build(models, p),
    filename: t.filename,
    ...(target === 'cherry' && { deepLink: cherryDeepLink(p) }),
  };
}
