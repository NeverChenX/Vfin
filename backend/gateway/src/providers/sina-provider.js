import { BaseProvider } from './base-provider.js';

function createTimestamp() {
  return '2026-04-03T09:30:00.000Z';
}

export class SinaProvider extends BaseProvider {
  constructor() {
    super({ name: 'sina' });
  }

  async fetchQuote(context) {
    this.ensureMockableMode(context.providerMode, 'quote');

    return {
      symbol: context.symbol,
      market: context.market,
      name: `Mock ${context.symbol}`,
      now: 12.34,
      open: 12.1,
      high: 12.6,
      low: 12,
      volume: 123456,
      turnover: 1523456,
      timestamp: createTimestamp()
    };
  }

  async fetchMinute(context) {
    this.ensureMockableMode(context.providerMode, 'minute');

    return {
      symbol: context.symbol,
      market: context.market,
      points: [
        { time: '09:30', price: 12.1, volume: 1200, avgPrice: 12.1 },
        { time: '09:31', price: 12.2, volume: 1800, avgPrice: 12.15 },
        { time: '09:32', price: 12.34, volume: 2400, avgPrice: 12.21 }
      ],
      timestamp: createTimestamp()
    };
  }

  async fetchKline(context) {
    this.ensureMockableMode(context.providerMode, 'kline');

    return {
      symbol: context.symbol,
      market: context.market,
      period: context.period ?? 'day',
      list: [
        {
          date: '2026-04-01',
          open: 12,
          high: 12.5,
          low: 11.9,
          close: 12.2,
          volume: 110000,
          amount: 1342000
        },
        {
          date: '2026-04-02',
          open: 12.2,
          high: 12.4,
          low: 12.1,
          close: 12.28,
          volume: 98000,
          amount: 1204800
        },
        {
          date: '2026-04-03',
          open: 12.28,
          high: 12.6,
          low: 12.18,
          close: 12.34,
          volume: 123456,
          amount: 1523456
        }
      ],
      timestamp: createTimestamp()
    };
  }

  async fetchCapital(context) {
    this.ensureMockableMode(context.providerMode, 'capital');

    return {
      symbol: context.symbol,
      market: context.market,
      mainNetInflow: 1200000,
      largeNetInflow: 560000,
      mediumNetInflow: -210000,
      smallNetInflow: -430000,
      timestamp: createTimestamp()
    };
  }

  async fetchCallauction(context) {
    this.ensureMockableMode(context.providerMode, 'callauction');

    return {
      symbol: context.symbol,
      market: context.market,
      price: 12.3,
      matchedVolume: 8200,
      unmatchedVolume: 600,
      direction: 'buy',
      timestamp: createTimestamp()
    };
  }

  async fetchTradeDetail(context) {
    this.ensureMockableMode(context.providerMode, 'trade');

    return {
      symbol: context.symbol,
      market: context.market,
      trades: [
        { time: '09:30:01', price: 12.3, volume: 100, side: 'buy' },
        { time: '09:30:03', price: 12.29, volume: 200, side: 'sell' },
        { time: '09:30:05', price: 12.34, volume: 300, side: 'buy' }
      ],
      timestamp: createTimestamp()
    };
  }

  async fetchNews(context) {
    this.ensureMockableMode(context.providerMode, 'news');

    return {
      symbol: context.symbol,
      market: context.market,
      items: [
        {
          id: `${context.symbol}-news-1`,
          title: `Mock news for ${context.symbol}`,
          publishedAt: createTimestamp(),
          summary: 'Stable mock news payload for tests.'
        }
      ],
      timestamp: createTimestamp()
    };
  }

  async fetchAnnouncements(context) {
    this.ensureMockableMode(context.providerMode, 'announcements');

    return {
      symbol: context.symbol,
      market: context.market,
      items: [
        {
          id: `${context.symbol}-announcement-1`,
          title: `Mock announcement for ${context.symbol}`,
          publishedAt: createTimestamp(),
          url: `https://example.test/announcements/${context.symbol}`
        }
      ],
      timestamp: createTimestamp()
    };
  }
}

export function createSinaProvider() {
  return new SinaProvider();
}
