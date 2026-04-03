import { Router } from 'express';
import { createHqchartDataService } from '../services/hqchart-data-service.js';

export function createMarketRouter({ hqchartDataService } = {}) {
  const router = Router();
  let defaultHqchartDataService;

  const serviceFactory = hqchartDataService ?? (() => {
    if (!defaultHqchartDataService) {
      defaultHqchartDataService = createHqchartDataService();
    }

    return defaultHqchartDataService;
  });

  function resolveService() {
    return typeof serviceFactory === 'function' ? serviceFactory() : serviceFactory;
  }

  function createHandler(methodName) {
    return (req, res, next) => {
      Promise.resolve()
        .then(() => resolveService()[methodName](req.query))
        .then((data) => {
          res.status(200).json(data);
        })
        .catch(next);
    };
  }

  router.get('/stock', createHandler('getQuote'));
  router.get('/minute', createHandler('getMinute'));
  router.get('/kline', createHandler('getKline'));
  router.get('/capital', createHandler('getCapital'));
  router.get('/callauction', createHandler('getCallauction'));
  router.get('/trade-detail', createHandler('getTradeDetail'));
  router.get('/news', createHandler('getNews'));
  router.get('/announcements', createHandler('getAnnouncements'));

  return router;
}
