/**
 * @file Koa 应用：/api 路由 + 可选的前端静态资源。
 * 以工厂函数导出，Vite 开发服务器和测试可直接挂载而无需监听端口。
 */

import Koa from 'koa';
import { Router } from '@koa/router';
import { bodyParser } from '@koa/bodyparser';
import serve from 'koa-static';
import { fetchModels } from '../src/core/fetch.js';
import { t, localize } from '../src/core/i18n.js';

/**
 * 按 Accept-Language 选择响应语言，无法匹配时用中文。
 * @param {Koa.Context} ctx
 * @returns {import('../src/core/i18n.js').Locale}
 */
const langOf = (ctx) => ctx.acceptsLanguages('zh', 'en') || 'zh';

/**
 * 把异常转换为 JSON；仅对外暴露 ctx.throw 中标记为 expose 的信息。
 * @type {Koa.Middleware}
 */
async function jsonErrors(ctx, next) {
  try {
    await next();
  } catch (err) {
    ctx.status = err.status || 500;
    ctx.body = { error: err.expose ? err.message : t(langOf(ctx), 'api.internal') };
    if (!err.expose) console.error(err);
  }
}

/**
 * /api 路由。
 * @returns {Router}
 */
function apiRouter() {
  const router = new Router({ prefix: '/api' });

  router.get('/health', (ctx) => {
    ctx.body = { ok: true };
  });

  // 代理上游 GET /models，绕过浏览器 CORS；Key 只转发不存储
  router.post('/models', async (ctx) => {
    const { url, apiKey } = ctx.request.body || {};
    if (typeof url !== 'string' || !url.trim()) ctx.throw(400, t(langOf(ctx), 'api.missingUrl'));
    try {
      ctx.body = await fetchModels(url, typeof apiKey === 'string' ? apiKey : '');
    } catch (err) {
      ctx.throw(err.key === 'input.badUrl' ? 400 : 502, localize(err, langOf(ctx)), { expose: true });
    }
  });

  return router;
}

/**
 * Vite 产物中 /assets 下的文件名带内容哈希，可永久缓存；其余文件每次重新校验。
 * @param {import('node:http').ServerResponse} res
 * @param {string} path
 */
function cacheHeaders(res, path) {
  res.setHeader('Cache-Control', /[\\/]assets[\\/]/.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache');
}

/**
 * 创建 Koa 应用。
 * @param {{ staticDir?: string }} [opts] staticDir 为前端构建目录（dist/），省略时只提供 /api
 * @returns {Koa}
 */
export function createApp({ staticDir } = {}) {
  const app = new Koa();
  const router = apiRouter();
  app.use(jsonErrors);
  app.use(bodyParser({ jsonLimit: '1mb', enableTypes: ['json'] }));
  app.use(router.routes());
  app.use(router.allowedMethods());
  if (staticDir) app.use(serve(staticDir, { setHeaders: cacheHeaders }));
  return app;
}
