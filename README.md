# Model Provider Formatter

English | [中文](README.zh-CN.md)

Turns an OpenAI-compatible `/v1/models` list (or an OpenAPI document) into ready-to-use configs for **OpenCode** (`opencode.json`), **Cherry Studio** (import bundle + deep link) and **VS Code Copilot** (`chatLanguageModels.json`, Custom Endpoint provider).

Upstreams usually return bare model IDs. This tool infers context window, max output, vision, tool calling and reasoning mode from each ID, and generates reasoning variants in each vendor's parameter dialect. The UI, CLI and API error messages are available in Chinese and English.

## Quick start

```bash
npm install
npm run dev        # dev: Vite + Koa in one process → http://localhost:15173
npm run build      # build the frontend into dist/
npm start          # prod: Koa serves dist/ and /api → http://127.0.0.1:15178
npm test
```

Docker:

```bash
docker compose up -d --build      # → http://127.0.0.1:15178
```

The port is bound to `127.0.0.1` by default; for LAN access change it to `"15178:15178"` in the compose file (trusted networks only). Override the in-container port with `PORT`.

GitHub Pages: <https://jinxinkai.github.io/model-provider-formatter/>. Every push to the default branch (`main` or `master`) runs `.github/workflows/ci.yml` (test → static build → deploy). The Pages build (`VITE_STATIC=true`) has no Koa proxy, so "Fetch API" calls the upstream straight from the browser and only works when the upstream allows CORS; Paste and File work everywhere.

CLI:

```bash
node bin/cli.js -u https://api.example.com/v1 -k sk-xxx -o opencode.json
node bin/cli.js -i models.json -b https://api.example.com/v1 -t cherry --report
node bin/cli.js -u https://api.example.com/v1 -k sk-xxx -t vscode -o chatLanguageModels.json
node bin/cli.js -i models.json -b https://api.example.com/v1 --apis chat,messages
node bin/cli.js --help --lang en
```

The CLI language comes from `--lang`, then `MPF_LANG`, then the system locale.

## Releases

Pushing a `v*` tag runs `.github/workflows/release.yml`: tests, a GitHub Release with generated notes plus a static web bundle (`model-provider-formatter-web-<tag>.zip`, deployable to any static host), and a Docker image on GHCR.

```bash
npm version patch          # bumps package.json and creates the matching v* tag
git push --follow-tags
docker run -d -p 127.0.0.1:15178:15178 ghcr.io/jinxinkai/model-provider-formatter:latest
```

The tag must match the `version` in `package.json`, otherwise the release fails.

## Architecture

```
input → ingest → enrich + knowledge → NormalizedModel → adapters → Web / CLI
```

| Module | Responsibility |
|---|---|
| `src/core/ingest.js` | Parses `/v1/models`, arrays, `{ models: [] }`, OpenRouter / LiteLLM fields, OpenAPI / Swagger (JSON/YAML); `0` counts as missing |
| `src/core/enrich.js` | Precedence: **manual > official-doc rule > upstream > inferred rule > default**, with per-field source tracking; clamps output to context; builds variants |
| `src/core/knowledge.js` | Ordered regex rules; each field takes the first matching rule. Rules with a `doc` URL come from the vendor's official docs and beat upstream values |
| `src/core/adapters/` | OpenCode / Cherry Studio / VS Code Copilot output |
| `src/core/i18n.js` | Core messages and the translatable `AppError` |
| `web/` | Vue 3 frontend; state in `store.js`, UI strings in `i18n.js` |
| `src/core/fetch.js` | Fetches `/models`; probes which APIs the upstream supports without a key |
| `server/app.js` | Koa: `GET /api/health`, `POST /api/models` (upstream proxy plus API probe, errors follow `Accept-Language`), serves `dist/` |
| `bin/cli.js` | Command line |

## APIs

Each chat model picks one request API: GPT / o-series use **Responses** (reasoning carries across turns), Claude uses **Messages** (thinking blocks and caching), everything else uses **Chat Completions**; gpt-oss stays on Chat Completions. When the upstream lacks the preferred API the model falls back to Chat Completions, and you can change it per model in the table.

Which APIs the upstream supports: when models are fetched through the Koa proxy or the CLI `--url`, an empty keyless POST goes to `/responses` and `/messages` and is compared with a path that does not exist; a route that exists (401 / 400 and so on) counts as supported. Gateways that authenticate before routing return the same status everywhere, so they cannot be told apart and count as unsupported. Paste, File and the GitHub Pages build do not probe: tick the APIs under "Provider", or pass `--apis` to the CLI.

| Client | Chat Completions | Responses | Messages |
|---|---|---|---|
| OpenCode | provider `npm: @ai-sdk/openai-compatible` | model `provider.npm: @ai-sdk/openai` | model `provider.npm: @ai-sdk/anthropic` |
| VS Code Copilot | provider `apiType: chat-completions` | model `apiType: responses`, `statefulResponses: false` | model `apiType: messages` |
| Cherry Studio | provider `type: openai` | split into `<id>-responses`, `type: openai-response` | split into `<id>-anthropic`, `type: anthropic` |

A Cherry Studio provider speaks one API (the deep link `type`), and re-importing the same id replaces its endpoint, so the output is split into one provider and one deep link per API; the bundle JSON becomes `{ providers: [...] }`. VS Code assumes a Responses server keeps prior responses; third-party gateways usually do not, so `statefulResponses: false` sends the full history.

## Reasoning variants

For Chat Completions models, variant contents are passed as request parameters to `@ai-sdk/openai-compatible`. Levels documented by the vendor win. For models without a doc-backed rule, levels listed by the upstream (`reasoning_efforts`, with `always_reasoning` / `reasoning_can_disable` / `reasoning_fixed_effort`) become `reasoningEffort` variants; a fixed or single level yields none. Otherwise they follow each vendor's dialect:

| Family | Parameter | Variants |
|---|---|---|
| GPT-5.x / o-series / Claude / Gemini | `reasoningEffort` | `low` `medium` `high` (plus `minimal` / `none` / `xhigh` per model) |
| DeepSeek V4 | `reasoningEffort` | `low` `high` `max` |
| DeepSeek V3.1+ / GLM 4.5+ / Kimi K2.5+ | `thinking: { type }` | `thinking` `no-thinking` |
| Doubao Seed 1.6 / 2.x | `thinking: { type }` | `thinking` `no-thinking` `auto` |
| Qwen3 / 3.5+ | `enable_thinking` | `thinking` `no-thinking` |

Always-thinking and non-reasoning models get no variants. DeepSeek / GLM / Kimi reasoning models also get `interleaved: { field: "reasoning_content" }`.

On the other APIs, variants use that SDK's parameters, matching OpenCode's built-in ones:

| API | Model | Variant contents |
|---|---|---|
| Responses | effort-style | `reasoningEffort` + `reasoningSummary: "auto"` + `include: ["reasoning.encrypted_content"]` (with `store: false`, encrypted reasoning is what carries across turns) |
| Messages | Claude 4.6+ / 5.x | `thinking: { type: "adaptive" }` + `effort` |
| Messages | Claude Opus 4.5 | `thinking: { type: "enabled", budgetTokens }` + `effort` |
| Messages | Earlier Claude | Manual budget only: `high` / `max` `budgetTokens` |

On/off dialects (`thinking: { type }`, `enable_thinking`) apply to Chat Completions only.

## Notes

- **Disabled models go to `blacklist`**: OpenCode's model schema rejects a `disabled` key. Disabled chat models stay in `models` and are listed in `blacklist`; non-chat models are omitted.
- **API key** is written as `{env:<PROVIDER>_API_KEY}` by default; the web UI never stores the key.
- **VS Code Copilot** uses the [Custom Endpoint provider](https://code.visualstudio.com/docs/agent-customization/language-models#_add-a-custom-endpoint-model) (`vendor: "customendpoint"`). The API is set per model (see APIs). Run **Chat: Manage Language Models** → Add Models → Custom Endpoint, then merge the generated object into the `chatLanguageModels.json` VS Code opens. The key is written as `${input:<provider>ApiKey}` by default so VS Code prompts for it instead of storing it in the file. Only enabled chat models are emitted; `maxInputTokens + maxOutputTokens` equals the context window, with output capped at half of it. Effort-style variants become `supportsReasoningEffort`, with `reasoningEffortFormat` matching the API; on/off thinking dialects have no VS Code equivalent and only set `thinking: true`.
- **Cherry Studio deep link** only carries the provider connection and requires a key; model capabilities are in the bundle JSON. With several APIs there are several deep links; import each one.
- `/api/models` forwards requests to arbitrary URLs — do not expose it publicly.

## Extending

New rule: insert it into `RULES` in `src/core/knowledge.js` (more specific first) and add a row to `CASES` in `test/enrich.test.js`. Add `doc: '<official page>'` only when every value in `set` comes from the vendor's docs; those values then override the upstream and show an "Official" badge linking to the page:

```js
{ key: 'vendor:model-x', match: /model-x/, set: { family: 'vendor', context: 262144, output: 65536, reasoning: 'hybrid', control: 'thinking-type', efforts: ['enabled', 'disabled'], vision: true } },
```

New client: write a `(models, provider) => config` function in `src/core/adapters/` and register it in `TARGETS` in `src/core/pipeline.js`.

New strings: core in `src/core/i18n.js`, UI in `web/src/i18n.js`, CLI in `bin/cli.js`; add every key in both languages.
