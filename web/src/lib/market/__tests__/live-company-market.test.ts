import { describe, expect, it } from 'vitest';
import {
  applyLiveMarketData,
  formatHongKongAsOf,
  parseEastmoneyHkQuote,
  parseTencentHkQuote,
} from '@/lib/market/live-company-market';
import type { CompanyFinancials } from '@/types/finance';

function companyWithStaleMarket(): CompanyFinancials {
  return {
    ticker: '01810.hk',
    name: '小米集团-W',
    industry: '消费电子',
    market: 'HK',
    currency: 'CNY',
    unit: 'yuan',
    accountingStandard: 'IFRS',
    statements: {
      BS: { periods: [] },
      IS: { periods: [] },
      CF: { periods: [] },
    },
    valuation: {
      sotpCurrency: 'CNY',
      sotpAsOf: '2026-03-31',
      netCash: null,
      netCashAsOf: '2026-03-31',
      marketCapOverride: 583014.75161094,
      currentMarketData: {
        asOf: '2026-06-10',
        currency: 'HKD',
        price: 25.9,
        change: -1.3,
        changePct: -0.0478,
        volume: 147427989,
        marketCap: 674941.82635928,
        sharesOutstanding: null,
        validationStatus: 'degraded_single_source',
        sources: ['Yahoo Finance chart 1810.HK'],
      },
      segments: [],
    },
  };
}

describe('live company market data', () => {
  it('parses Eastmoney HK quotes with explicit scale and market cap', () => {
    const quote = parseEastmoneyHkQuote({
      data: {
        f43: 26200,
        f44: 26500,
        f45: 25960,
        f46: 26060,
        f47: 131880583,
        f48: 3456976816,
        f57: '01810',
        f58: '小米集团-W',
        f59: 3,
        f60: 25840,
        f86: 1781251699,
        f116: 677026321502.8,
      },
    });

    expect(quote?.price).toBe(26.2);
    expect(quote?.change).toBeCloseTo(0.36, 6);
    expect(quote?.changePct).toBeCloseTo(0.0139, 6);
    expect(quote?.marketCapHkdMillions).toBeCloseTo(677026.3215028, 6);
    expect(quote?.timestamp).toBe('2026-06-12T08:08:19.000Z');
  });

  it('parses Tencent HK quotes for independent quote validation', () => {
    const payload =
      'v_hk01810="100~XIAOMI-W~01810~26.200~25.840~26.060~131880583.0~0~0~26.200~0~0~0~0~0~0~0~0~0~26.200~0~0~0~0~0~0~0~0~0~131880583.0~2026/06/12 16:08:29~0.360~1.39~26.500~25.960~26.200~131880583.0~3456976813.010~0~14.68~~0~0~2.09~5603.4256~6770.2632~XIAOMI-W~0.00~61.450~25.580~0.86~-1.11~0~0~0~0~0~16.87~2.28~0.62~200~-33.33~-5.76~GP~13.15~7.03~-6.56~-17.40~-21.37~25840699294.00~21387120484.00~31.64~0.000~26.213~-53.38~HKD~1~50";';

    const quote = parseTencentHkQuote(payload);

    expect(quote?.price).toBe(26.2);
    expect(quote?.timestamp).toBe('2026-06-12T08:08:29.000Z');
    expect(quote?.marketCapHkdMillions).toBeCloseTo(677026.32, 2);
  });

  it('replaces stale static market data with newer verified live market data', () => {
    const fx = 0.866236;
    const liveMarketCapHkdMillions = 677026.3215028;
    const enriched = applyLiveMarketData(companyWithStaleMarket(), {
      quote: {
        source: 'Eastmoney push2 HK quote',
        timestamp: '2026-06-12T08:08:19.000Z',
        price: 26.2,
        prevClose: 25.84,
        open: 26.06,
        high: 26.5,
        low: 25.96,
        change: 0.36,
        changePct: 0.0139,
        volume: 131880583,
        amount: 3456976816,
        marketCapHkdMillions: liveMarketCapHkdMillions,
      },
      validationSources: ['Eastmoney push2 HK quote', 'Tencent Finance HK quote'],
      quoteVerified: true,
      hkdToCny: fx,
      fxSource: 'ExchangeRate-API HKD/CNY',
    });

    expect(enriched.valuation?.currentMarketData?.asOf).toBe('2026-06-12 16:08');
    expect(enriched.valuation?.currentMarketData?.price).toBe(26.2);
    expect(enriched.valuation?.currentMarketData?.changePct).toBe(0.0139);
    expect(enriched.valuation?.currentMarketData?.validationStatus).toBe('verified');
    expect(enriched.valuation?.currentMarketData?.marketCap).toBeCloseTo(liveMarketCapHkdMillions, 6);
    expect(enriched.valuation?.marketCapOverride).toBeCloseTo(liveMarketCapHkdMillions * fx, 6);
  });

  it('formats Hong Kong market timestamps for the UI title', () => {
    expect(formatHongKongAsOf('2026-06-12T08:08:19.000Z')).toBe('2026-06-12 16:08');
  });
});
