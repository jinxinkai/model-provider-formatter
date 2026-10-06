/**
 * @file 输入层：把各种上游格式统一解析为 RawModel 列表。
 * 支持 OpenAI /v1/models、裸数组、{ models: [] }、OpenRouter / LiteLLM 字段、OpenAPI 3 / Swagger 文档。
 */

import { AppError } from './i18n.js';

/**
 * @typedef {object} RawModel 上游提供的原始模型信息（缺失字段不出现）
 * @property {string} id
 * @property {string} [name] 上游显示名
 * @property {string} [ownedBy]
 * @property {number} [context] 上下文窗口
 * @property {number} [output] 最大输出
 * @property {boolean} [vision]
 * @property {boolean} [reasoning]
 * @property {boolean} [toolCall]
 * @property {string} [type] 'chat' | 'embedding' | 'rerank' | 'image' | 'audio' | 'video'
 */

/** LiteLLM `mode` 到模型类型的映射 */
const MODE_TO_TYPE = {
  chat: 'chat',
  completion: 'chat',
  responses: 'chat',
  embedding: 'embedding',
  embeddings: 'embedding',
  rerank: 'rerank',
  image_generation: 'image',
  image_edit: 'image',
  audio_transcription: 'audio',
  audio_speech: 'audio',
  video_generation: 'video',
};

/**
 * 返回第一个正数（字符串数字也接受），`0` 视为缺失。
 * @param {...unknown} vals
 * @returns {number | undefined}
 */
function firstPositive(...vals) {
  for (const v of vals) {
    const n = Number(v);
    if (v != null && v !== '' && Number.isFinite(n) && n > 0) return Math.round(n);
  }
}

/**
 * 返回第一个布尔值。
 * @param {...unknown} vals
 * @returns {boolean | undefined}
 */
const firstBool = (...vals) => vals.find((v) => typeof v === 'boolean');

/**
 * 读取上下文与输出上限。
 * @param {object} e 上游条目
 * @param {object} info LiteLLM model_info
 */
function readLimits(e, info) {
  const tp = e.top_provider || {};
  const limits = e.limits || e.limit || {};
  return {
    context: firstPositive(
      e.context_length, e.context_window, e.contextWindow, e.max_context_length, e.max_input_tokens,
      e.max_model_len, e.inputTokenLimit, tp.context_length, limits.context, info.max_input_tokens, e.meta?.n_ctx_train,
    ),
    output: firstPositive(
      e.max_output_tokens, e.max_completion_tokens, e.outputTokenLimit, e.maxTokens, e.max_tokens,
      tp.max_completion_tokens, limits.output, info.max_output_tokens, info.max_tokens,
    ),
  };
}

/**
 * 读取视觉 / 推理 / 工具调用能力。
 * @param {object} e 上游条目
 * @param {object} info LiteLLM model_info
 */
function readCapabilities(e, info) {
  const caps = e.capabilities && !Array.isArray(e.capabilities) ? e.capabilities : {};
  const capList = Array.isArray(e.capabilities) && e.capabilities.length ? e.capabilities : null;
  const params = Array.isArray(e.supported_parameters) ? e.supported_parameters : null;
  const inputMods = e.architecture?.input_modalities || e.input_modalities || e.modalities?.input;
  return {
    vision: Array.isArray(inputMods)
      ? inputMods.includes('image')
      : firstBool(caps.vision, e.supports_vision, info.supports_vision, capList?.includes('vision')),
    reasoning: firstBool(
      caps.reasoning, e.supports_reasoning, info.supports_reasoning,
      params && (params.includes('reasoning') || params.includes('include_reasoning')),
      capList && (capList.includes('thinking') || capList.includes('reasoning')),
    ),
    toolCall: firstBool(
      caps.function_calling, caps.tool_call, caps.tools, e.supports_function_calling, info.supports_function_calling,
      params?.includes('tools'), capList?.includes('tools'),
    ),
  };
}

/**
 * 读取模型类型（LiteLLM mode 或输出模态）。
 * @param {object} e 上游条目
 * @param {object} info LiteLLM model_info
 * @returns {string | undefined}
 */
function readType(e, info) {
  const mode = e.mode ?? info.mode;
  if (MODE_TO_TYPE[mode]) return MODE_TO_TYPE[mode];
  const out = e.architecture?.output_modalities || e.output_modalities || e.modalities?.output;
  if (!Array.isArray(out) || !out.length || out.includes('text')) return undefined;
  if (out.includes('image')) return 'image';
  if (out.includes('audio')) return 'audio';
}

/**
 * 把单个上游条目（对象或字符串）规范化为 RawModel。
 * @param {unknown} entry
 * @returns {RawModel | null} 无法识别时返回 null
 */
export function normalizeEntry(entry) {
  if (typeof entry === 'string') return entry.trim() ? { id: entry.trim() } : null;
  if (!entry || typeof entry !== 'object') return null;

  const id = entry.id ?? entry.model ?? entry.model_name ?? entry.name;
  if (typeof id !== 'string' || !id.trim()) return null;

  const info = entry.model_info || {};
  const name = entry.display_name ?? entry.displayName ?? (entry.id && entry.name !== entry.id ? entry.name : undefined);
  const raw = {
    id: id.trim(),
    name: typeof name === 'string' && name.trim() ? name.trim() : undefined,
    ownedBy: entry.owned_by ? String(entry.owned_by) : undefined,
    ...readLimits(entry, info),
    ...readCapabilities(entry, info),
    type: readType(entry, info),
  };
  for (const k of Object.keys(raw)) if (raw[k] === undefined) delete raw[k];
  return raw;
}

/**
 * 遍历 OpenAPI / Swagger 文档，收集 `model` 字段的 enum/example/default、`x-models` 以及内嵌的 /models 响应示例。
 * @param {object} doc
 * @returns {{ models: RawModel[], baseURL?: string }}
 */
function extractFromOpenAPI(doc) {
  const byId = new Map();
  const add = (entry) => {
    const m = normalizeEntry(entry);
    if (m) byId.set(m.id, { ...byId.get(m.id), ...m });
  };
  const collectSchema = (s) => {
    if (!s || typeof s !== 'object') return;
    if (Array.isArray(s.enum)) s.enum.filter((v) => typeof v === 'string').forEach(add);
    if (typeof s.example === 'string') add(s.example);
    if (typeof s.default === 'string') add(s.default);
    [...(s.anyOf || []), ...(s.oneOf || [])].forEach(collectSchema);
  };
  const seen = new WeakSet();
  const walk = (node, key) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) return node.forEach((n) => walk(n));
    if (Array.isArray(node.data) && node.data.some((d) => d?.object === 'model')) node.data.forEach(add);
    if (Array.isArray(node['x-models'])) node['x-models'].forEach(add);
    if (key === 'model') collectSchema(node);
    for (const [k, v] of Object.entries(node)) walk(v, k);
  };
  walk(doc);

  const baseURL = doc.servers?.[0]?.url || (doc.host ? `${doc.schemes?.[0] || 'https'}://${doc.host}${doc.basePath || ''}` : undefined);
  return { models: [...byId.values()], baseURL };
}

/**
 * 解析 JSON 或 YAML 文本；YAML 解析库按需加载，浏览器只在需要时下载。
 * @param {string} text
 * @returns {Promise<unknown>}
 */
export async function parseText(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) throw new AppError('input.empty');
  try {
    return JSON.parse(trimmed);
  } catch (jsonErr) {
    if (/^[[{]/.test(trimmed)) throw new AppError('input.badJson', { reason: jsonErr.message });
    const { parse } = await import('yaml');
    try {
      return parse(trimmed);
    } catch (yamlErr) {
      throw new AppError('input.badText', { reason: yamlErr.message });
    }
  }
}

/**
 * 把已解析的上游数据转换为 RawModel 列表（按 id 去重）。
 * @param {unknown} payload
 * @returns {{ models: RawModel[], source: string, baseURL?: string }} source 为识别出的格式描述
 */
export function ingest(payload) {
  if (payload?.openapi || payload?.swagger) {
    const res = extractFromOpenAPI(payload);
    if (!res.models.length) throw new AppError('input.noOpenapiModels');
    return { ...res, source: payload.openapi ? `OpenAPI ${payload.openapi}` : `Swagger ${payload.swagger}` };
  }

  const list = Array.isArray(payload) ? payload : payload?.data ?? payload?.models;
  if (!Array.isArray(list)) throw new AppError('input.unknownFormat');

  const byId = new Map();
  for (const entry of list) {
    const m = normalizeEntry(entry);
    if (m && !byId.has(m.id)) byId.set(m.id, m);
  }
  if (!byId.size) throw new AppError('input.noModels');
  const source = Array.isArray(payload) ? 'model list' : payload.data ? '/v1/models' : '{ models: [...] }';
  return { models: [...byId.values()], source };
}

/**
 * 从用户输入（主机名、base URL 或 …/models 地址）推导 API base URL，缺省路径补 /v1。
 * @param {string} input
 * @returns {string} 例如 https://api.example.com/v1；输入为空时返回 ''
 * @throws {AppError} 地址无法解析
 */
export function toBaseURL(input) {
  const s = String(input || '').trim();
  if (!s) return '';
  let u;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    throw new AppError('input.badUrl', { url: s });
  }
  const path = u.pathname.replace(/\/+$/, '').replace(/\/models$/, '');
  return `${u.origin}${path || '/v1'}`;
}
