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

export function createApp({ watchlistService, hqchartDataService } = {}) {
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
      defaultHqchartDataService = createHqchartDataService();
    }

    return defaultHqchartDataService;
  });

  app.use(express.json());
  app.use(traceIdMiddleware);

  app.get('/api/hqchart/health/live', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.use('/api/hqchart', createMarketRouter({ hqchartDataService: marketDataService }));
  app.use('/api/hqchart/watchlist', createWatchlistRouter({ watchlistService: service }));
  app.use(errorHandler);

  return app;
}

export function startServer(config = loadConfig()) {
  const app = createApp(config);
  return app.listen(config.port, () => {
    console.log(`hqchart-gateway listening on port ${config.port}`);
  });
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  startServer();
}
