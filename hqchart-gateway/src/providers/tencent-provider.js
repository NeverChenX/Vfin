import { BaseProvider } from './base-provider.js';

function createTimestamp() {
  return '2026-04-03T09:30:00.000Z';
}

export class TencentProvider extends BaseProvider {
  constructor() {
    super({ name: 'tencent' });
  }

  async fetchQuote(context) {
    this.ensureMockableMode(context.providerMode, 'quote');

    return {
      code: context.symbol,
      market: context.market,
      title: `Tencent Mock ${context.symbol}`,
      price: 12.34,
      openPrice: 12.1,
      maxPrice: 12.6,
      minPrice: 12,
      totalVolume: 123456,
      totalAmount: 1523456,
      time: createTimestamp()
    };
  }

  async fetchMinute(context) {
    this.ensureMockableMode(context.providerMode, 'minute');

    return {
      code: context.symbol,
      market: context.market,
      line: [
        ['09:30', 12.1, 1200, 12.1],
        ['09:31', 12.2, 1800, 12.15],
        ['09:32', 12.34, 2400, 12.21]
      ],
      time: createTimestamp()
    };
  }

  async fetchKline(context) {
    this.ensureMockableMode(context.providerMode, 'kline');

    return {
      code: context.symbol,
      market: context.market,
      cycle: context.period ?? 'day',
      candles: [
        ['2026-04-01', 12, 12.5, 11.9, 12.2, 110000, 1342000],
        ['2026-04-02', 12.2, 12.4, 12.1, 12.28, 98000, 1204800],
        ['2026-04-03', 12.28, 12.6, 12.18, 12.34, 123456, 1523456]
      ],
      time: createTimestamp()
    };
  }

  async fetchCapital(context) {
    this.ensureMockableMode(context.providerMode, 'capital');

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

  async fetchCallauction(context) {
    this.ensureMockableMode(context.providerMode, 'callauction');

    return {
      code: context.symbol,
      market: context.market,
      auction: {
        price: 12.3,
        matchedVolume: 8200,
        unmatchedVolume: 600,
        direction: 'buy'
      },
      time: createTimestamp()
    };
  }

  async fetchTradeDetail(context) {
    this.ensureMockableMode(context.providerMode, 'trade');

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

  async fetchNews(context) {
    this.ensureMockableMode(context.providerMode, 'news');

    return {
      code: context.symbol,
      market: context.market,
      news: [
        {
          id: `${context.symbol}-news-1`,
          title: `Tencent mock news for ${context.symbol}`,
          publishedAt: createTimestamp(),
          summary: 'Stable fallback news payload for tests.'
        }
      ],
      time: createTimestamp()
    };
  }

  async fetchAnnouncements(context) {
    this.ensureMockableMode(context.providerMode, 'announcements');

    return {
      code: context.symbol,
      market: context.market,
      announcements: [
        {
          id: `${context.symbol}-announcement-1`,
          title: `Tencent mock announcement for ${context.symbol}`,
          publishedAt: createTimestamp(),
          url: `https://example.test/tencent/announcements/${context.symbol}`
        }
      ],
      time: createTimestamp()
    };
  }
}

export function createTencentProvider() {
  return new TencentProvider();
}
