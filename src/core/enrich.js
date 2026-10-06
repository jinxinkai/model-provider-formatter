/**
 * @file 元数据增强引擎：RawModel → NormalizedModel（各适配器共用的中间表示）。
 * 每个字段的取值优先级：手动覆盖 > 上游值 > 知识库规则 > 兜底默认值。
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
 * @property {string | null} interleaved 多轮对话需回传的思考字段
 * @property {Record<string, object>} variants 推理变体名 → 请求参数
 * @property {boolean} disabled
 * @property {Record<string, string>} sources 字段来源：'override' | 'upstream' | 'rule:<key>' | 'default'
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
 * @property {boolean} [disabled]
 */

const RULE_FIELDS = ['type', 'family', 'context', 'output', 'vision', 'reasoning', 'control', 'efforts', 'toolCall', 'interleaved', 'coder'];

/** owned_by 中没有厂商含义的取值 */
const GENERIC_OWNERS = ['system', 'openai', 'library', 'organization-owner'];

/**
 * 合并命中的规则：每个字段取第一条定义了它的规则。
 * @param {string} id
 * @returns {{ values: import('./knowledge.js').RuleValues, from: Record<string, string> }} from 记录字段来自哪条规则
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
        from[f] = `rule:${rule.key}`;
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
 * 生成 OpenCode 推理变体（变体内容会合并进请求参数）。
 * @param {{ type: string, reasoning: string, control?: string, efforts?: Array<string|boolean> }} m
 * @param {'auto'|'effort'|'off'} [style] auto 按厂商方言；effort 统一 reasoning_effort；off 不生成
 * @returns {Record<string, object>}
 */
function buildVariants({ type, reasoning, control, efforts = [] }, style = 'auto') {
  if (style === 'off' || type !== 'chat' || reasoning === 'none') return {};
  if (style === 'effort') return Object.fromEntries(['low', 'medium', 'high'].map((e) => [e, { reasoningEffort: e }]));
  if (control === 'effort') return Object.fromEntries(efforts.map((e) => [e, { reasoningEffort: e }]));
  // 开关类控制只对可切换思考的模型有意义
  if (reasoning !== 'hybrid') return {};
  if (control === 'thinking-type') return Object.fromEntries(efforts.map((t) => [THINK_VARIANT[t], { thinking: { type: t } }]));
  if (control === 'enable-thinking') return Object.fromEntries(efforts.map((on) => [on ? 'thinking' : 'no-thinking', { enable_thinking: on }]));
  return {};
}

/**
 * 增强单个模型。
 * @param {import('./ingest.js').RawModel} raw
 * @param {Override} [override]
 * @param {{ variantStyle?: 'auto'|'effort'|'off' }} [opts]
 * @returns {NormalizedModel}
 */
export function enrichModel(raw, override = {}, opts = {}) {
  const matched = matchRules(raw.id);
  const sources = {};
  const notes = [];

  /** 按优先级取值并记录来源 */
  const pick = (field, upstream, ruleVal, def) => {
    const [source, value] =
      override[field] !== undefined ? ['override', override[field]]
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

  // 上游只给布尔值：为 true 时沿用规则里更细的模式（always / hybrid）
  const upstreamReasoning = raw.reasoning === undefined ? undefined
    : !raw.reasoning ? 'none'
      : rule.reasoning && rule.reasoning !== 'none' ? rule.reasoning : 'always';
  const reasoning = pick('reasoning', upstreamReasoning, rule.reasoning, d.reasoning);

  if (!isChat && override.disabled === undefined) notes.push({ key: 'note.nonChat', params: { type } });

  return {
    id: raw.id,
    name: override.name || raw.name || prettyName(raw.id),
    family: matched.values.family || (raw.ownedBy && !GENERIC_OWNERS.includes(raw.ownedBy) ? raw.ownedBy : 'other'),
    type,
    limits: { context, output },
    vision: pick('vision', raw.vision, rule.vision, d.vision),
    toolCall: pick('toolCall', raw.toolCall, rule.toolCall, d.toolCall),
    coder: Boolean(rule.coder),
    reasoning,
    interleaved: reasoning === 'none' ? null : rule.interleaved || null,
    variants: buildVariants({ type, reasoning, control: rule.control, efforts: rule.efforts }, opts.variantStyle),
    disabled: override.disabled ?? !isChat,
    sources,
    notes,
  };
}

/**
 * 批量增强。
 * @param {import('./ingest.js').RawModel[]} raws
 * @param {{ overrides?: Record<string, Override>, variantStyle?: 'auto'|'effort'|'off' }} [opts]
 * @returns {NormalizedModel[]}
 */
export function enrichAll(raws, { overrides = {}, variantStyle } = {}) {
  return raws.map((r) => enrichModel(r, overrides[r.id], { variantStyle }));
}
