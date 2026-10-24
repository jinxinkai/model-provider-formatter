/**
 * @file 转换管道：输入 → ingest → enrich → 适配器。Web 前端、Koa 服务端与 CLI 共用。
 */

import { ingest, parseText, toBaseURL } from './ingest.js';
import { enrichAll } from './enrich.js';
import { toOpenCode } from './adapters/opencode.js';
import { toCherryStudio, cherryDeepLinks } from './adapters/cherry.js';
import { toVSCode } from './adapters/vscode.js';
import { AppError } from './i18n.js';

/**
 * @typedef {object} Provider 输出配置中的提供商信息
 * @property {string} id
 * @property {string} [name]
 * @property {string} baseURL
 * @property {string} [apiKey]
 * @property {'env'|'inline'|'none'} [apiKeyMode] 配置中 apiKey 的写法，默认 env
 */

export const TARGETS = {
  opencode: { label: 'OpenCode', filename: 'opencode.json', build: toOpenCode },
  cherry: { label: 'Cherry Studio', filename: 'cherry-studio-provider.json', build: toCherryStudio },
  vscode: { label: 'VS Code Copilot', filename: 'chatLanguageModels.json', build: toVSCode },
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
    if (/^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1)/.test(host)) return { id: 'local', name: 'Local' };
    // 其余 IP 字面量没有可用的域名标签
    if (/^[\d.]+$|^\[/.test(host)) return { id: 'custom', name: 'Custom' };
    const labels = host.split('.').filter((l) => !GENERIC_LABELS.includes(l));
    const id = (labels.at(-2) || labels[0] || 'custom').toLowerCase();
    return { id, name: id[0].toUpperCase() + id.slice(1) };
  } catch {
    return { id: 'custom', name: 'Custom' };
  }
}

/** @param {string} text JSON / YAML / OpenAPI */
export async function ingestText(text) {
  return ingest(await parseText(text));
}

/**
 * @param {object} args
 * @param {import('./ingest.js').RawModel[]} args.raws
 * @param {Provider} args.provider
 * @param {keyof TARGETS} [args.target]
 * @param {Record<string, import('./enrich.js').Override>} [args.overrides]
 * @param {'auto'|'effort'|'off'} [args.variantStyle]
 * @param {import('./enrich.js').Api[]} [args.apis] 上游支持的接口，默认只有 chat
 * @returns {{ models: import('./enrich.js').NormalizedModel[], config: object, filename: string, deepLinks?: import('./adapters/cherry.js').DeepLink[] }}
 */
export function convert({ raws, provider, target = 'opencode', overrides, variantStyle, apis }) {
  const t = TARGETS[target];
  if (!t) throw new AppError('convert.unknownTarget', { target });
  const models = enrichAll(raws, { overrides, variantStyle, apis });
  const p = { ...provider, baseURL: toBaseURL(provider.baseURL) };
  return {
    models,
    config: t.build(models, p),
    filename: t.filename,
    ...(target === 'cherry' && { deepLinks: cherryDeepLinks(models, p) }),
  };
}
