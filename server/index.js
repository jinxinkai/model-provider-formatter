#!/usr/bin/env node
/**
 * @file 生产入口：提供 dist/ 与 /api。
 * 默认只监听 127.0.0.1——/api/models 会向任意地址转发请求，不应暴露到公网。
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';

const PORT = Number(process.env.PORT) || 15178;
const HOST = process.env.HOST || '127.0.0.1';
const DIST = fileURLToPath(new URL('../dist', import.meta.url));

if (!existsSync(DIST)) console.warn('⚠ 未找到 dist/，只提供 /api。请先运行 npm run build（开发时用 npm run dev）。');

createApp({ staticDir: DIST }).listen(PORT, HOST, () => {
  console.log(`Model Provider Formatter → http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
});
