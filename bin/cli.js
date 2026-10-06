#!/usr/bin/env node
/**
 * @file 命令行入口，与 Web 界面共用同一条转换管道。
 * @example mpf -u https://api.example.com/v1 -k sk-xxx -o opencode.json
 */

import { readFile, writeFile } from 'node:fs/promises';
import { text } from 'node:stream/consumers';
import { parseArgs } from 'node:util';
import { ingest, toBaseURL } from '../src/core/ingest.js';
import { fetchModels } from '../src/core/fetch.js';
import { convert, deriveProvider, ingestText, TARGETS } from '../src/core/pipeline.js';
import { fill, localize } from '../src/core/i18n.js';

const TARGET_NAMES = Object.keys(TARGETS).join(' | ');

/** CLI 文案 */
const MESSAGES = {
  zh: {
    help: `用法: mpf [选项]

输入（二选一）:
  -u, --url <url>           上游 API 地址（…/v1 或 …/v1/models），自动拉取模型列表
  -i, --input <file>        离线文件：/v1/models JSON、模型数组或 OpenAPI (JSON/YAML)，"-" 表示 stdin

选项:
  -k, --key <key>           API Key（默认读取环境变量 MPF_API_KEY）
  -b, --base-url <url>      写入配置的 baseURL（默认取 --url 或 OpenAPI servers[0]）
  -t, --target <name>       ${TARGET_NAMES}（默认 opencode）
  -o, --out <file>          输出文件（默认打印到 stdout）
      --provider-id <id>    提供商 ID（默认由域名推断）
      --name <name>         提供商显示名
      --key-mode <mode>     env | inline | none：配置中 apiKey 的写法（默认 env → {env:XXX_API_KEY}）
      --variants <style>    auto | effort | off：推理变体的生成方式（默认 auto）
      --include-all         同时启用非对话模型（embedding / 图像 / 语音等）
      --report              在 stderr 打印每个模型的补全结果
      --lang <zh|en>        输出语言（默认读取 MPF_LANG 或系统语言）
  -h, --help`,
    noBaseURL: '无法确定 baseURL，请通过 --base-url 指定',
    summary: '✓ {source}: {total} 个模型（启用 {enabled}）→ {target}',
    deepLink: 'Cherry Studio 一键导入: {link}',
    written: '已写入 {file}',
  },
  en: {
    help: `Usage: mpf [options]

Input (one of):
  -u, --url <url>           Upstream API URL (…/v1 or …/v1/models); fetches the model list
  -i, --input <file>        Offline file: /v1/models JSON, model array or OpenAPI (JSON/YAML); "-" for stdin

Options:
  -k, --key <key>           API key (defaults to env MPF_API_KEY)
  -b, --base-url <url>      baseURL written to the config (defaults to --url or OpenAPI servers[0])
  -t, --target <name>       ${TARGET_NAMES} (default opencode)
  -o, --out <file>          Output file (prints to stdout by default)
      --provider-id <id>    Provider ID (inferred from the domain by default)
      --name <name>         Provider display name
      --key-mode <mode>     env | inline | none: how apiKey is written (default env → {env:XXX_API_KEY})
      --variants <style>    auto | effort | off: how reasoning variants are generated (default auto)
      --include-all         Also enable non-chat models (embedding / image / audio …)
      --report              Print per-model enrichment results to stderr
      --lang <zh|en>        Output language (defaults to MPF_LANG or the system locale)
  -h, --help`,
    noBaseURL: 'Cannot determine baseURL; pass --base-url',
    summary: '✓ {source}: {total} models ({enabled} enabled) → {target}',
    deepLink: 'Cherry Studio one-click import: {link}',
    written: 'Written to {file}',
  },
};

const { values: args } = parseArgs({
  options: {
    url: { type: 'string', short: 'u' },
    input: { type: 'string', short: 'i' },
    key: { type: 'string', short: 'k' },
    'base-url': { type: 'string', short: 'b' },
    target: { type: 'string', short: 't', default: 'opencode' },
    out: { type: 'string', short: 'o' },
    'provider-id': { type: 'string' },
    name: { type: 'string' },
    'key-mode': { type: 'string', default: 'env' },
    variants: { type: 'string', default: 'auto' },
    'include-all': { type: 'boolean', default: false },
    report: { type: 'boolean', default: false },
    lang: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
});

/** @type {import('../src/core/i18n.js').Locale} */
const lang = (args.lang || process.env.MPF_LANG || Intl.DateTimeFormat().resolvedOptions().locale).startsWith('zh') ? 'zh' : 'en';

/**
 * 翻译 CLI 文案。
 * @param {keyof MESSAGES['zh']} key
 * @param {Record<string, unknown>} [params]
 */
const msg = (key, params) => fill(MESSAGES[lang][key], params);

/**
 * 读取模型列表：在线拉取或读取文件 / stdin。
 * @param {string} apiKey
 * @returns {Promise<{ models: import('../src/core/ingest.js').RawModel[], source: string, baseURL?: string }>}
 */
async function readInput(apiKey) {
  if (args.url) {
    const { payload, baseURL } = await fetchModels(args.url, apiKey);
    return { ...ingest(payload), baseURL };
  }
  return ingestText(args.input === '-' ? await text(process.stdin) : await readFile(args.input, 'utf8'));
}

/**
 * 在 stderr 打印每个模型的补全结果。
 * @param {import('../src/core/enrich.js').NormalizedModel[]} models
 */
function printReport(models) {
  for (const m of models) {
    const flags = [m.vision && 'vision', m.reasoning !== 'none' && `reasoning:${m.reasoning}`, m.toolCall && 'tools', m.disabled && 'DISABLED'];
    console.error(`${m.id.padEnd(42)} ctx=${String(m.limits.context).padEnd(8)} out=${String(m.limits.output).padEnd(7)} ${flags.filter(Boolean).join(' ')}`);
  }
}

async function main() {
  if (args.help || (!args.url && !args.input)) {
    console.log(msg('help'));
    process.exit(args.help ? 0 : 1);
  }
  const apiKey = args.key || process.env.MPF_API_KEY || '';
  const input = await readInput(apiKey);

  const baseURL = toBaseURL(args['base-url'] || input.baseURL);
  if (!baseURL) throw new Error(msg('noBaseURL'));
  const guess = deriveProvider(baseURL);
  const provider = { id: args['provider-id'] || guess.id, name: args.name || guess.name, baseURL, apiKey, apiKeyMode: args['key-mode'] };
  const overrides = args['include-all'] ? Object.fromEntries(input.models.map((m) => [m.id, { disabled: false }])) : {};

  const result = convert({ raws: input.models, provider, target: args.target, overrides, variantStyle: args.variants });
  if (args.report) printReport(result.models);
  const enabled = result.models.filter((m) => !m.disabled).length;
  console.error(msg('summary', { source: input.source, total: result.models.length, enabled, target: TARGETS[args.target].label }));
  if (result.deepLink) console.error(msg('deepLink', { link: result.deepLink }));

  const json = JSON.stringify(result.config, null, 2) + '\n';
  if (!args.out) return process.stdout.write(json);
  await writeFile(args.out, json);
  console.error(msg('written', { file: args.out }));
}

main().catch((err) => {
  console.error(`✗ ${localize(err, lang)}`);
  process.exit(1);
});
