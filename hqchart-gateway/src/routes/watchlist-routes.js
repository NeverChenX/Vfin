import express from 'express';

function resolveWatchlistService(watchlistService) {
  return typeof watchlistService === 'function' ? watchlistService() : watchlistService;
}

function sendError(res, error) {
  if (error?.statusCode === 400) {
    return res.status(400).json({ error: error.message });
  }

  console.error(error);
  return res.status(500).json({ error: 'Internal server error' });
}

export function createWatchlistRouter({ watchlistService }) {
  const router = express.Router();

  router.get('/', (_req, res) => {
    try {
      return res.status(200).json({ items: resolveWatchlistService(watchlistService).list() });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post('/', (req, res) => {
    try {
      return res.status(200).json({ item: resolveWatchlistService(watchlistService).add(req.body?.symbol) });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.delete('/:symbol', (req, res) => {
    try {
      return res.status(200).json({ removed: resolveWatchlistService(watchlistService).remove(req.params.symbol) });
    } catch (error) {
      return sendError(res, error);
    }
  });

  return router;
}
