import { describe, expect, it } from 'vitest';
import { buildCurrentMarketMetrics } from './key-metrics-market-data';

describe('company key metrics live market data', () => {
  it('uses latest quote price and double-validated quote PE/PB before cached ratios', () => {
    const metrics = buildCurrentMarketMetrics(
      {
        ratios: [
          { period: { year: 2025, granularity: 'Q', index: 1 }, values: { pe_ttm: 12.3, pb: 1.2 } },
        ],
      },
      {
        symbol: '600519.sh',
        price: 1215,
        peTtm: 18.36,
        pb: 5.67,
        marketMultiplesValidationStatus: 'verified',
        timestamp: '2026-06-23T12:00:00+08:00',
      },
    );

    expect(metrics.price).toBe(1215);
    expect(metrics.peTtm).toBe(18.36);
    expect(metrics.pb).toBe(5.67);
    expect(metrics.marketMultiplesValidationStatus).toBe('verified');
  });

  it('uses degraded single-source quote PE/PB instead of cached ratios', () => {
    const metrics = buildCurrentMarketMetrics(
      {
        ratios: [
          { period: { year: 2025, granularity: 'Q', index: 1 }, values: { pe_ttm: 12.3, pb: 1.2 } },
        ],
      },
      {
        symbol: '600519.sh',
        price: 1215,
        peTtm: 10,
        pb: 1,
        marketMultiplesValidationStatus: 'degraded_single_source',
      },
    );

    expect(metrics.price).toBe(1215);
    expect(metrics.peTtm).toBe(10);
    expect(metrics.pb).toBe(1);
    expect(metrics.marketMultiplesValidationStatus).toBe('degraded_single_source');
  });
});
