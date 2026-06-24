import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHqchartDataService } from '../services/hqchart-data-service.js';
import { fetchText } from '../providers/http-client.js';
import { normalizeSymbol } from '../services/symbol-normalizer.js';
import iconv from 'iconv-lite';

function loadTradeRecords() {
  const tradeMap = new Map();
  // 查找 HT_History 文件
  // C2: previously hard-coded to /home/Neverchen/project/invest/raw_data which
  // leaked a sibling project path and broke on any other machine. Now ENV-only
  // — if unset, trade marks are silently disabled instead of pointing at
  // someone else's filesystem.
  const investDir = process.env.INVEST_DATA_DIR;
  if (!investDir) {
    return tradeMap;
  }
  // Reject obviously malicious paths (relative segments / NUL) early.
  if (investDir.includes('\0') || investDir.includes('..')) {
    console.error('[trades] INVEST_DATA_DIR rejected (suspicious path)');
    return tradeMap;
  }
  let historyFile = null;

  try {
    const files = fs.readdirSync(investDir);
    historyFile = files.find(f => f.startsWith('HT_History') && f.endsWith('.xls'));
  } catch (_e) {
    console.log('[trades] INVEST_DATA_DIR not readable, trade marks disabled');
    return tradeMap;
  }

  if (!historyFile) {
    console.log('[trades] no HT_History*.xls found, trade marks disabled');
    return tradeMap;
  }

  try {
    const raw = fs.readFileSync(path.join(investDir, historyFile));
    const text = iconv.decode(raw, 'gbk');
    const lines = text.trim().split('\n');

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].trim().split('\t');
      if (cols.length < 8) continue;
      const op = cols[4] || '';
      if (!op.includes('买入') && !op.includes('卖出')) continue;

      const dateStr = cols[0];
      const code = cols[2];
      const name = cols[3];
      const type = op.includes('买入') ? 'buy' : 'sell';
      const qty = Math.abs(parseFloat(cols[5]) || 0);
      const price = parseFloat(cols[6]) || 0;
      const amount = parseFloat(cols[7]) || 0;

      // 使用 normalizeSymbol 获取正确的 symbol
      let symbol;
      try {
        const normalized = normalizeSymbol(code);
        symbol = normalized.symbol;
      } catch (_e) {
        continue; // skip unknown codes
      }

      const trade = { date: parseInt(dateStr), type, qty, price, amount, name };
      if (!tradeMap.has(symbol)) tradeMap.set(symbol, []);
      tradeMap.get(symbol).push(trade);
    }

    console.log(`[trades] loaded ${Array.from(tradeMap.values()).reduce((s, a) => s + a.length, 0)} trades for ${tradeMap.size} symbols`);
  } catch (err) {
    console.error('[trades] failed to parse trade file:', err.message);
  }

  return tradeMap;
}

export function createMarketRouter({ hqchartDataService, breadthService, hkConnectService, sectorsService } = {}) {
  const router = Router();
  const resolveService = () => {
    if (typeof hqchartDataService === 'function') {
      return hqchartDataService();
    }
    return hqchartDataService ?? createHqchartDataService();
  };
  const resolveBreadth = () =>
    typeof breadthService === 'function' ? breadthService() : breadthService;
  const resolveHkConnect = () =>
    typeof hkConnectService === 'function' ? hkConnectService() : hkConnectService;
  const resolveSectors = () =>
    typeof sectorsService === 'function' ? sectorsService() : sectorsService;

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
    let localItems = [];
    try {
      const q = (req.query.q || '').trim();
      if (!q) return res.json({ items: [] });

      const lowerQ = q.toLowerCase();
      if (['btc', 'bitcoin', '比特币'].some((alias) => alias.includes(lowerQ) || lowerQ.includes(alias))) {
        localItems.push({
          symbol: 'BTCUSD.crypto',
          code: 'BTC',
          name: '比特币',
          market: 'crypto',
          typeLabel: '数字货币'
        });
      }

      // 新浪 suggest API; type: 11=A股 12=指数 13=板块 14=沪基金 15=深基金 31=港股 41=美股 81=可转债
      const url = `https://suggest3.sinajs.cn/suggest/type=11,12,13,14,15,31,41,81&key=${encodeURIComponent(q)}`;
      const buf = await fetchText(url, {
        headers: { Referer: 'https://finance.sina.com.cn/', 'User-Agent': 'Mozilla/5.0' },
        responseType: 'arrayBuffer'
      });
      const text = iconv.decode(Buffer.from(buf), 'gbk');

      // 格式: var suggestvalue="名称或市场代码, 类型, 代码, 完整代码, 名称, ...;..."
      const match = text.match(/suggestvalue="([^"]*)"/);
      if (!match) return res.json({ items: [] });

      const TYPE_LABEL = { '11': '', '12': '指数', '13': '板块', '14': '基金', '15': '基金', '31': '港股', '41': '美股', '81': '可转债' };

      const items = match[1].split(';').filter(Boolean).slice(0, 12).map(part => {
        const cols = part.split(',');
        const type = cols[1] || '';
        const code = cols[2] || '';
        const fullCode = cols[3] || '';
        const name = (cols[4] || cols[0] || '').trim();
        if (!code || !name) return null;

        let symbol, market;
        if (type === '41') {
          // 美股：code 是小写 symbol，转为 AAPL.us 格式（保留 BRK.B 等子类点号）
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

      // 去重：新浪 suggest 对 BRK.B 类股票同时返回 brk.b 与 brkb 两条；
      // brkb 是无效占位符，优先保留含点号的规范代码
      const dedupedItems = (() => {
        const groups = new Map();
        for (const item of items) {
          const key = `${item.market}:${item.code.replace(/\./g, '')}`;
          const prev = groups.get(key);
          if (!prev || (item.code.includes('.') && !prev.code.includes('.'))) {
            groups.set(key, item);
          }
        }
        return [...groups.values()];
      })();

      res.json({ items: [...localItems, ...dedupedItems] });
    } catch (err) {
      res.json({ items: localItems });
    }
  });

  // 交易记录 API：懒加载 + 5 分钟内存缓存，避免启动时 fs.readFileSync 大 xls 阻塞
  const TRADE_TTL_MS = 5 * 60_000;
  let tradeCache = null;       // Map<symbol, trade[]>
  let tradeCacheAt = 0;
  function getTradeMap() {
    if (tradeCache && Date.now() - tradeCacheAt < TRADE_TTL_MS) return tradeCache;
    tradeCache = loadTradeRecords();
    tradeCacheAt = Date.now();
    return tradeCache;
  }

  router.get('/trades', (req, res) => {
    const symbol = (req.query.symbol || '').toLowerCase();
    const trades = getTradeMap().get(symbol) || [];
    res.json({ trades });
  });

  router.get('/stock', createHandler('getQuote'));
  router.get('/minute', createHandler('getMinute'));
  router.get('/kline', createHandler('getKline'));
  router.get('/capital', createHandler('getCapital'));
  router.get('/callauction', createHandler('getCallauction'));
  router.get('/trade-detail', createHandler('getTradeDetail'));
  router.get('/news', createHandler('getNews'));
  router.get('/announcements', createHandler('getAnnouncements'));

  // Phase 2: market breadth (沪深 A 股 up/down/limit-up/limit-down 聚合)
  router.get('/breadth', async (req, res, next) => {
    const svc = resolveBreadth();
    if (!svc) {
      return res.status(503).json({ error: 'breadth service not configured' });
    }
    try {
      const market = (req.query.market || 'cn').toString();
      const data = await svc.get(market);
      return res.status(200).json(data);
    } catch (err) {
      return next(err);
    }
  });

  // Phase 2: 申万一级 31 行业实时涨跌（push2delay 拉 BK 板块数据）
  router.get('/sectors', async (_req, res, next) => {
    const svc = resolveSectors();
    if (!svc) {
      return res.status(503).json({ error: 'sectors service not configured' });
    }
    try {
      const data = await svc.get();
      return res.status(200).json({ items: data });
    } catch (err) {
      return next(err);
    }
  });

  // Phase 2: Stock-Connect 南向 / 北向当日净流入
  router.get('/hk-connect', async (_req, res, next) => {
    const svc = resolveHkConnect();
    if (!svc) {
      return res.status(503).json({ error: 'hk-connect service not configured' });
    }
    try {
      const data = await svc.get();
      return res.status(200).json(data);
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
