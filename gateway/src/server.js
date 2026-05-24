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

function corsMiddleware(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.header(
    'Access-Control-Allow-Headers',
    req.header('Access-Control-Request-Headers') || 'Content-Type, X-Request-Id, X-Trace-Id'
  );

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
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

  app.use(corsMiddleware);
  app.use(traceIdMiddleware);
  app.use(express.json());

  // ⚠ 不再挂载 express.static — 原本指向 path.resolve(..., '../../../../') 实际是
  //   /home/Neverchen/project，会把整个 VFin 同级目录（含 .env / 其他项目源码 / 用户数据）
  //   全部当静态资源对外暴露（standalone 18080 端口下可直接 GET /any/path）。
  //   静态资源（HQChart bundle、hq-classic 单页等）已由 Next.js 的 public/ 处理。
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

  app.get('/api/health/live', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  // 根路径：直接 302 到 web 前端，避免用户误访问看到 "Cannot GET /"
  app.get('/', (req, res) => {
    const target =
      process.env.WEB_URL ||
      `http://${(req.hostname || 'localhost').replace(/:\d+$/, '')}:3816`;
    res.redirect(302, target);
  });

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
