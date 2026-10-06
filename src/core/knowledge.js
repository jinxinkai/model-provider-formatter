/**
 * @file 模型元数据知识库：按模型 id 推断能力与限额。
 *
 * 规则匹配小写后的完整 id（保留 "deepseek/" 这类前缀，需要锚定时用 (^|/)）。
 * 规则自上而下求值，每个字段取**第一条**定义了它的规则，因此：
 * 1. id 标记规则（-thinking、-instruct、vl、embedding…）排最前，它们描述的是具体 checkpoint；
 * 2. 具体版本规则排在家族通用规则之前。
 */

/**
 * @typedef {object} RuleValues 规则可设置的字段
 * @property {string} [type] 'chat' | 'embedding' | 'rerank' | 'image' | 'audio' | 'video' | 'moderation'
 * @property {string} [family] 厂商 / 家族
 * @property {number} [context] 上下文窗口
 * @property {number} [output] 最大输出
 * @property {boolean} [vision] 支持图片输入
 * @property {'none'|'always'|'hybrid'} [reasoning] hybrid 表示可按请求开关思考
 * @property {'effort'|'thinking-type'|'enable-thinking'} [control] 推理控制方式：
 *   effort → reasoning_effort；thinking-type → thinking: { type }（GLM / DeepSeek / Kimi / 豆包）；
 *   enable-thinking → enable_thinking（Qwen）
 * @property {Array<string|boolean>} [efforts] 该控制方式下生成的档位
 * @property {boolean} [toolCall] 支持函数调用
 * @property {string} [interleaved] 多轮工具调用时需回传的思考字段（OpenCode interleaved）
 * @property {boolean} [coder] 代码专用模型（仅展示）
 */

/**
 * @typedef {object} Rule
 * @property {string} key 规则名，出现在字段来源中（rule:<key>）
 * @property {RegExp} match
 * @property {RuleValues | ((m: RegExpExecArray) => RuleValues)} set
 */

const EFFORT_3 = ['low', 'medium', 'high'];
const THINK_TOGGLE = ['enabled', 'disabled'];
const THINK_AUTO = ['enabled', 'disabled', 'auto'];
const QWEN_TOGGLE = [true, false];

/** @type {Rule[]} */
export const RULES = [
  // ───────────── 1. id 标记（非对话类型优先） ─────────────
  { key: 'marker:rerank', match: /rerank/, set: { type: 'rerank' } },
  { key: 'marker:embedding', match: /embed|(^|[-_/])bge-|(^|[-_/])m3e|text-embedding/, set: { type: 'embedding' } },
  { key: 'marker:moderation', match: /moderation|(^|[-_/])(llama-)?guard/, set: { type: 'moderation' } },
  { key: 'marker:video', match: /(^|[-_/])(video|seedance|kling|veo-?\d|sora|wan\d|wanx|hailuo|vidu|cogvideo|t2v|i2v)/, set: { type: 'video' } },
  { key: 'marker:image', match: /(^|[-_/])(image|seedream|seededit|cogview|dall-e|flux|imagen|kolors|stable-diffusion|sdxl|sd3|midjourney|nano-banana|hunyuan-?image)/, set: { type: 'image' } },
  { key: 'marker:audio', match: /(^|[-_/])(asr|tts|whisper|speech|transcribe|paraformer|cosyvoice|sambert|sensevoice|fun-asr)|-audio(-|$)|realtime/, set: { type: 'audio' } },

  { key: 'marker:no-thinking', match: /(non|no)-?think/, set: { reasoning: 'none' } },
  { key: 'marker:thinking', match: /(^|[-_./])(thinking|reasoner|reasoning)([-_./]|$)/, set: { reasoning: 'always' } },
  { key: 'marker:instruct', match: /(^|[-_.])instruct([-_.]|$)/, set: { reasoning: 'none' } },
  { key: 'marker:vision', match: /(^|[-_./])(vl|vision|visual|omni|ocr)([-_./]|$)|\d(\.\d+)?v($|[-_])/, set: { vision: true } },
  { key: 'marker:ctx-in-name', match: /(?:^|[-_])(\d{1,4})k(?:$|[-_])/, set: ([, k]) => ({ context: [4, 8, 16, 32, 64, 128, 256, 512].includes(+k) ? k * 1024 : k * 1000 }) },
  { key: 'marker:coder', match: /cod(e|er|ex|estral)|devstral/, set: { coder: true } },

  // ───────────── 2. OpenAI ─────────────
  { key: 'openai:gpt-oss', match: /gpt-oss/, set: { family: 'openai', context: 131072, output: 32768, reasoning: 'always', control: 'effort', efforts: EFFORT_3, vision: false } },
  { key: 'openai:gpt-5-chat', match: /gpt-5(\.\d+)?-chat/, set: { family: 'openai', context: 128000, output: 16384, reasoning: 'none', vision: true } },
  { key: 'openai:gpt-5-codex', match: /gpt-5(\.\d+)?(-\w+)?-codex/, set: { family: 'openai', context: 400000, output: 128000, reasoning: 'always', control: 'effort', efforts: EFFORT_3, vision: true } },
  { key: 'openai:gpt-5.0', match: /(^|\/)gpt-5($|-(mini|nano|pro|\d{4}))/, set: { family: 'openai', context: 400000, output: 128000, reasoning: 'always', control: 'effort', efforts: ['minimal', 'low', 'medium', 'high'], vision: true } },
  { key: 'openai:gpt-5.1', match: /(^|\/)gpt-5\.1/, set: { family: 'openai', context: 400000, output: 128000, reasoning: 'hybrid', control: 'effort', efforts: ['none', 'low', 'medium', 'high'], vision: true } },
  { key: 'openai:gpt-5.x', match: /(^|\/)gpt-5\.\d+/, set: { family: 'openai', context: 400000, output: 128000, reasoning: 'hybrid', control: 'effort', efforts: ['none', 'low', 'medium', 'high', 'xhigh'], vision: true } },
  { key: 'openai:o-series', match: /(^|\/)o[134](-|$)/, set: { family: 'openai', context: 200000, output: 100000, reasoning: 'always', control: 'effort', efforts: EFFORT_3, vision: true } },
  { key: 'openai:gpt-4.1', match: /gpt-4\.1/, set: { family: 'openai', context: 1047576, output: 32768, reasoning: 'none', vision: true } },
  { key: 'openai:gpt-4o', match: /gpt-4o|chatgpt-4o/, set: { family: 'openai', context: 128000, output: 16384, reasoning: 'none', vision: true } },
  { key: 'openai:gpt-4', match: /gpt-4/, set: { family: 'openai', context: 128000, output: 4096, reasoning: 'none' } },
  { key: 'openai:gpt-3.5', match: /gpt-3\.5/, set: { family: 'openai', context: 16385, output: 4096, reasoning: 'none' } },

  // ───────────── 3. Anthropic（经 OpenAI 兼容网关，reasoning_effort 最通用） ─────────────
  { key: 'anthropic:claude-5', match: /claude-(fable|opus|sonnet|haiku)?-?5|claude-fable/, set: { family: 'anthropic', context: 1000000, output: 128000, reasoning: 'hybrid', control: 'effort', efforts: EFFORT_3, vision: true } },
  { key: 'anthropic:opus-4.6+', match: /claude-opus-4[.-]([6-9])/, set: { family: 'anthropic', context: 200000, output: 128000 } },
  { key: 'anthropic:opus-4.0', match: /claude-opus-4($|-\d{8}|[-.][01]($|-))|claude-4-opus/, set: { family: 'anthropic', output: 32000 } },
  { key: 'anthropic:claude-4', match: /claude-(opus|sonnet|haiku)-4|claude-4|claude-3-7|claude-3\.7/, set: { family: 'anthropic', context: 200000, output: 64000, reasoning: 'hybrid', control: 'effort', efforts: EFFORT_3, vision: true } },
  { key: 'anthropic:claude-3.5', match: /claude-3[.-]5/, set: { family: 'anthropic', context: 200000, output: 8192, reasoning: 'none', vision: true } },
  { key: 'anthropic:claude', match: /claude/, set: { family: 'anthropic', context: 200000, output: 4096, reasoning: 'none', vision: true } },

  // ───────────── 4. Google ─────────────
  { key: 'google:gemini-3', match: /gemini-3/, set: { family: 'google', context: 1048576, output: 65536, reasoning: 'hybrid', control: 'effort', efforts: ['low', 'high'], vision: true } },
  { key: 'google:gemini-2.5', match: /gemini-2\.5/, set: { family: 'google', context: 1048576, output: 65536, reasoning: 'hybrid', control: 'effort', efforts: EFFORT_3, vision: true } },
  { key: 'google:gemini', match: /gemini/, set: { family: 'google', context: 1048576, output: 8192, reasoning: 'none', vision: true } },
  { key: 'google:gemma-3', match: /gemma-?3(?!.*-1b)/, set: { family: 'google', context: 131072, output: 8192, reasoning: 'none', vision: true } },
  { key: 'google:gemma', match: /gemma/, set: { family: 'google', context: 8192, output: 4096, reasoning: 'none' } },

  // ───────────── 5. DeepSeek ─────────────
  { key: 'deepseek:v4', match: /deepseek-v4/, set: { family: 'deepseek', context: 1000000, output: 384000, reasoning: 'hybrid', control: 'thinking-type', efforts: THINK_TOGGLE, interleaved: 'reasoning_content', vision: false } },
  { key: 'deepseek:v3.1+', match: /deepseek-v3\.[1-9]/, set: { family: 'deepseek', context: 128000, output: 32768, reasoning: 'hybrid', control: 'thinking-type', efforts: THINK_TOGGLE, interleaved: 'reasoning_content', vision: false } },
  { key: 'deepseek:r1-0528', match: /deepseek-r1-0528/, set: { family: 'deepseek', toolCall: true } },
  { key: 'deepseek:r1-distill', match: /deepseek-r1-distill/, set: { family: 'deepseek', context: 131072, output: 16384, reasoning: 'always', toolCall: false } },
  { key: 'deepseek:r1', match: /deepseek-r1/, set: { family: 'deepseek', context: 128000, output: 32768, reasoning: 'always', toolCall: false, interleaved: 'reasoning_content', vision: false } },
  { key: 'deepseek:reasoner', match: /deepseek-reasoner/, set: { family: 'deepseek', context: 128000, output: 65536, reasoning: 'always', interleaved: 'reasoning_content' } },
  { key: 'deepseek:chat', match: /deepseek-chat/, set: { family: 'deepseek', context: 128000, output: 8192, reasoning: 'none' } },
  { key: 'deepseek:v3', match: /deepseek-v3/, set: { family: 'deepseek', context: 128000, output: 16384, reasoning: 'none', vision: false } },
  { key: 'deepseek', match: /deepseek/, set: { family: 'deepseek', context: 128000, output: 8192 } },

  // ───────────── 6. 通义千问（阿里云百炼） ─────────────
  { key: 'qwen:qwq', match: /qwq/, set: { family: 'qwen', context: 131072, output: 32768, reasoning: 'always' } },
  { key: 'qwen:qvq', match: /qvq/, set: { family: 'qwen', context: 131072, output: 16384, reasoning: 'always', vision: true } },
  { key: 'qwen:omni', match: /qwen.*omni/, set: { family: 'qwen', context: 65536, output: 16384, vision: true, reasoning: 'none' } },
  { key: 'qwen:coder', match: /qwen3?-coder/, set: { family: 'qwen', context: 262144, output: 65536, reasoning: 'none', coder: true } },
  { key: 'qwen:3-vl', match: /qwen3-vl/, set: { family: 'qwen', context: 262144, output: 32768, reasoning: 'hybrid', control: 'enable-thinking', efforts: QWEN_TOGGLE, vision: true } },
  { key: 'qwen:3.x-max', match: /qwen3\.\d+-max/, set: { family: 'qwen', context: 262144, output: 65536, reasoning: 'hybrid', control: 'enable-thinking', efforts: QWEN_TOGGLE, vision: true } },
  { key: 'qwen:3.x-api', match: /qwen3\.\d+-(plus|flash|turbo)/, set: { family: 'qwen', context: 1000000, output: 65536, reasoning: 'hybrid', control: 'enable-thinking', efforts: QWEN_TOGGLE, vision: true } },
  { key: 'qwen:3.5+', match: /qwen3\.([5-9]|\d{2})/, set: { family: 'qwen', context: 262144, output: 65536, reasoning: 'hybrid', control: 'enable-thinking', efforts: QWEN_TOGGLE, vision: true } },
  { key: 'qwen:3-max', match: /qwen3-max/, set: { family: 'qwen', context: 262144, output: 65536, reasoning: 'hybrid', control: 'enable-thinking', efforts: QWEN_TOGGLE, vision: false } },
  { key: 'qwen:3-2507', match: /qwen3-.*2507/, set: { family: 'qwen', context: 262144, output: 32768, vision: false } },
  { key: 'qwen:3-next', match: /qwen3-next/, set: { family: 'qwen', context: 262144, output: 32768, vision: false } },
  { key: 'qwen:3', match: /qwen3/, set: { family: 'qwen', context: 131072, output: 16384, reasoning: 'hybrid', control: 'enable-thinking', efforts: QWEN_TOGGLE, vision: false } },
  { key: 'qwen:vl-api', match: /qwen-vl|qwen2(\.5)?-vl/, set: { family: 'qwen', context: 131072, output: 8192, reasoning: 'none', vision: true } },
  { key: 'qwen:long', match: /qwen-long/, set: { family: 'qwen', context: 10000000, output: 8192, reasoning: 'none' } },
  { key: 'qwen:plus-flash-turbo', match: /qwen-(plus|flash|turbo)/, set: { family: 'qwen', context: 1000000, output: 32768, reasoning: 'hybrid', control: 'enable-thinking', efforts: QWEN_TOGGLE } },
  { key: 'qwen:max', match: /qwen-max/, set: { family: 'qwen', context: 131072, output: 8192, reasoning: 'none' } },
  { key: 'qwen', match: /qwen/, set: { family: 'qwen', context: 131072, output: 8192, reasoning: 'none' } },

  // ───────────── 7. 智谱 GLM ─────────────
  { key: 'glm:4.xv', match: /glm-4(\.\d+)?v/, set: { family: 'zhipu', context: 131072, output: 32768, reasoning: 'hybrid', control: 'thinking-type', efforts: THINK_TOGGLE, vision: true } },
  { key: 'glm:5.2+', match: /glm-5\.([2-9]|\d{2})/, set: { family: 'zhipu', context: 1000000, output: 131072 } },
  { key: 'glm:5', match: /glm-5/, set: { family: 'zhipu', context: 200000, output: 131072, reasoning: 'hybrid', control: 'thinking-type', efforts: THINK_TOGGLE, interleaved: 'reasoning_content', vision: false } },
  { key: 'glm:4.6-4.7', match: /glm-4\.[6-9]/, set: { family: 'zhipu', context: 200000, output: 131072, reasoning: 'hybrid', control: 'thinking-type', efforts: THINK_TOGGLE, interleaved: 'reasoning_content', vision: false } },
  { key: 'glm:4.5', match: /glm-4\.5/, set: { family: 'zhipu', context: 131072, output: 98304, reasoning: 'hybrid', control: 'thinking-type', efforts: THINK_TOGGLE, vision: false } },
  { key: 'glm:z1', match: /glm-z1/, set: { family: 'zhipu', context: 131072, output: 32768, reasoning: 'always' } },
  { key: 'glm', match: /glm/, set: { family: 'zhipu', context: 128000, output: 4096, reasoning: 'none' } },

  // ───────────── 8. 月之暗面 Kimi ─────────────
  { key: 'kimi:k3', match: /kimi-k3/, set: { family: 'moonshot', context: 1048576, output: 131072, reasoning: 'hybrid', control: 'thinking-type', efforts: THINK_TOGGLE, interleaved: 'reasoning_content', vision: true } },
  { key: 'kimi:k2.5+', match: /kimi-k2\.[5-9]/, set: { family: 'moonshot', context: 262144, output: 65536, reasoning: 'hybrid', control: 'thinking-type', efforts: THINK_TOGGLE, interleaved: 'reasoning_content', vision: true } },
  { key: 'kimi:k2-thinking', match: /kimi-k2.*thinking/, set: { family: 'moonshot', context: 262144, output: 65536, interleaved: 'reasoning_content' } },
  { key: 'kimi:k2', match: /kimi-k2/, set: { family: 'moonshot', context: 262144, output: 16384, reasoning: 'none', vision: false } },
  { key: 'kimi:moonshot-v1', match: /moonshot-v1/, set: { family: 'moonshot', output: 4096, reasoning: 'none' } },
  { key: 'kimi', match: /kimi|moonshot/, set: { family: 'moonshot', context: 131072, output: 8192 } },

  // ───────────── 9. MiniMax（M 系列始终思考） ─────────────
  { key: 'minimax:m3', match: /minimax-m3/, set: { family: 'minimax', context: 1000000, output: 131072, reasoning: 'always', vision: false } },
  { key: 'minimax:m2', match: /minimax-m2/, set: { family: 'minimax', context: 204800, output: 131072, reasoning: 'always', vision: false } },
  { key: 'minimax:m1', match: /minimax-m1/, set: { family: 'minimax', context: 1000000, output: 80000, reasoning: 'always', vision: false } },
  { key: 'minimax:vl', match: /minimax-vl/, set: { family: 'minimax', context: 1000000, output: 8192, reasoning: 'none', vision: true } },
  { key: 'minimax', match: /minimax|abab/, set: { family: 'minimax', context: 1000000, output: 8192, reasoning: 'none' } },

  // ───────────── 10. 字节豆包（火山方舟） ─────────────
  { key: 'doubao:seed-2-small', match: /doubao-seed-2[.-]\d+-(lite|mini)/, set: { family: 'doubao', output: 32768 } },
  { key: 'doubao:seed-2', match: /doubao-seed-2/, set: { family: 'doubao', context: 262144, output: 131072, reasoning: 'hybrid', control: 'thinking-type', efforts: THINK_AUTO, vision: true } },
  { key: 'doubao:seed-code', match: /doubao-seed-code/, set: { family: 'doubao', context: 262144, output: 32768, reasoning: 'hybrid', control: 'thinking-type', efforts: THINK_TOGGLE, vision: true, coder: true } },
  { key: 'doubao:seed-1.6', match: /doubao-seed-1[.-][68]/, set: { family: 'doubao', context: 262144, output: 32768, reasoning: 'hybrid', control: 'thinking-type', efforts: THINK_AUTO, vision: true } },
  { key: 'doubao:1.5-thinking', match: /doubao-1[.-]5-thinking/, set: { family: 'doubao', context: 131072, output: 16384 } },
  { key: 'doubao:1.5', match: /doubao-1[.-]5/, set: { family: 'doubao', context: 131072, output: 12288, reasoning: 'none' } },
  { key: 'doubao', match: /doubao/, set: { family: 'doubao', context: 131072, output: 12288, reasoning: 'none' } },

  // ───────────── 11. 其他 ─────────────
  { key: 'xai:grok-code', match: /grok-code/, set: { family: 'xai', context: 256000, output: 10000, reasoning: 'always', vision: false } },
  { key: 'xai:grok-4', match: /grok-4/, set: { family: 'xai', context: 256000, output: 64000, reasoning: 'always', vision: true } },
  { key: 'xai:grok-3-mini', match: /grok-3-mini/, set: { family: 'xai', context: 131072, output: 16384, reasoning: 'always', control: 'effort', efforts: ['low', 'high'] } },
  { key: 'xai:grok', match: /grok/, set: { family: 'xai', context: 131072, output: 16384, reasoning: 'none' } },
  { key: 'meituan:longcat-thinking', match: /longcat.*thinking/, set: { family: 'meituan', context: 131072, output: 65536 } },
  { key: 'meituan:longcat', match: /longcat/, set: { family: 'meituan', context: 131072, output: 65536, reasoning: 'none' } },
  { key: 'tencent:hunyuan', match: /hunyuan|(^|\/)hy\d/, set: { family: 'tencent', context: 262144, output: 32768 } },
  { key: 'stepfun', match: /(^|\/)step-/, set: { family: 'stepfun', context: 65536, output: 16384 } },
  { key: 'xiaomi:mimo', match: /mimo/, set: { family: 'xiaomi', context: 262144, output: 65536 } },
  { key: 'baidu:ernie-x', match: /ernie-x/, set: { family: 'baidu', context: 32768, output: 16384, reasoning: 'always' } },
  { key: 'baidu:ernie', match: /ernie/, set: { family: 'baidu', context: 131072, output: 12288 } },
  { key: 'mistral:magistral', match: /magistral/, set: { family: 'mistral', context: 131072, output: 40000, reasoning: 'always' } },
  { key: 'mistral:pixtral', match: /pixtral/, set: { family: 'mistral', context: 131072, output: 8192, vision: true } },
  { key: 'mistral:codestral', match: /codestral|devstral/, set: { family: 'mistral', context: 262144, output: 32768 } },
  { key: 'mistral', match: /mistral|mixtral|ministral/, set: { family: 'mistral', context: 131072, output: 8192 } },
  { key: 'meta:llama-4', match: /llama-?4/, set: { family: 'meta', context: 1048576, output: 16384, vision: true } },
  { key: 'meta:llama', match: /llama/, set: { family: 'meta', context: 131072, output: 8192 } },
];

/** 上游与规则都没有给出时的兜底值 */
export const DEFAULTS = {
  chat: { context: 128000, output: 8192, vision: false, reasoning: 'none', toolCall: true },
  other: { context: 8192, output: 0, vision: false, reasoning: 'none', toolCall: false },
};
