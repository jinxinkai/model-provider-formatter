import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { createApp } from './server/app.js';

/**
 * 开发时把 Koa 应用挂进 Vite，`npm run dev` 单进程即可同时提供页面与 /api。
 * @returns {import('vite').Plugin}
 */
const koaApi = () => ({
  name: 'koa-api',
  configureServer(server) {
    const handle = createApp().callback();
    server.middlewares.use((req, res, next) => (req.url.startsWith('/api/') ? handle(req, res) : next()));
  },
});

export default defineConfig({
  root: 'web',
  // 相对路径：同一份产物既能由 Koa 在根路径托管，也能部署到 GitHub Pages 的 /<repo>/ 子路径
  base: './',
  plugins: [vue(), koaApi()],
  resolve: { alias: { '@core': fileURLToPath(new URL('./src/core', import.meta.url)) } },
  build: { outDir: '../dist', emptyOutDir: true },
  server: { port: 15173 },
});
