import { Router } from 'express';
import { createHqchartDataService } from '../services/hqchart-data-service.js';
import { fetchText } from '../providers/http-client.js';
import iconv from 'iconv-lite';

export function createMarketRouter({ hqchartDataService } = {}) {
  const router = Router();
  const resolveService = () => {
    if (typeof hqchartDataService === 'function') {
      return hqchartDataService();
    }
    return hqchartDataService ?? createHqchartDataService();
  };

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

  router.get('/search', async (req, res) => {
    try {
      const q = (req.query.q || '').trim();
      if (!q) return res.json({ items: [] });

      // 新浪 suggest API; type: 11=A股 12=指数 13=板块 14=沪基金 15=深基金 31=港股 41=美股
      const url = `https://suggest3.sinajs.cn/suggest/type=11,12,13,14,15,31,41&key=${encodeURIComponent(q)}`;
      const buf = await fetchText(url, {
        headers: { Referer: 'https://finance.sina.com.cn/', 'User-Agent': 'Mozilla/5.0' },
        responseType: 'arrayBuffer'
      });
      const text = iconv.decode(Buffer.from(buf), 'gbk');

      // 格式: var suggestvalue="名称或市场代码, 类型, 代码, 完整代码, 名称, ...;..."
      const match = text.match(/suggestvalue="([^"]*)"/);
      if (!match) return res.json({ items: [] });

      const TYPE_LABEL = { '11': '', '12': '指数', '13': '板块', '14': '基金', '15': '基金', '31': '港股', '41': '美股' };

      const items = match[1].split(';').filter(Boolean).slice(0, 12).map(part => {
        const cols = part.split(',');
        const type = cols[1] || '';
        const code = cols[2] || '';
        const fullCode = cols[3] || '';
        const name = (cols[4] || cols[0] || '').trim();
        if (!code || !name) return null;

        let symbol, market;
        if (type === '41') {
          // 美股：code 是小写 symbol，转为 AAPL.us 格式
          symbol = `${code.toUpperCase()}.us`;
          market = 'us';
        } else if (type === '31') {
          // 港股：code 即为港股代码
          symbol = `${code}.hk`;
          market = 'hk';
        } else {
          market = fullCode.slice(0, 2);  // sh / sz
          if (!market) return null;
          symbol = `${code}.${market}`;
        }

        const typeLabel = TYPE_LABEL[type] || '';
        return { symbol, code: code.toUpperCase(), name, market, typeLabel };
      }).filter(Boolean);

      res.json({ items });
    } catch (err) {
      res.json({ items: [] });
    }
  });

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
