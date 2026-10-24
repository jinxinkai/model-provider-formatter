# Model Provider Formatter

[English](README.md) | 中文

把 OpenAI 兼容的 `/v1/models` 列表（或 OpenAPI 文档）转换成 **OpenCode**（`opencode.json`）、**Cherry Studio**（导入包 + DeepLink）和 **VS Code Copilot**（`chatLanguageModels.json`，Custom Endpoint 提供商）可直接使用的配置。

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

GitHub Pages：<https://jinxinkai.github.io/model-provider-formatter/>。每次推送到默认分支（`main` 或 `master`）都会运行 `.github/workflows/ci.yml`（测试 → 静态构建 → 部署）。Pages 版（`VITE_STATIC=true`）没有 Koa 代理，「API 直连」由浏览器直接请求上游，需要上游允许跨域；粘贴和文件不受影响。

命令行：

```bash
node bin/cli.js -u https://api.example.com/v1 -k sk-xxx -o opencode.json
node bin/cli.js -i models.json -b https://api.example.com/v1 -t cherry --report
node bin/cli.js -u https://api.example.com/v1 -k sk-xxx -t vscode -o chatLanguageModels.json
node bin/cli.js -i models.json -b https://api.example.com/v1 --apis chat,messages
node bin/cli.js --help --lang zh
```

CLI 语言依次取 `--lang`、`MPF_LANG`、系统语言。

## 发布

推送 `v*` 标签会运行 `.github/workflows/release.yml`：跑测试，创建带自动说明的 GitHub Release 并附上静态网页包（`model-provider-formatter-web-<tag>.zip`，可部署到任意静态托管），同时把 Docker 镜像推送到 GHCR。

```bash
npm version patch          # 更新 package.json 并创建对应的 v* 标签
git push --follow-tags
docker run -d -p 127.0.0.1:15178:15178 ghcr.io/jinxinkai/model-provider-formatter:latest
```

标签必须与 `package.json` 的 `version` 一致，否则发布失败。

## 架构

```
输入 → ingest → enrich + knowledge → NormalizedModel → adapters → Web / CLI
```

| 模块 | 职责 |
|---|---|
| `src/core/ingest.js` | 解析 `/v1/models`、数组、`{ models: [] }`、OpenRouter / LiteLLM 字段、OpenAPI / Swagger（JSON/YAML）；`0` 视为缺失 |
| `src/core/enrich.js` | 取值优先级：**手动 > 官方文档规则 > 上游 > 推断规则 > 默认**，记录字段来源；输出超过上下文时截断；生成变体 |
| `src/core/knowledge.js` | 有序正则规则表，每个字段取第一条命中规则；带 `doc` 地址的规则取自厂商官方文档，优先于上游 |
| `src/core/adapters/` | OpenCode / Cherry Studio / VS Code Copilot 输出 |
| `src/core/i18n.js` | 核心文案与可翻译错误 `AppError` |
| `web/` | Vue 3 前端；`store.js` 存状态，`i18n.js` 存界面文案 |
| `src/core/fetch.js` | 拉取 `/models`；不带 Key 探测上游支持的接口 |
| `server/app.js` | Koa：`GET /api/health`、`POST /api/models`（代理上游并探测接口，按 `Accept-Language` 返回错误）、托管 `dist/` |
| `bin/cli.js` | 命令行 |

## 接口

每个对话模型选择一种请求接口：GPT / o 系列用 **Responses**（跨轮次保留推理），Claude 用 **Messages**（thinking 块与缓存），其余用 **Chat Completions**；gpt-oss 仍走 Chat Completions。上游不支持首选接口时回退到 Chat Completions，也可以在模型表格里逐个修改。

上游支持哪些接口：经 Koa 代理或 CLI `--url` 拉取模型时，不带 Key 向 `/responses`、`/messages` 发空请求，与一个不存在的路径对照，路由存在（返回 401 / 400 等）即视为支持。鉴权先于路由的网关对所有路径返回同一状态码，无法区分，按不支持处理。粘贴、文件导入和 GitHub Pages 静态版不探测，需在「提供商」中手动勾选，CLI 用 `--apis` 指定。

| 客户端 | Chat Completions | Responses | Messages |
|---|---|---|---|
| OpenCode | 提供商 `npm: @ai-sdk/openai-compatible` | 模型 `provider.npm: @ai-sdk/openai` | 模型 `provider.npm: @ai-sdk/anthropic` |
| VS Code Copilot | 提供商 `apiType: chat-completions` | 模型 `apiType: responses`、`statefulResponses: false` | 模型 `apiType: messages` |
| Cherry Studio | 提供商 `type: openai` | 拆出 `<id>-responses`，`type: openai-response` | 拆出 `<id>-anthropic`，`type: anthropic` |

Cherry Studio 每个提供商只能用一种接口（DeepLink 的 `type`），同一 id 再次导入会覆盖接口配置，因此按接口拆成多个提供商，每个一条 DeepLink；导入包 JSON 变为 `{ providers: [...] }`。VS Code 默认假设 Responses 服务端保存历史，第三方网关通常不保存，所以写 `statefulResponses: false` 发送完整历史。

## 推理变体

Chat Completions 模型的变体内容会作为请求参数传给 `@ai-sdk/openai-compatible`。官方文档写明的档位优先；没有官方规则的模型，若上游列出可用档位（`reasoning_efforts`，以及 `always_reasoning` / `reasoning_can_disable` / `reasoning_fixed_effort`），则据此生成 `reasoningEffort` 变体，档位固定或只有一个时不生成。否则按厂商方言生成：

| 家族 | 参数 | 变体 |
|---|---|---|
| GPT-5.x / o 系列 / Claude / Gemini | `reasoningEffort` | `low` `medium` `high`（按型号增减 `minimal` / `none` / `xhigh`） |
| DeepSeek V4 | `reasoningEffort` | `low` `high` `max` |
| DeepSeek V3.1+ / GLM 4.5+ / Kimi K2.5+ | `thinking: { type }` | `thinking` `no-thinking` |
| 豆包 Seed 1.6 / 2.x | `thinking: { type }` | `thinking` `no-thinking` `auto` |
| Qwen3 / 3.5+ | `enable_thinking` | `thinking` `no-thinking` |

始终思考或不支持推理的模型不生成变体。DeepSeek / GLM / Kimi 推理模型额外写入 `interleaved: { field: "reasoning_content" }`。

其他接口的变体按对应 SDK 的参数生成，与 OpenCode 内置写法一致：

| 接口 | 模型 | 变体内容 |
|---|---|---|
| Responses | effort 类 | `reasoningEffort` + `reasoningSummary: "auto"` + `include: ["reasoning.encrypted_content"]`（`store: false` 时靠加密推理内容跨轮保留） |
| Messages | Claude 4.6+ / 5.x | `thinking: { type: "adaptive" }` + `effort` |
| Messages | Claude Opus 4.5 | `thinking: { type: "enabled", budgetTokens }` + `effort` |
| Messages | 更早的 Claude | 只有手动预算：`high` / `max` 两档 `budgetTokens` |

开关类方言（`thinking: { type }`、`enable_thinking`）只用于 Chat Completions。

## 注意事项

- **禁用模型写入 `blacklist`**：OpenCode 模型 schema 不允许 `disabled` 字段。禁用的对话模型保留在 `models` 并列入 `blacklist`；非对话模型直接省略。
- **API Key** 默认写成 `{env:<PROVIDER>_API_KEY}`；Web 界面不保存 Key。
- **VS Code Copilot** 使用 [Custom Endpoint 提供商](https://code.visualstudio.com/docs/agent-customization/language-models#_add-a-custom-endpoint-model)（`vendor: "customendpoint"`）。接口按模型设置（见「接口」）。运行 **Chat: Manage Language Models** → Add Models → Custom Endpoint，把生成的对象合并进 VS Code 打开的 `chatLanguageModels.json`。Key 默认写成 `${input:<provider>ApiKey}`，由 VS Code 提示输入，不落在文件里。只输出启用的对话模型；`maxInputTokens + maxOutputTokens` 等于上下文窗口，输出最多占一半。effort 类变体映射为 `supportsReasoningEffort`，`reasoningEffortFormat` 与接口一致；开关类思考方言在 VS Code 中没有对应项，只写 `thinking: true`。
- **Cherry Studio DeepLink** 只能导入提供商连接信息且必须带 Key；模型能力标签在导入包 JSON 中。用到多种接口时有多条 DeepLink，需逐个导入。
- `/api/models` 会向任意地址转发请求，不要暴露到公网。

## 扩展

新增规则：在 `src/core/knowledge.js` 的 `RULES` 中按「越具体越靠前」插入，并在 `test/enrich.test.js` 的 `CASES` 中补一行。只有 `set` 中的值全部出自厂商官方文档时才加 `doc: '<官方页面>'`，这些值会覆盖上游，并在界面上显示链接到该页面的「官方」标记：

```js
{ key: 'vendor:model-x', match: /model-x/, set: { family: 'vendor', context: 262144, output: 65536, reasoning: 'hybrid', control: 'thinking-type', efforts: ['enabled', 'disabled'], vision: true } },
```

新增客户端：在 `src/core/adapters/` 写一个 `(models, provider) => config`，注册到 `src/core/pipeline.js` 的 `TARGETS`。

新增文案：核心层改 `src/core/i18n.js`，界面改 `web/src/i18n.js`，CLI 改 `bin/cli.js`；中英文 key 需同时添加。
