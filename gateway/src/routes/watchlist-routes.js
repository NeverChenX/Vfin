import express from 'express';
import fs from 'node:fs';
import path from 'node:path';

function resolveWatchlistService(watchlistService) {
  return typeof watchlistService === 'function' ? watchlistService() : watchlistService;
}

export function createWatchlistRouter({ watchlistService, projectRoot }) {
  const router = express.Router();

  router.get('/', (_req, res, next) => {
    try {
      return res.status(200).json({ items: resolveWatchlistService(watchlistService).list() });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/', (req, res, next) => {
    try {
      const category = req.body?.category || '自选股';
      return res.status(200).json({ item: resolveWatchlistService(watchlistService).add(req.body?.symbol, category) });
    } catch (error) {
      return next(error);
    }
  });

  router.delete('/:symbol', (req, res, next) => {
    try {
      return res.status(200).json({ removed: resolveWatchlistService(watchlistService).remove(req.params.symbol) });
    } catch (error) {
      return next(error);
    }
  });

  // H14: in-flight dedup — user clicks "sync" twice in a row would otherwise
  // race two independent reads-and-writes against watchlist DB. One flag per
  // process is enough; multi-process deployments should add a Redis lock.
  let syncInFlight = false;
  // 真同步：把"我的持仓"分类与 portfolio_data.json 对齐 —— 多余的删，缺失的加，其他分类不动
  router.post('/sync-portfolio', (req, res, next) => {
    if (syncInFlight) {
      return res.status(409).json({ error: 'sync already in progress' });
    }
    syncInFlight = true;
    try {
      // C2: ENV-only — was hard-coded to a sibling project path. Endpoint
      // now 400s if PORTFOLIO_DATA_PATH is not configured, so we never read
      // /home/Neverchen/project/invest/* by accident on a fresh deploy.
      const portfolioPath = process.env.PORTFOLIO_DATA_PATH;
      if (!portfolioPath) {
        return res.status(400).json({
          error: 'PORTFOLIO_DATA_PATH env not configured; sync-portfolio disabled',
        });
      }
      if (portfolioPath.includes('\0') || portfolioPath.includes('..')) {
        return res.status(400).json({ error: 'invalid PORTFOLIO_DATA_PATH' });
      }
      if (!fs.existsSync(portfolioPath)) {
        return res.status(404).json({ error: `portfolio file not found` });
      }

      const data = JSON.parse(fs.readFileSync(portfolioPath, 'utf-8'));
      const stocks = data.stocks || [];
      const symbols = [];

      for (const s of stocks) {
        if (!s.code || s.code === '现金') continue;
        const mkt = s.mkt;
        if (mkt === '港股') {
          symbols.push(`${s.code.padStart(5, '0')}.hk`);
        } else if (mkt === 'A股') {
          symbols.push(s.code); // normalizeSymbol will add .sh/.sz
        }
      }

      const svc = resolveWatchlistService(watchlistService);
      const result = svc.syncCategory(symbols, '我的持仓');
      return res.status(200).json({
        imported: result.added.length,
        removed: result.removed.length,
        removedSymbols: result.removed,
        items: result.items
      });
    } catch (error) {
      return next(error);
    } finally {
      // H14: always release the in-flight flag, even on errors / early returns.
      syncInFlight = false;
    }
  });

  return router;
}
