# Model Provider Formatter

English | [中文](README.zh-CN.md)

Turns an OpenAI-compatible `/v1/models` list (or an OpenAPI document) into ready-to-use configs for **OpenCode** (`opencode.json`) and **Cherry Studio** (import bundle + deep link).

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

GitHub Pages: <https://jinxinkai.github.io/model-provider-formatter/>. Every push to `main` runs `.github/workflows/ci.yml` (test → static build → deploy). The Pages build (`VITE_STATIC=true`) has no Koa proxy, so "Fetch API" calls the upstream straight from the browser and only works when the upstream allows CORS; Paste and File work everywhere.

CLI:

```bash
node bin/cli.js -u https://api.example.com/v1 -k sk-xxx -o opencode.json
node bin/cli.js -i models.json -b https://api.example.com/v1 -t cherry --report
node bin/cli.js --help --lang en
```

The CLI language comes from `--lang`, then `MPF_LANG`, then the system locale.

## Architecture

```
input → ingest → enrich + knowledge → NormalizedModel → adapters → Web / CLI
```

| Module | Responsibility |
|---|---|
| `src/core/ingest.js` | Parses `/v1/models`, arrays, `{ models: [] }`, OpenRouter / LiteLLM fields, OpenAPI / Swagger (JSON/YAML); `0` counts as missing |
| `src/core/enrich.js` | Precedence: **manual > upstream > rule > default**, with per-field source tracking; clamps output to context; builds variants |
| `src/core/knowledge.js` | Ordered regex rules; each field takes the first matching rule |
| `src/core/adapters/` | OpenCode / Cherry Studio output |
| `src/core/i18n.js` | Core messages and the translatable `AppError` |
| `web/` | Vue 3 frontend; state in `store.js`, UI strings in `i18n.js` |
| `server/app.js` | Koa: `GET /api/health`, `POST /api/models` (upstream proxy, errors follow `Accept-Language`), serves `dist/` |
| `bin/cli.js` | Command line |

## Reasoning variants

Variant contents are passed as request parameters to `@ai-sdk/openai-compatible`. By default they follow each vendor's dialect:

| Family | Parameter | Variants |
|---|---|---|
| GPT-5.x / o-series / Claude / Gemini | `reasoningEffort` | `low` `medium` `high` (plus `minimal` / `none` / `xhigh` per model) |
| DeepSeek V3.1+ / GLM 4.5+ / Kimi K2.5+ | `thinking: { type }` | `thinking` `no-thinking` |
| Doubao Seed 1.6 / 2.x | `thinking: { type }` | `thinking` `no-thinking` `auto` |
| Qwen3 / 3.5+ | `enable_thinking` | `thinking` `no-thinking` |

Always-thinking and non-reasoning models get no variants. DeepSeek / GLM / Kimi reasoning models also get `interleaved: { field: "reasoning_content" }`.

## Notes

- **Disabled models go to `blacklist`**: OpenCode's model schema rejects a `disabled` key. Disabled chat models stay in `models` and are listed in `blacklist`; non-chat models are omitted.
- **API key** is written as `{env:<PROVIDER>_API_KEY}` by default; the web UI never stores the key.
- **Cherry Studio deep link** only carries the provider connection and requires a key; model capabilities are in the bundle JSON.
- `/api/models` forwards requests to arbitrary URLs — do not expose it publicly.

## Extending

New rule: insert it into `RULES` in `src/core/knowledge.js` (more specific first) and add a row to `CASES` in `test/enrich.test.js`:

```js
{ key: 'vendor:model-x', match: /model-x/, set: { family: 'vendor', context: 262144, output: 65536, reasoning: 'hybrid', control: 'thinking-type', efforts: ['enabled', 'disabled'], vision: true } },
```

New client: write a `(models, provider) => config` function in `src/core/adapters/` and register it in `TARGETS` in `src/core/pipeline.js`.

New strings: core in `src/core/i18n.js`, UI in `web/src/i18n.js`, CLI in `bin/cli.js`; add every key in both languages.
