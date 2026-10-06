/**
 * @file 核心层的中英文文案与翻译工具。前端与 CLI 各自维护界面文案，共用这里的 fill / t。
 */

/** @typedef {'zh'|'en'} Locale */

/** 核心层文案：错误信息与补全提示 */
const MESSAGES = {
  zh: {
    'input.empty': '输入为空',
    'input.badJson': 'JSON 解析失败：{reason}',
    'input.badText': '既不是合法 JSON 也不是合法 YAML：{reason}',
    'input.badUrl': 'API 地址无效：{url}',
    'input.unknownFormat': '无法识别的输入格式：需要 /v1/models 响应、模型数组或 OpenAPI 文档',
    'input.noModels': '列表中没有可识别的模型条目',
    'input.noOpenapiModels': 'OpenAPI 文档中未找到任何模型 ID（查找了 model 字段的 enum/example 和 /models 响应示例）',
    'fetch.network': '请求 {url} 失败：{reason}',
    'fetch.http': '{url} 返回 HTTP {status}：{body}',
    'fetch.notJson': '{url} 返回的不是 JSON：{body}',
    'api.missingUrl': '缺少 API 地址',
    'api.internal': '服务器内部错误',
    'convert.unknownTarget': '未知目标客户端：{target}',
    'note.clamped': '输出上限 {output} 大于上下文 {context}，已截断为 {context}',
    'note.nonChat': '非对话模型（{type}），默认禁用',
  },
  en: {
    'input.empty': 'Input is empty',
    'input.badJson': 'Invalid JSON: {reason}',
    'input.badText': 'Neither valid JSON nor valid YAML: {reason}',
    'input.badUrl': 'Invalid API URL: {url}',
    'input.unknownFormat': 'Unrecognized input: expected a /v1/models response, a model array or an OpenAPI document',
    'input.noModels': 'No recognizable model entries in the list',
    'input.noOpenapiModels': 'No model IDs found in the OpenAPI document (searched `model` enum/example and /models response examples)',
    'fetch.network': 'Request to {url} failed: {reason}',
    'fetch.http': '{url} returned HTTP {status}: {body}',
    'fetch.notJson': '{url} did not return JSON: {body}',
    'api.missingUrl': 'API URL is required',
    'api.internal': 'Internal server error',
    'convert.unknownTarget': 'Unknown target client: {target}',
    'note.clamped': 'Max output {output} exceeds context {context}; clamped to {context}',
    'note.nonChat': 'Non-chat model ({type}), disabled by default',
  },
};

/**
 * 用参数替换模板中的 {name} 占位符。
 * @param {string} template
 * @param {Record<string, unknown>} [params]
 * @returns {string}
 */
export const fill = (template, params = {}) => template.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? ''));

/**
 * 翻译核心层文案；未知语言回退到中文，未知 key 原样返回。
 * @param {Locale} locale
 * @param {string} key
 * @param {Record<string, unknown>} [params]
 * @returns {string}
 */
export const t = (locale, key, params) => fill(MESSAGES[locale]?.[key] ?? MESSAGES.zh[key] ?? key, params);

/** 可翻译的错误：message 为中文，调用方可用 localize 按语言重新渲染 */
export class AppError extends Error {
  /**
   * @param {string} key 文案 key
   * @param {Record<string, unknown>} [params]
   */
  constructor(key, params) {
    super(t('zh', key, params));
    this.key = key;
    this.params = params;
  }
}

/**
 * 按语言渲染错误信息；非 AppError 返回原始 message。
 * @param {Error} err
 * @param {Locale} locale
 * @returns {string}
 */
export const localize = (err, locale) => (err instanceof AppError ? t(locale, err.key, err.params) : err.message);
