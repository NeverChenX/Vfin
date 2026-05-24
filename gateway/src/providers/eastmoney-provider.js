import { BaseProvider } from './base-provider.js';
import { fetchJson } from './http-client.js';
import {
  parseEastmoneyTradeDetail,
  parseEastmoneyAnnouncements,
  parseEastmoneyCapital,
  parseEastmoneyKline
} from './live-mappers.js';
import { createTimestamp } from '../utils/time.js';

function buildEastmoneySecId({ market, symbol }) {
  const lastDot = symbol?.lastIndexOf('.') ?? -1;
  const code = lastDot > 0 ? symbol.slice(0, lastDot) : symbol;
  if (market === 'sh') return `1.${code}`;
  if (market === 'sz') return `0.${code}`;
  if (market === 'us') return `105.${code}`;
  if (market === 'hk') return `116.${code.padStart(5, '0')}`;
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
