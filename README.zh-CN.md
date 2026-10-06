# Model Provider Formatter

[English](README.md) | 中文

把 OpenAI 兼容的 `/v1/models` 列表（或 OpenAPI 文档）转换成 **OpenCode**（`opencode.json`）和 **Cherry Studio**（导入包 + DeepLink）可直接使用的配置。

上游通常只给模型 ID。本工具按 ID 推断上下文窗口、输出上限、视觉、工具调用和推理模式，并按各厂商的参数方言生成推理变体。界面、CLI 和接口错误信息均支持中英文。

## 快速开始

```bash
npm install
npm run dev        # 开发：Vite + Koa 同进程 → http://localhost:15173
npm run build      # 构建前端到 dist/
npm start          # 生产：Koa 提供 dist/ 与 /api → http://127.0.0.1:15178
npm test
```

Docker：

```bash
docker compose up -d --build      # → http://127.0.0.1:15178
```

端口默认只绑定 `127.0.0.1`；如需局域网访问，把 compose 中的端口改为 `"15178:15178"`（网络需可信）。容器内监听端口可通过 `PORT` 修改。

GitHub Pages：<https://jinxinkai.github.io/model-provider-formatter/>。每次推送到 `main` 都会运行 `.github/workflows/ci.yml`（测试 → 静态构建 → 部署）。Pages 版（`VITE_STATIC=true`）没有 Koa 代理，「API 直连」由浏览器直接请求上游，需要上游允许跨域；粘贴和文件不受影响。

命令行：

```bash
node bin/cli.js -u https://api.example.com/v1 -k sk-xxx -o opencode.json
node bin/cli.js -i models.json -b https://api.example.com/v1 -t cherry --report
node bin/cli.js --help --lang zh
```

CLI 语言依次取 `--lang`、`MPF_LANG`、系统语言。

## 架构

```
输入 → ingest → enrich + knowledge → NormalizedModel → adapters → Web / CLI
```

| 模块 | 职责 |
|---|---|
| `src/core/ingest.js` | 解析 `/v1/models`、数组、`{ models: [] }`、OpenRouter / LiteLLM 字段、OpenAPI / Swagger（JSON/YAML）；`0` 视为缺失 |
| `src/core/enrich.js` | 取值优先级：**手动 > 上游 > 规则 > 默认**，记录字段来源；输出超过上下文时截断；生成变体 |
| `src/core/knowledge.js` | 有序正则规则表，每个字段取第一条命中规则 |
| `src/core/adapters/` | OpenCode / Cherry Studio 输出 |
| `src/core/i18n.js` | 核心文案与可翻译错误 `AppError` |
| `web/` | Vue 3 前端；`store.js` 存状态，`i18n.js` 存界面文案 |
| `server/app.js` | Koa：`GET /api/health`、`POST /api/models`（代理上游，按 `Accept-Language` 返回错误）、托管 `dist/` |
| `bin/cli.js` | 命令行 |

## 推理变体

变体内容会作为请求参数传给 `@ai-sdk/openai-compatible`。默认按厂商方言生成：

| 家族 | 参数 | 变体 |
|---|---|---|
| GPT-5.x / o 系列 / Claude / Gemini | `reasoningEffort` | `low` `medium` `high`（按型号增减 `minimal` / `none` / `xhigh`） |
| DeepSeek V3.1+ / GLM 4.5+ / Kimi K2.5+ | `thinking: { type }` | `thinking` `no-thinking` |
| 豆包 Seed 1.6 / 2.x | `thinking: { type }` | `thinking` `no-thinking` `auto` |
| Qwen3 / 3.5+ | `enable_thinking` | `thinking` `no-thinking` |

始终思考或不支持推理的模型不生成变体。DeepSeek / GLM / Kimi 推理模型额外写入 `interleaved: { field: "reasoning_content" }`。

## 注意事项

- **禁用模型写入 `blacklist`**：OpenCode 模型 schema 不允许 `disabled` 字段。禁用的对话模型保留在 `models` 并列入 `blacklist`；非对话模型直接省略。
- **API Key** 默认写成 `{env:<PROVIDER>_API_KEY}`；Web 界面不保存 Key。
- **Cherry Studio DeepLink** 只能导入提供商连接信息且必须带 Key；模型能力标签在导入包 JSON 中。
- `/api/models` 会向任意地址转发请求，不要暴露到公网。

## 扩展

新增规则：在 `src/core/knowledge.js` 的 `RULES` 中按「越具体越靠前」插入，并在 `test/enrich.test.js` 的 `CASES` 中补一行：

```js
{ key: 'vendor:model-x', match: /model-x/, set: { family: 'vendor', context: 262144, output: 65536, reasoning: 'hybrid', control: 'thinking-type', efforts: ['enabled', 'disabled'], vision: true } },
```

新增客户端：在 `src/core/adapters/` 写一个 `(models, provider) => config`，注册到 `src/core/pipeline.js` 的 `TARGETS`。

新增文案：核心层改 `src/core/i18n.js`，界面改 `web/src/i18n.js`，CLI 改 `bin/cli.js`；中英文 key 需同时添加。
