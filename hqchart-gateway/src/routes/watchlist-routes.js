import express from 'express';

function resolveWatchlistService(watchlistService) {
  return typeof watchlistService === 'function' ? watchlistService() : watchlistService;
}

export function createWatchlistRouter({ watchlistService }) {
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
      return res.status(200).json({ item: resolveWatchlistService(watchlistService).add(req.body?.symbol) });
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

  return router;
}
