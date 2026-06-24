import { describe, expect, it } from 'vitest';
import { createHqchartDataService } from '../src/services/hqchart-data-service.js';
import { createCacheService } from '../src/services/cache-service.js';

describe('hqchart data service provider routing', () => {
  it('routes European index quotes to eastmoney by default', async () => {
    const seenProviders = [];
    const providerRegistry = {
      async execute(operation, context) {
        seenProviders.push(context.provider);
        return {
          provider: context.provider,
          data: {
            symbol: context.symbol,
            market: context.market,
            name: 'Mock European Index',
            now: 25205.92,
            prevClose: 25389.1,
            open: 25359.75,
            high: 25361.64,
            low: 25180.5,
            volume: 0,
            turnover: 0,
            timestamp: '2026-06-16T14:00:00+08:00',
          },
        };
      },
    };

    const service = createHqchartDataService({
      providerRegistry,
      providerMode: 'live',
    });

    const quote = await service.getQuote({ symbol: 'DAX.de' });

    expect(seenProviders).toEqual(['eastmoney']);
    expect(quote).toMatchObject({
      symbol: 'DAX.de',
      market: 'de',
      provider: 'eastmoney',
      price: 25205.92,
      yclose: 25389.1,
    });
  });

  it('double-validates latest stock PE and PB from Tencent and Eastmoney before exposing them', async () => {
    const providerRegistry = {
      async execute(_operation, context) {
        if (context.provider === 'tencent') {
          return {
            provider: 'tencent',
            data: {
              symbol: context.symbol,
              market: context.market,
              name: 'Tencent Stock',
              now: 1215,
              prevClose: 1240,
              open: 1235,
              high: 1238.87,
              low: 1211.22,
              volume: 57472,
              turnover: 7016713941,
              peTtm: 18.36,
              pb: 5.67,
              timestamp: '2026-06-18T16:14:04+08:00',
            },
          };
        }
        if (context.provider === 'eastmoney') {
          return {
            provider: 'eastmoney',
            data: {
              symbol: context.symbol,
              market: context.market,
              name: 'Eastmoney Stock',
              now: 1215,
              prevClose: 1240,
              open: 1235,
              high: 1238.87,
              low: 1211.22,
              volume: 57472,
              turnover: 7016713941,
              peTtm: 18.361,
              pb: 5.671,
              timestamp: '2026-06-18T16:14:04+08:00',
            },
          };
        }
        return {
          provider: 'sina',
          data: {
            symbol: context.symbol,
            market: context.market,
            name: 'Primary Stock',
            now: 1215,
            prevClose: 1240,
            open: 1235,
            high: 1238.87,
            low: 1211.22,
            volume: 57472,
            turnover: 7016713941,
            timestamp: '2026-06-18T16:14:04+08:00',
          },
        };
      },
    };

    const service = createHqchartDataService({ providerRegistry, providerMode: 'live' });
    const quote = await service.getQuote({ symbol: '600519.sh' });

    expect(quote).toMatchObject({
      peTtm: 18.36,
      pb: 5.67,
      marketMultiplesValidationStatus: 'verified',
      marketMultiplesSources: ['tencent', 'eastmoney'],
    });
  });

  it('routes crypto quotes to the crypto provider', async () => {
    const seenProviders = [];
    const providerRegistry = {
      async execute(operation, context) {
        seenProviders.push(context.provider);
        return {
          provider: context.provider,
          data: {
            symbol: context.symbol,
            market: context.market,
            name: '比特币',
            now: 100000,
            prevClose: 99000,
            open: 99000,
            high: 101000,
            low: 98000,
            volume: 123.45,
            turnover: 12345000,
            validationStatus: 'verified',
            validationSources: ['Binance 24hr ticker', 'CoinGecko simple price'],
            timestamp: '2026-06-21T12:00:00Z',
          },
        };
      },
    };

    const service = createHqchartDataService({ providerRegistry, providerMode: 'live' });
    const quote = await service.getQuote({ symbol: 'BTCUSD.crypto' });

    expect(seenProviders).toEqual(['crypto']);
    expect(quote).toMatchObject({
      symbol: 'BTCUSD.crypto',
      market: 'crypto',
      provider: 'crypto',
      name: '比特币',
      price: 100000,
      validationStatus: 'verified',
      validationSources: ['Binance 24hr ticker', 'CoinGecko simple price'],
    });
  });

  it('routes crypto klines to the crypto provider', async () => {
    const seenProviders = [];
    const providerRegistry = {
      async execute(operation, context) {
        seenProviders.push(context.provider);
        return {
          provider: context.provider,
          data: {
            code: context.symbol,
            market: context.market,
            cycle: context.period,
            list: [
              { date: '2026-06-19', open: 1, high: 2, low: 1, close: 2, volume: 10, amount: 20 },
              { date: '2026-06-20', open: 2, high: 3, low: 2, close: 3, volume: 11, amount: 33 },
            ],
            time: '2026-06-21T12:00:00Z',
          },
        };
      },
    };

    const service = createHqchartDataService({ providerRegistry, providerMode: 'live' });
    const kline = await service.getKline({ symbol: 'BTCUSD.crypto', period: 'day', count: 2 });

    expect(seenProviders).toEqual(['crypto']);
    expect(kline.items).toHaveLength(2);
  });

  it('routes selected global index and commodity klines to yahoo', async () => {
    const seenProviders = [];
    const providerRegistry = {
      async execute(operation, context) {
        seenProviders.push(`${context.symbol}:${context.provider}`);
        return {
          provider: context.provider,
          data: {
            code: context.symbol,
            market: context.market,
            cycle: context.period,
            list: [
              { date: '2026-06-19', open: 1, high: 2, low: 1, close: 2, volume: 10, amount: 20 },
            ],
            time: '2026-06-21T12:00:00Z',
          },
        };
      },
    };

    const service = createHqchartDataService({ providerRegistry, providerMode: 'live' });
    await service.getKline({ symbol: 'IXIC.us', period: 'day', count: 2 });
    await service.getKline({ symbol: 'N225.jp', period: 'day', count: 2 });
    await service.getKline({ symbol: 'XAU.cm', period: 'day', count: 2 });

    expect(seenProviders).toEqual([
      'IXIC.us:yahoo',
      'N225.jp:yahoo',
      'XAU.cm:yahoo',
    ]);
  });

  it('exposes stock PE and PB as degraded single-source data when double validation fails', async () => {
    const providerRegistry = {
      async execute(_operation, context) {
        if (context.provider === 'tencent') {
          return { provider: 'tencent', data: { symbol: context.symbol, market: context.market, now: 10, peTtm: 10, pb: 1 } };
        }
        if (context.provider === 'eastmoney') {
          return { provider: 'eastmoney', data: { symbol: context.symbol, market: context.market, now: 10, peTtm: 12, pb: 1.5 } };
        }
        return { provider: 'sina', data: { symbol: context.symbol, market: context.market, now: 10 } };
      },
    };

    const service = createHqchartDataService({ providerRegistry, providerMode: 'live' });
    const quote = await service.getQuote({ symbol: '600519.sh' });

    expect(quote.peTtm).toBe(10);
    expect(quote.pb).toBe(1);
    expect(quote.marketMultiplesValidationStatus).toBe('degraded_single_source');
    expect(quote.marketMultiplesSources).toEqual(['tencent']);
  });

  it('serves fresh cached long daily kline history without reloading upstream', async () => {
    const counts = [];
    const providerRegistry = {
      async execute(_operation, context) {
        const count = Number(context.count ?? 0);
        counts.push(count);
        const startDay = count > 100 ? 1 : 496;
        const list = Array.from({ length: count }, (_, index) => {
          const day = startDay + index;
          return {
            date: `2025-01-${String(day).padStart(3, '0')}`,
            open: day,
            high: day + 1,
            low: day - 1,
            close: day,
            volume: day,
            amount: day,
          };
        });
        return {
          provider: context.provider ?? 'crypto',
          data: {
            code: context.symbol,
            market: context.market,
            cycle: context.period,
            list,
            time: '2026-06-21T12:00:00Z',
          },
        };
      },
    };
    const service = createHqchartDataService({
      providerRegistry,
      providerMode: 'live',
      cacheService: createCacheService(),
    });

    const first = await service.getKline({ symbol: 'BTCUSD.crypto', period: 'day', count: 500 });
    const second = await service.getKline({ symbol: 'BTCUSD.crypto', period: 'day', count: 500 });

    expect(counts).toEqual([500]);
    expect(first.items).toHaveLength(500);
    expect(second.items).toHaveLength(500);
  });

  it('returns stale long daily kline history immediately and refreshes latest tail in the background', async () => {
    let now = 1000;
    const counts = [];
    let releaseTailRefresh;
    const tailRefreshGate = new Promise((resolve) => {
      releaseTailRefresh = resolve;
    });
    const providerRegistry = {
      async execute(_operation, context) {
        const count = Number(context.count ?? 0);
        counts.push(count);
        if (count <= 10) await tailRefreshGate;
        const startDay = count > 100 ? 1 : 496;
        const list = Array.from({ length: count }, (_, index) => {
          const day = startDay + index;
          return {
            date: `2025-01-${String(day).padStart(3, '0')}`,
            open: day,
            high: day + 1,
            low: day - 1,
            close: day,
            volume: day,
            amount: day,
          };
        });
        return {
          provider: context.provider ?? 'crypto',
          data: {
            code: context.symbol,
            market: context.market,
            cycle: context.period,
            list,
            time: '2026-06-21T12:00:00Z',
          },
        };
      },
    };
    const service = createHqchartDataService({
      providerRegistry,
      providerMode: 'live',
      cacheService: createCacheService({ now: () => now }),
    });

    await service.getKline({ symbol: 'BTCUSD.crypto', period: 'day', count: 500 });
    now = 1_900_000;
    const second = await service.getKline({ symbol: 'BTCUSD.crypto', period: 'day', count: 500 });

    expect(counts).toEqual([500, 10]);
    expect(second.items).toHaveLength(500);
    expect(second.items.at(-1)).toMatchObject({ date: '2025-01-500', close: 500 });

    releaseTailRefresh();
    await tailRefreshGate;
    await new Promise((resolve) => setTimeout(resolve, 0));

    const third = await service.getKline({ symbol: 'BTCUSD.crypto', period: 'day', count: 500 });
    expect(counts).toEqual([500, 10]);
    expect(third.items.at(-1)).toMatchObject({ date: '2025-01-505', close: 505 });
  });
});
