import { BaseProvider } from './base-provider.js';
import { fetchJson } from './http-client.js';
import {
  parseEastmoneyTradeDetail,
  parseEastmoneyAnnouncements,
  parseEastmoneyCapital,
  parseEastmoneyKline,
  parseEastmoneyIntlIndex,
  parseEastmoneyHkQuote
} from './live-mappers.js';
import { createTimestamp } from '../utils/time.js';

// secid for non-US international indices on eastmoney push2 API.
// scale=100 means quotes come in centi-units and need /100.
const EASTMONEY_INTL_SECID = {
  'DAX.de':  { secid: '100.GDAXI', scale: 100 },
  'FTSE.uk': { secid: '100.FTSE',  scale: 100 }
};

function buildEastmoneySecId({ market, symbol }) {
  const lastDot = symbol?.lastIndexOf('.') ?? -1;
  const code = lastDot > 0 ? symbol.slice(0, lastDot) : symbol;
  if (market === 'sh') return `1.${code}`;
  if (market === 'sz') return `0.${code}`;
  if (market === 'us') return `105.${code}`;
  if (market === 'hk') {
    // HK stocks (numeric codes like 01810) → 116. prefix, padded to 5 digits.
    // HK indices (alphabetic codes like HSI / HSCEI / HSTECH) → 100. prefix,
    // no padding. `padStart` on `HSI` would yield `00HSI` (404).
    if (/^\d+$/.test(code)) return `116.${code.padStart(5, '0')}`;
    return `100.${code}`;
  }
  return null;
}

function resolveEastmoneyPeriod(period) {
  // klt: 101=日线 102=周线 103=月线 104=年线
  //       1=1分钟 5=5分钟 15=15分钟 30=30分钟 60=60分钟
  const map = {
    'day': 101, 'week': 102, 'month': 103, 'year': 104,
    '1m': 1, '5m': 5, '15m': 15, '30m': 30, '60m': 60
  };
  return map[period] || 101;
}

export class EastmoneyProvider extends BaseProvider {
  constructor() {
    super({ name: 'eastmoney' });
  }

  /**
   * Quote support:
   *   - HK stocks (.hk) — real-time via push2 (tencent's free HK feed is
   *     15-min delayed and is the reason this branch exists at all)
   *   - International indices DAX (.de) / FTSE (.uk) via push2
   *   - Everything else throws UNSUPPORTED so registry falls back to
   *     sina/tencent without raising a client error.
   */
  async fetchQuote(context) {
    this.ensureMockableMode(context.providerMode, 'quote');

    if (context.market === 'hk') {
      return this.#fetchHkQuote(context);
    }

    const cfg = EASTMONEY_INTL_SECID[context.symbol];
    if (!cfg) {
      throw this.createError(
        `Eastmoney quote: unsupported symbol "${context.symbol}"`,
        { statusCode: 502, code: 'UNSUPPORTED_PROVIDER_OPERATION' }
      );
    }

    if (context.providerMode !== 'live') {
      return {
        symbol: context.symbol,
        market: context.market,
        name: 'Mock Index',
        now: 1000,
        prevClose: 990,
        open: 995,
        high: 1010,
        low: 990,
        volume: 0,
        turnover: 0,
        timestamp: createTimestamp()
      };
    }

    const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${cfg.secid}&fields=f43,f44,f45,f46,f57,f58,f60`;
    try {
      const json = await fetchJson(url);
      const q = parseEastmoneyIntlIndex(json, cfg.scale);
      return {
        symbol: context.symbol,
        market: context.market,
        name: q.name,
        now: q.price,
        prevClose: q.prevClose,
        open: q.open,
        high: q.high,
        low: q.low,
        volume: 0,
        turnover: 0,
        timestamp: createTimestamp()
      };
    } catch (error) {
      throw this.createError(`Eastmoney intl-quote failed: ${error.message}`, { cause: error });
    }
  }

  async #fetchHkQuote(context) {
    if (context.providerMode !== 'live') {
      return {
        symbol: context.symbol,
        market: 'hk',
        name: `Mock HK ${context.symbol}`,
        now: 28.5,
        prevClose: 28.04,
        open: 28.04,
        high: 28.72,
        low: 28.04,
        volume: 29800000,
        turnover: 846754880,
        timestamp: createTimestamp()
      };
    }

    const secid = buildEastmoneySecId(context);
    if (!secid) {
      throw this.createError(
        `Eastmoney HK quote: cannot build secid for "${context.symbol}"`,
        { statusCode: 502, code: 'UNSUPPORTED_PROVIDER_OPERATION' }
      );
    }
    const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f43,f44,f45,f46,f47,f48,f57,f58,f59,f60,f86`;
    // Eastmoney push2 frequently closes connections under burst load (the
    // homepage polls all HK symbols every 5s with concurrency 6). One quick
    // retry recovers from the common SocketError "other side closed" without
    // letting the user fall back to Tencent's pre-market-frozen snapshot,
    // which is what the original "01810 stuck at +0.00%" bug looked like.
    let lastErr;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const json = await fetchJson(url);
        const q = parseEastmoneyHkQuote(json);
        return {
          symbol: context.symbol,
          market: 'hk',
          name: q.name,
          now: q.price,
          prevClose: q.prevClose,
          open: q.open,
          high: q.high,
          low: q.low,
          volume: q.volume,
          turnover: q.turnover,
          timestamp: q.time
        };
      } catch (error) {
        lastErr = error;
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }
    }
    throw this.createError(`Eastmoney HK quote failed: ${lastErr?.message ?? 'unknown'}`, { cause: lastErr });
  }

  async fetchKline(context) {
    this.ensureMockableMode(context.providerMode, 'kline');
    if (context.providerMode !== 'live') {
      return {
        code: context.symbol,
        market: context.market,
        cycle: context.period ?? 'day',
        list: [
          { date: '2026-04-01', open: 12, high: 12.5, low: 11.9, close: 12.2, volume: 110000, amount: 1342000 },
          { date: '2026-04-02', open: 12.2, high: 12.4, low: 12.1, close: 12.28, volume: 98000, amount: 1204800 }
        ],
        time: createTimestamp()
      };
    }

    const secid = buildEastmoneySecId(context);
    if (!secid) {
      throw this.createError(`Eastmoney kline: unsupported market "${context.market}"`, {
        statusCode: 502,
        code: 'UNSUPPORTED_PROVIDER_OPERATION'
      });
    }

    const klt = resolveEastmoneyPeriod(context.period);
    const count = Number(context.count ?? 200);
    // fqt: 0=不复权 1=前复权 2=后复权
    const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58&klt=${klt}&fqt=0&end=20500101&lmt=${count}`;
    try {
      const json = await fetchJson(url);
      const parsed = parseEastmoneyKline(json?.data ?? {});
      return {
        code: context.symbol,
        market: context.market,
        cycle: context.period ?? 'day',
        list: parsed.list,
        time: createTimestamp()
      };
    } catch (error) {
      throw this.createError(`Eastmoney kline failed: ${error.message}`, { cause: error });
    }
  }

  async fetchCapital(context) {
    this.ensureMockableMode(context.providerMode, 'capital');
    if (context.providerMode !== 'live') {
      return {
        code: context.symbol,
        market: context.market,
        flows: {
          main: 1200000,
          large: 560000,
          medium: -210000,
          small: -430000
        },
        time: createTimestamp()
      };
    }

    const secid = buildEastmoneySecId(context);
    if (!secid) {
      return {
        code: context.symbol,
        market: context.market,
        flows: { main: 0, large: 0, medium: 0, small: 0 },
        time: createTimestamp()
      };
    }

    const url = `https://push2.eastmoney.com/api/qt/stock/fflow/kline/get?secid=${secid}&klt=101&lmt=1&fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55`;
    try {
      const json = await fetchJson(url);
      const parsed = parseEastmoneyCapital(json?.data ?? {});

      return {
        code: context.symbol,
        market: context.market,
        flows: {
          main: parsed.mainNetInflow,
          large: parsed.largeNetInflow,
          medium: parsed.mediumNetInflow,
          small: parsed.smallNetInflow
        },
        time: createTimestamp()
      };
    } catch (error) {
      console.warn(`[EastmoneyProvider] ${error.message}`);
      return {
        code: context.symbol,
        market: context.market,
        flows: { main: 0, large: 0, medium: 0, small: 0 },
        time: createTimestamp()
      };
    }
  }

  async fetchTradeDetail(context) {
    this.ensureMockableMode(context.providerMode, 'trade');
    if (context.providerMode !== 'live') {
      return {
        code: context.symbol,
        market: context.market,
        records: [
          ['09:30:01', 12.3, 100, 'buy'],
          ['09:30:03', 12.29, 200, 'sell'],
          ['09:30:05', 12.34, 300, 'buy']
        ],
        time: createTimestamp()
      };
    }

    const secid = buildEastmoneySecId(context);
    if (!secid) {
      return { code: context.symbol, market: context.market, records: [], time: createTimestamp() };
    }

    const url = `https://push2.eastmoney.com/api/qt/stock/details/get?secid=${secid}&fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55`;
    try {
      const json = await fetchJson(url);
      const parsed = parseEastmoneyTradeDetail(json?.data ?? {});

      return {
        code: context.symbol,
        market: context.market,
        records: parsed.records,
        time: createTimestamp()
      };
    } catch (error) {
      console.warn(`[EastmoneyProvider] ${error.message}`);
      return { code: context.symbol, market: context.market, records: [], time: createTimestamp() };
    }
  }

  async fetchAnnouncements(context) {
    this.ensureMockableMode(context.providerMode, 'announcements');
    if (context.providerMode !== 'live') {
      return {
        code: context.symbol,
        market: context.market,
        announcements: [
          {
            id: `${context.symbol}-announcement-1`,
            title: `Eastmoney mock announcement for ${context.symbol}`,
            publishedAt: createTimestamp(),
            url: `https://example.test/announcements/${context.symbol}`
          }
        ],
        time: createTimestamp()
      };
    }

    if (context.market === 'hk') {
      return { code: context.symbol, market: context.market, announcements: [], time: createTimestamp() };
    }

    const lastDot = context.symbol?.lastIndexOf('.') ?? -1;
    const code = lastDot > 0 ? context.symbol.slice(0, lastDot) : context.symbol;
    const url = `https://np-anotice-stock.eastmoney.com/api/security/ann?sr=-1&page_size=10&page_index=1&ann_type=A&client_source=web&stock_list=${code}`;
    try {
      const json = await fetchJson(url);
      const parsed = parseEastmoneyAnnouncements(json?.data ?? {});

      return {
        code: context.symbol,
        market: context.market,
        announcements: parsed.items,
        time: createTimestamp()
      };
    } catch (error) {
      console.warn(`[EastmoneyProvider] ${error.message}`);
      return { code: context.symbol, market: context.market, announcements: [], time: createTimestamp() };
    }
  }

  async fetchNews(context) {
    this.ensureMockableMode(context.providerMode, 'news');
    if (context.providerMode !== 'live') {
      return {
        code: context.symbol,
        market: context.market,
        news: [
          {
            id: `${context.symbol}-news-1`,
            title: `Eastmoney mock news for ${context.symbol}`,
            publishedAt: createTimestamp(),
            summary: 'Stable fallback news payload for tests.'
          }
        ],
        time: createTimestamp()
      };
    }

    const announcements = await this.fetchAnnouncements({ ...context, providerMode: 'live' });
    return {
      code: context.symbol,
      market: context.market,
      news: announcements.announcements.map((item) => ({
        id: item.id,
        title: item.title,
        publishedAt: item.publishedAt,
        summary: ''
      })),
      time: createTimestamp()
    };
  }
}

export function createEastmoneyProvider() {
  return new EastmoneyProvider();
}
