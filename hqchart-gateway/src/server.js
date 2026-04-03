import express from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { loadConfig } from './config.js';

export function createApp() {
  const app = express();

  app.use((req, res, next) => {
    const requestId = req.get('X-Request-Id') ?? uuidv4();
    res.setHeader('X-Request-Id', requestId);
    next();
  });

  app.get('/api/hqchart/health/live', (_req, res) => {
    res.status(200).json({ ok: true });
  });

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
