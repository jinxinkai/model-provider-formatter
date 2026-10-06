/**
 * @file 前端中英文文案。界面 key 找不到时回退到核心层文案（错误信息、补全提示）。
 * 带 HTML 的文案（*Html）只用 v-html 渲染，参数不得包含未经处理的用户输入。
 */

import { ref, watchEffect } from 'vue';
import { fill, t as coreT } from '@core/i18n.js';

const MESSAGES = {
  zh: {
    'nav.opencodeDocs': 'OpenCode 文档',
    'nav.cherryDocs': 'Cherry Studio 文档',
    'nav.switch': 'EN',
    'hero.titleHtml': '把任意 <code>/v1/models</code> 变成<span class="hl">开箱即用</span>的客户端配置',
    'hero.lede': '拉取上游模型列表 → 自动补齐上下文、输出上限、视觉与推理能力 → 生成 OpenCode / Cherry Studio 配置。',

    'source.title': '上游输入',
    'source.tab.api': 'API 直连',
    'source.tab.paste': '粘贴',
    'source.tab.file': '文件',
    'source.url': 'API 地址',
    'source.fetch': '拉取模型列表',
    'source.fetchHintHtml': '经本地服务转发请求 <code>GET /models</code>，Key 不会被保存。',
    'source.fetchHintStaticHtml': '浏览器直接请求 <code>GET /models</code>，需要上游允许跨域；失败时请改用粘贴或文件。Key 不会被保存。',
    'source.pasteLabel': '/v1/models 响应、模型数组，或 OpenAPI 3 / Swagger（JSON 或 YAML）',
    'source.parse': '解析',
    'source.drop': '选择或拖入文件',
    'status.fetching': '正在拉取…',
    'status.loaded': '✓ 已识别 {source}：{total} 个模型，其中对话模型 {chat} 个',

    'provider.title': '提供商',
    'provider.name': '显示名称',
    'provider.keyMode': 'API Key 写入方式',
    'provider.keyMode.env': '环境变量 {env:…}',
    'provider.keyMode.inline': '明文写入配置',
    'provider.keyMode.none': '不写入',
    'provider.variants': '推理变体',
    'provider.variants.auto': '按厂商方言（推荐）',
    'provider.variants.effort': '统一 reasoning_effort',
    'provider.variants.off': '不生成',
    'provider.hint.envHtml': '配置中写入 <code>{env:{var}}</code>，启动 OpenCode 前请设置同名环境变量。',
    'provider.hint.inline': 'API Key 将以明文写入配置文件，请勿提交到代码仓库。',
    'provider.hint.noKey': '未填写 API Key：请在「API 直连」中填写。',
    'provider.hint.none': '不写入 apiKey，可在 OpenCode 中通过 /connect 录入。',

    'models.title': '模型与能力',
    'models.meta': '{source} · {total} 个模型 · 启用 {enabled} · 上游提供上下文 {upstream} 个，其余由规则补全',
    'models.search': '搜索模型 ID…',
    'models.empty': '没有匹配的模型',
    'models.legend': '数值来源：',
    'models.legendHint': '· 点击能力标签或修改数值即可覆盖推断结果',
    'filter.all': '全部',
    'filter.chat': '对话',
    'filter.other': '非对话',
    'filter.disabled': '已禁用',
    'bulk.chat': '仅启用对话模型',
    'bulk.all': '全部启用',
    'bulk.reset': '重置修改',
    'col.enabled': '启用',
    'col.model': '模型',
    'col.context': '上下文',
    'col.output': '输出上限',
    'col.caps': '能力',
    'col.reasoning': '推理',
    'col.variants': '变体',
    'row.enable': '启用 {id}',
    'cap.vision': '视觉',
    'cap.toolCall': '工具',
    'reasoning.none': '无',
    'reasoning.always': '始终思考',
    'reasoning.hybrid': '可切换',
    'type.embedding': '向量',
    'type.rerank': '重排',
    'type.image': '图像',
    'type.audio': '语音',
    'type.video': '视频',
    'type.moderation': '审核',
    'src.upstream': '上游',
    'src.rule': '规则',
    'src.default': '默认',
    'src.override': '手动',

    'output.title': '输出',
    'output.download': '下载',
    'output.downloadFile': '下载 {file}',
    'output.copy': '复制',
    'output.copied': '已复制',
    'output.copyFailed': '复制失败',
    'output.openCherry': '在 Cherry Studio 中打开',
    'output.hint.opencodeHtml': '保存到 <code>~/.config/opencode/opencode.json</code>（全局）或项目根目录；已有配置时合并 <code>provider</code> 段即可。',
    'output.hint.cherry': '一键导入会创建提供商并写入 Key；随后在「管理」中添加模型，能力标签可参照下方 JSON。',
    'output.hint.cherryNoKey': '一键导入需要 API Key，请在「API 直连」中填写。',
  },
  en: {
    'nav.opencodeDocs': 'OpenCode docs',
    'nav.cherryDocs': 'Cherry Studio docs',
    'nav.switch': '中文',
    'hero.titleHtml': 'Turn any <code>/v1/models</code> into <span class="hl">ready-to-use</span> client configs',
    'hero.lede': 'Fetch the upstream model list → fill in context, max output, vision and reasoning → generate OpenCode / Cherry Studio configs.',

    'source.title': 'Upstream input',
    'source.tab.api': 'Fetch API',
    'source.tab.paste': 'Paste',
    'source.tab.file': 'File',
    'source.url': 'API URL',
    'source.fetch': 'Fetch models',
    'source.fetchHintHtml': 'Proxied via the local server as <code>GET /models</code>; the key is never stored.',
    'source.fetchHintStaticHtml': 'Your browser calls <code>GET /models</code> directly, so the upstream must allow CORS; otherwise use Paste or File. The key is never stored.',
    'source.pasteLabel': 'A /v1/models response, a model array, or OpenAPI 3 / Swagger (JSON or YAML)',
    'source.parse': 'Parse',
    'source.drop': 'Choose or drop a file',
    'status.fetching': 'Fetching…',
    'status.loaded': '✓ Detected {source}: {total} models, {chat} of them chat models',

    'provider.title': 'Provider',
    'provider.name': 'Display name',
    'provider.keyMode': 'API key in config',
    'provider.keyMode.env': 'Environment variable {env:…}',
    'provider.keyMode.inline': 'Inline (plain text)',
    'provider.keyMode.none': 'Omit',
    'provider.variants': 'Reasoning variants',
    'provider.variants.auto': 'Vendor dialect (recommended)',
    'provider.variants.effort': 'reasoning_effort for all',
    'provider.variants.off': 'None',
    'provider.hint.envHtml': 'Writes <code>{env:{var}}</code>; set this environment variable before starting OpenCode.',
    'provider.hint.inline': 'The API key is written in plain text; do not commit this file.',
    'provider.hint.noKey': 'No API key yet: enter it under “Fetch API”.',
    'provider.hint.none': 'apiKey is omitted; add it in OpenCode with /connect.',

    'models.title': 'Models & capabilities',
    'models.meta': '{source} · {total} models · {enabled} enabled · {upstream} with upstream context, the rest inferred by rules',
    'models.search': 'Search model ID…',
    'models.empty': 'No matching models',
    'models.legend': 'Value source: ',
    'models.legendHint': '· Click a capability or edit a value to override the inferred result',
    'filter.all': 'All',
    'filter.chat': 'Chat',
    'filter.other': 'Non-chat',
    'filter.disabled': 'Disabled',
    'bulk.chat': 'Enable chat only',
    'bulk.all': 'Enable all',
    'bulk.reset': 'Reset edits',
    'col.enabled': 'Enabled',
    'col.model': 'Model',
    'col.context': 'Context',
    'col.output': 'Max output',
    'col.caps': 'Capabilities',
    'col.reasoning': 'Reasoning',
    'col.variants': 'Variants',
    'row.enable': 'Enable {id}',
    'cap.vision': 'Vision',
    'cap.toolCall': 'Tools',
    'reasoning.none': 'None',
    'reasoning.always': 'Always',
    'reasoning.hybrid': 'Toggleable',
    'type.embedding': 'Embedding',
    'type.rerank': 'Rerank',
    'type.image': 'Image',
    'type.audio': 'Audio',
    'type.video': 'Video',
    'type.moderation': 'Moderation',
    'src.upstream': 'Upstream',
    'src.rule': 'Rule',
    'src.default': 'Default',
    'src.override': 'Manual',

    'output.title': 'Output',
    'output.download': 'Download',
    'output.downloadFile': 'Download {file}',
    'output.copy': 'Copy',
    'output.copied': 'Copied',
    'output.copyFailed': 'Copy failed',
    'output.openCherry': 'Open in Cherry Studio',
    'output.hint.opencodeHtml': 'Save to <code>~/.config/opencode/opencode.json</code> (global) or the project root; merge the <code>provider</code> block into an existing config.',
    'output.hint.cherry': 'One-click import creates the provider with your key; then add models under “Manage” using the capabilities in the JSON below.',
    'output.hint.cherryNoKey': 'One-click import needs an API key; enter it under “Fetch API”.',
  },
};

const STORE_KEY = 'mpf:lang';

/**
 * 读取保存的语言，否则按浏览器语言推断。
 * @returns {import('@core/i18n.js').Locale}
 */
function initialLocale() {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
  } catch {}
  return navigator.language?.startsWith('zh') ? 'zh' : 'en';
}

/** 当前界面语言 */
export const locale = ref(initialLocale());

watchEffect(() => {
  document.documentElement.lang = locale.value === 'zh' ? 'zh-CN' : 'en';
  try {
    localStorage.setItem(STORE_KEY, locale.value);
  } catch {}
});

/** 切换中英文 */
export const toggleLocale = () => {
  locale.value = locale.value === 'zh' ? 'en' : 'zh';
};

/**
 * 翻译界面文案；界面词典没有时回退到核心层。
 * @param {string} key
 * @param {Record<string, unknown>} [params]
 * @returns {string}
 */
export function t(key, params) {
  const msg = MESSAGES[locale.value][key];
  return msg === undefined ? coreT(locale.value, key, params) : fill(msg, params);
}
