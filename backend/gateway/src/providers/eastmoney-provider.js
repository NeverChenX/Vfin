import { BaseProvider } from './base-provider.js';
import { fetchJson } from './http-client.js';
import {
  parseEastmoneyTradeDetail,
  parseEastmoneyAnnouncements,
  parseEastmoneyCapital
} from './live-mappers.js';

function createTimestamp() {
  return new Date().toISOString();
}

function buildEastmoneySecId({ market, symbol }) {
  const code = symbol?.includes('.') ? symbol.split('.')[0] : symbol;
  if (market === 'sh') return `1.${code}`;
  if (market === 'sz') return `0.${code}`;
  return null;
}

export class EastmoneyProvider extends BaseProvider {
  constructor() {
    super({ name: 'eastmoney' });
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
    } catch (_error) {
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
    } catch (_error) {
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

    const code = context.symbol?.split('.')[0];
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
    } catch (_error) {
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
