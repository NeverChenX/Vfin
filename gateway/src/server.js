import express from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadConfig } from './config.js';
import { errorHandler } from './middleware/error-handler.js';
import { traceIdMiddleware } from './middleware/trace-id.js';
import { createMarketRouter } from './routes/market-routes.js';
import { createWatchlistRouter } from './routes/watchlist-routes.js';
import { createHqchartDataService } from './services/hqchart-data-service.js';
import { createWatchlistService } from './services/watchlist-service.js';
import { createProviderRegistry } from './providers/provider-registry.js';

// C1: strict CORS.
// Under the unified server (web/server.mjs), browsers see the gateway on the
// same origin (:3816) and need no CORS header at all. Cross-origin callers
// must be explicitly whitelisted via GATEWAY_ALLOW_ORIGINS (comma-separated)
// or GATEWAY_ALLOW_ALL=1 (only for trusted private LAN deployments).
const ALLOWED_ORIGINS = new Set(
  (process.env.GATEWAY_ALLOW_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
);
const ALLOW_ALL = process.env.GATEWAY_ALLOW_ALL === '1';

function corsMiddleware(req, res, next) {
  const origin = req.header('Origin') || '';
  const allowed = ALLOW_ALL || (origin && ALLOWED_ORIGINS.has(origin));
  if (allowed) {
    res.header('Access-Control-Allow-Origin', ALLOW_ALL ? '*' : origin);
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    res.header(
      'Access-Control-Allow-Headers',
      req.header('Access-Control-Request-Headers') || 'Content-Type, X-Request-Id, X-Trace-Id'
    );
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(allowed ? 204 : 403);
  }

  return next();
}

export function createApp({ watchlistService, hqchartDataService, providerOrder, providerMode } = {}) {
  const app = express();
  let defaultWatchlistService;
  let defaultHqchartDataService;
  const service = watchlistService ?? (() => {
    if (!defaultWatchlistService) {
      defaultWatchlistService = createWatchlistService();
    }

    return defaultWatchlistService;
  });
  const marketDataService = hqchartDataService ?? (() => {
    if (!defaultHqchartDataService) {
      const order = providerOrder && providerOrder.length ? providerOrder : ['sina', 'tencent'];
      const registry = createProviderRegistry({ primary: order[0], fallback: order.slice(1) });
      defaultHqchartDataService = createHqchartDataService({ providerRegistry: registry, providerMode });
    }

    return defaultHqchartDataService;
  });

  app.disable('x-powered-by');
  app.use(corsMiddleware);
  app.use(traceIdMiddleware);
  // M13: 64kb body limit — terminal-style API never sends large payloads.
  app.use(express.json({ limit: '64kb' }));

  // ⚠ 不再挂载 express.static — 原本指向 path.resolve(..., '../../../../') 实际是
  //   /home/Neverchen/project，会把整个 VFin 同级目录（含 .env / 其他项目源码 / 用户数据）
  //   全部当静态资源对外暴露（standalone 18080 端口下可直接 GET /any/path）。
  //   静态资源（HQChart bundle、hq-classic 单页等）已由 Next.js 的 public/ 处理。
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

  app.get('/api/health/live', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  // H3: removed the GET / 302 redirect. Under the unified server the root path
  // is owned by Next.js (web/server.mjs only forwards /api/hq/* here), so this
  // route was unreachable in production and harmful when the gateway was
  // accidentally exposed standalone (it would 302 callers to a hardcoded
  // host:3816 — wrong on reverse-proxy / cloudflared deployments). Standalone
  // health check is /api/health/live; the rest is not a public surface.

  app.use('/api', createMarketRouter({ hqchartDataService: marketDataService }));
  app.use('/api/watchlist', createWatchlistRouter({ watchlistService: service, projectRoot }));
  app.use(errorHandler);

  return app;
}

export function startServer(config = loadConfig()) {
  const app = createApp({
    providerOrder: config.providerOrder,
    providerMode: config.providerMode
  });
  return app.listen(config.port, () => {
    console.log(`vfin-gateway listening on port ${config.port}`);
  });
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  startServer();
}
