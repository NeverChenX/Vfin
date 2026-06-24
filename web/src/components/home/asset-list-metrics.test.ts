import { describe, expect, it } from 'vitest';
import { ASSET_LIST_METRIC_COLUMNS, formatMarketMultiple, latestMarketMultiples } from './asset-list-metrics';

describe('asset list market multiple columns', () => {
  it('uses PE and PB instead of daily high and low', () => {
    const labels = ASSET_LIST_METRIC_COLUMNS.map((column) => column.label);

    expect(labels).toContain('PE');
    expect(labels).toContain('PB');
    expect(labels).not.toContain('今日 最高');
    expect(labels).not.toContain('今日 最低');
  });

  it('reads the latest available validated market multiples from company ratios', () => {
    const multiples = latestMarketMultiples({
      ratios: [
        { period: { year: 2024, granularity: 'Y' }, values: { pe_ttm: 12.345, pb: 1.234 } },
        { period: { year: 2025, granularity: 'Q', index: 1 }, values: { pe_ttm: 18.109, pb: 2.313 } },
      ],
    });

    expect(multiples).toEqual({ peTtm: 18.109, pb: 2.313, validationStatus: 'cached' });
    expect(formatMarketMultiple(multiples.peTtm)).toBe('18.11');
    expect(formatMarketMultiple(multiples.pb)).toBe('2.31');
  });

  it('prefers latest double-validated quote market multiples for stocks', () => {
    const multiples = latestMarketMultiples(
      {
        ratios: [
          { period: { year: 2025, granularity: 'Q', index: 1 }, values: { pe_ttm: 18.109, pb: 2.313 } },
        ],
      },
      {
        peTtm: 18.36,
        pb: 5.67,
        marketMultiplesValidationStatus: 'verified',
      },
    );

    expect(multiples).toEqual({ peTtm: 18.36, pb: 5.67, validationStatus: 'verified' });
  });

  it('uses degraded single-source quote market multiples when double validation is unavailable', () => {
    const multiples = latestMarketMultiples(
      {
        ratios: [
          { period: { year: 2025, granularity: 'Q', index: 1 }, values: { pe_ttm: 18.109, pb: 2.313 } },
        ],
      },
      {
        peTtm: 10,
        pb: 1,
        marketMultiplesValidationStatus: 'degraded_single_source',
      },
    );

    expect(multiples).toEqual({ peTtm: 10, pb: 1, validationStatus: 'degraded_single_source' });
  });

  it('does not fabricate unavailable market multiples', () => {
    expect(latestMarketMultiples({ ratios: [] })).toEqual({ peTtm: null, pb: null, validationStatus: 'unavailable' });
    expect(formatMarketMultiple(null)).toBe('--');
    expect(formatMarketMultiple(undefined)).toBe('--');
  });
});
