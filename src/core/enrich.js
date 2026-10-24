/**
 * @file 元数据增强引擎：RawModel → NormalizedModel（各适配器共用的中间表示）。
 * 每个字段的取值优先级：手动覆盖 > 官方文档规则 > 上游值 > 推断规则 > 兜底默认值。
 */

import { RULES, DEFAULTS } from './knowledge.js';

/**
 * @typedef {object} NormalizedModel
 * @property {string} id
 * @property {string} name 显示名
 * @property {string} family 厂商 / 家族
 * @property {string} type 'chat' | 'embedding' | 'rerank' | 'image' | 'audio' | 'video' | 'moderation'
 * @property {{ context: number, output: number }} limits
 * @property {boolean} vision
 * @property {boolean} toolCall
 * @property {boolean} coder
 * @property {'none'|'always'|'hybrid'} reasoning
 * @property {Api} api 请求所用的接口
 * @property {string | null} interleaved 多轮对话需回传的思考字段
 * @property {Record<string, object>} variants 推理变体名 → 请求参数
 * @property {boolean} disabled
 * @property {Record<string, string>} sources 字段来源：'override' | 'doc:<key>' | 'upstream' | 'rule:<key>' | 'default'
 * @property {Array<{ key: string, params?: object }>} notes 补全提示（文案 key，见 i18n.js）
 */

/**
 * @typedef {object} Override 用户在界面上的手动修改
 * @property {string} [name]
 * @property {number} [context]
 * @property {number} [output]
 * @property {boolean} [vision]
 * @property {boolean} [toolCall]
 * @property {'none'|'always'|'hybrid'} [reasoning]
 * @property {Api} [api] 上游不支持该接口时忽略
 * @property {boolean} [disabled]
 */

/**
 * @typedef {'chat'|'responses'|'messages'} Api
 * chat → /chat/completions；responses → OpenAI /responses；messages → Anthropic /messages
 */

/** 所有接口；chat 是兜底，任何上游都支持 */
export const APIS = ['chat', 'responses', 'messages'];

const RULE_FIELDS = ['type', 'family', 'context', 'output', 'vision', 'reasoning', 'control', 'efforts', 'toolCall', 'interleaved', 'coder'];

/** owned_by 中没有厂商含义的取值 */
const GENERIC_OWNERS = ['system', 'openai', 'library', 'organization-owner'];

/**
 * 合并命中的规则：每个字段取第一条定义了它的规则。
 * @param {string} id
 * @returns {{ values: import('./knowledge.js').RuleValues, from: Record<string, string> }} from 记录字段来自哪条规则（doc:<key> / rule:<key>）
 */
function matchRules(id) {
  const lid = id.toLowerCase();
  const values = {};
  const from = {};
  for (const rule of RULES) {
    const m = rule.match.exec(lid);
    if (!m) continue;
    const set = typeof rule.set === 'function' ? rule.set(m) : rule.set;
    for (const f of RULE_FIELDS) {
      if (set[f] !== undefined && values[f] === undefined) {
        values[f] = set[f];
        from[f] = `${rule.doc ? 'doc' : 'rule'}:${rule.key}`;
      }
    }
  }
  return { values, from };
}

/** 显示名中需要特殊大小写的词 */
const BRANDS = {
  gpt: 'GPT', glm: 'GLM', qwen: 'Qwen', qwq: 'QwQ', qvq: 'QVQ', deepseek: 'DeepSeek', kimi: 'Kimi', minimax: 'MiniMax',
  doubao: 'Doubao', claude: 'Claude', gemini: 'Gemini', gemma: 'Gemma', grok: 'Grok', llama: 'Llama', longcat: 'LongCat',
  ernie: 'ERNIE', hy: 'HY', step: 'Step', mimo: 'MiMo', moonshot: 'Moonshot', cogview: 'CogView', seedream: 'Seedream',
  vl: 'VL', vlm: 'VLM', ocr: 'OCR', asr: 'ASR', tts: 'TTS', oss: 'OSS', api: 'API', exp: 'Exp',
};

/**
 * 格式化单个词：品牌名、参数量（235B）、版本号（V3.1）等。
 * @param {string} tok
 * @returns {string}
 */
function formatToken(tok) {
  const lower = tok.toLowerCase();
  if (BRANDS[lower]) return BRANDS[lower];
  const brand = /^([a-z]+)(\d.*)$/.exec(lower);
  if (brand && BRANDS[brand[1]]) return BRANDS[brand[1]] + brand[2];
  if (/^\d+(\.\d+)?[bkmv]$|^a\d+(\.\d+)?b$|^[a-z]\d+(\.\d+)?[a-z]?$/.test(lower)) return lower.toUpperCase();
  if (/^\d/.test(tok)) return tok;
  return tok[0].toUpperCase() + tok.slice(1);
}

/**
 * 由模型 id 生成显示名，例如 qwen3-235b-a22b → "Qwen3 235B A22B"。
 * @param {string} id
 * @returns {string}
 */
export function prettyName(id) {
  const tokens = [];
  for (const tok of id.slice(id.lastIndexOf('/') + 1).split(/[-_\s]+/).filter(Boolean)) {
    const prev = tokens.at(-1);
    // "4-5" → "4.5"（被短横线拆开的版本号）；"2025-01-25" 保持日期
    if (prev && /^\d$/.test(tok) && /(^|[a-z])\d$/i.test(prev)) tokens[tokens.length - 1] = `${prev}.${tok}`;
    else if (prev && /^\d{2}$/.test(tok) && /^\d{4}(-\d{2})?$/.test(prev)) tokens[tokens.length - 1] = `${prev}-${tok}`;
    else tokens.push(tok);
  }
  return tokens.map(formatToken).join(' ');
}

const THINK_VARIANT = { enabled: 'thinking', disabled: 'no-thinking', auto: 'auto' };

/**
 * 模型首选的接口：GPT / o 系列用 Responses（跨轮保留推理），Claude 用 Messages（thinking 块与缓存），其余用 Chat Completions。
 * gpt-oss 是开源权重，网关多由第三方推理框架托管，仍走 Chat Completions。
 * @param {string} id
 * @param {string} family
 * @returns {Api}
 */
function preferredApi(id, family) {
  if (family === 'openai' && !/gpt-oss/i.test(id)) return 'responses';
  if (family === 'anthropic') return 'messages';
  return 'chat';
}

/**
 * Claude 的思考控制方式（同 OpenCode 的 @ai-sdk/anthropic 变体）：
 * 4.6 起（含 5.x）adaptive thinking + effort；Opus 4.5 手动预算 + effort；更早的只有手动预算。
 * @param {string} id
 * @returns {'adaptive'|'budget-effort'|'budget'}
 */
function claudeThinking(id) {
  const lid = id.toLowerCase();
  if (/fable|mythos/.test(lid)) return 'adaptive';
  // 版本号是单个数字，避免把 claude-3-7-sonnet-20250219 的日期当成版本
  const named = /(opus|sonnet|haiku)-(\d)(?:[.-](\d)(?!\d))?(?!\d)/.exec(lid);
  const numbered = /claude-(\d)(?:[.-](\d)(?!\d))?-(opus|sonnet|haiku)/.exec(lid);
  const [family, major, minor] = named ? [named[1], +named[2], +(named[3] ?? 0)] : numbered ? [numbered[3], +numbered[1], +(numbered[2] ?? 0)] : [];
  if (!family || major > 4 || (major === 4 && minor >= 6)) return 'adaptive';
  return family === 'opus' && major === 4 && minor === 5 ? 'budget-effort' : 'budget';
}

/** @ai-sdk/anthropic 手动思考预算的上限 */
const ANTHROPIC_BUDGET_MAX = 32000;

/**
 * Messages 接口下 Claude 的推理变体（@ai-sdk/anthropic 参数）。
 * @param {string} id
 * @param {string[]} efforts
 * @param {number} output
 * @returns {Record<string, object>}
 */
function anthropicVariants(id, efforts, output) {
  const mode = claudeThinking(id);
  if (mode === 'budget') {
    const max = Math.min(output, ANTHROPIC_BUDGET_MAX) - 1;
    if (max < 1024) return {};
    const budget = (tokens) => ({ thinking: { type: 'enabled', budgetTokens: tokens } });
    return { high: budget(Math.floor((max + 1) / 2)), max: budget(max) };
  }
  const thinking = mode === 'adaptive' ? { type: 'adaptive', display: 'summarized' } : { type: 'enabled', budgetTokens: Math.min(16000, output - 1) };
  return Object.fromEntries(efforts.map((e) => [e, e === 'none' ? { thinking: { type: 'disabled' } } : { thinking, effort: e }]));
}

/** Responses 接口不在服务端存储会话（store: false），需要回传加密推理内容才能跨轮保留 */
const responsesEffort = (e) => ({ reasoningEffort: e, reasoningSummary: 'auto', include: ['reasoning.encrypted_content'] });

/**
 * 生成 OpenCode 推理变体（变体内容会合并进请求参数，按接口使用不同 SDK 的参数名）。
 * @param {{ id: string, type: string, reasoning: string, api: Api, output: number, control?: string, efforts?: Array<string|boolean> }} m
 * @param {'auto'|'effort'|'off'} [style] auto 按厂商方言；effort 统一 reasoning_effort；off 不生成
 * @returns {Record<string, object>}
 */
function buildVariants({ id, type, reasoning, api, output, control, efforts = [] }, style = 'auto') {
  if (style === 'off' || type !== 'chat' || reasoning === 'none') return {};
  if (style === 'effort') [control, efforts] = ['effort', ['low', 'medium', 'high']];
  if (api === 'messages') return control === 'effort' ? anthropicVariants(id, efforts, output) : {};
  if (api === 'responses') return control === 'effort' ? Object.fromEntries(efforts.map((e) => [e, responsesEffort(e)])) : {};
  if (control === 'effort') return Object.fromEntries(efforts.map((e) => [e, { reasoningEffort: e }]));
  // 开关类控制只对可切换思考的模型有意义
  if (reasoning !== 'hybrid') return {};
  if (control === 'thinking-type') return Object.fromEntries(efforts.map((t) => [THINK_VARIANT[t], { thinking: { type: t } }]));
  if (control === 'enable-thinking') return Object.fromEntries(efforts.map((on) => [on ? 'thinking' : 'no-thinking', { enable_thinking: on }]));
  return {};
}

/**
 * 上游给出的推理模式。上游只给布尔值时，为 true 则沿用规则里更细的模式（always / hybrid）。
 * @param {import('./ingest.js').RawModel} raw
 * @param {'none'|'always'|'hybrid'} [ruleMode]
 * @returns {'none'|'always'|'hybrid' | undefined}
 */
function upstreamReasoning(raw, ruleMode) {
  if (raw.reasoning === false) return 'none';
  if (raw.reasoningMode) return raw.reasoningMode;
  if (raw.reasoning === undefined) return undefined;
  return ruleMode && ruleMode !== 'none' ? ruleMode : 'always';
}

/**
 * @param {import('./ingest.js').RawModel} raw
 * @param {Override} [override]
 * @param {{ variantStyle?: 'auto'|'effort'|'off', apis?: Api[] }} [opts] apis 为上游支持的接口，默认只有 chat
 * @returns {NormalizedModel}
 */
export function enrichModel(raw, override = {}, opts = {}) {
  const matched = matchRules(raw.id);
  const sources = {};
  const notes = [];

  const official = (field) => matched.from[field]?.startsWith('doc:');

  /** 按优先级取值并记录来源 */
  const pick = (field, upstream, ruleVal, def) => {
    const [source, value] =
      override[field] !== undefined ? ['override', override[field]]
        : ruleVal !== undefined && official(field) ? [matched.from[field], ruleVal]
          : upstream !== undefined ? ['upstream', upstream]
            : ruleVal !== undefined ? [matched.from[field], ruleVal]
              : ['default', def];
    sources[field] = source;
    return value;
  };

  const type = pick('type', raw.type, matched.values.type, 'chat');
  const isChat = type === 'chat';
  // 家族规则描述的是对话模型；非对话模型只采用上游值和兜底值
  const rule = isChat ? matched.values : {};
  const d = isChat ? DEFAULTS.chat : DEFAULTS.other;

  const context = pick('context', raw.context, rule.context, d.context);
  let output = pick('output', raw.output, rule.output, d.output);
  if (isChat && output > context) {
    notes.push({ key: 'note.clamped', params: { output, context } });
    output = context;
  }

  const reasoning = pick('reasoning', upstreamReasoning(raw, rule.reasoning), rule.reasoning, d.reasoning);
  // 档位同样是官方文档 > 上游列表 > 推断规则
  const [control, efforts] = raw.efforts && !(rule.efforts && official('efforts')) ? ['effort', raw.efforts] : [rule.control, rule.efforts];

  if (!isChat && override.disabled === undefined) notes.push({ key: 'note.nonChat', params: { type } });

  const family = matched.values.family || (raw.ownedBy && !GENERIC_OWNERS.includes(raw.ownedBy) ? raw.ownedBy : 'other');
  const apis = opts.apis || ['chat'];
  // 首选接口上游不支持时回退到 Chat Completions
  const api = !isChat ? 'chat' : apis.includes(override.api) ? override.api : [preferredApi(raw.id, family), 'chat'].find((a) => apis.includes(a)) || 'chat';

  return {
    id: raw.id,
    name: override.name || raw.name || prettyName(raw.id),
    family,
    type,
    limits: { context, output },
    vision: pick('vision', raw.vision, rule.vision, d.vision),
    toolCall: pick('toolCall', raw.toolCall, rule.toolCall, d.toolCall),
    coder: Boolean(rule.coder),
    reasoning,
    api,
    // interleaved 是 Chat Completions 的 reasoning_content 回传；Responses / Messages 自带推理块
    interleaved: reasoning === 'none' || api !== 'chat' ? null : rule.interleaved || null,
    variants: buildVariants({ id: raw.id, type, reasoning, api, output, control, efforts }, opts.variantStyle),
    disabled: override.disabled ?? !isChat,
    sources,
    notes,
  };
}

/**
 * @param {import('./ingest.js').RawModel[]} raws
 * @param {{ overrides?: Record<string, Override>, variantStyle?: 'auto'|'effort'|'off', apis?: Api[] }} [opts]
 * @returns {NormalizedModel[]}
 */
export function enrichAll(raws, { overrides = {}, variantStyle, apis } = {}) {
  return raws.map((r) => enrichModel(r, overrides[r.id], { variantStyle, apis }));
}
