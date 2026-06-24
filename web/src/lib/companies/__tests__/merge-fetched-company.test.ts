import { describe, expect, it } from 'vitest';
import type { CompanyFinancials } from '@/types/finance';
import { assertCuratedFieldsPreserved, mergeFetchedCompany } from '../merge-fetched-company';

describe('mergeFetchedCompany', () => {
  it('preserves manually curated valuation and ratios when live fetch refreshes statements', () => {
    const existing: CompanyFinancials = {
      ticker: '01810',
      name: '小米集团',
      nameEn: 'Xiaomi Corporation',
      shortName: '小米',
      industry: '综合',
      market: 'HK',
      currency: 'CNY',
      unit: 'yuan',
      accountingStandard: 'IFRS',
      statements: {
        IS: { periods: [] },
        BS: { periods: [] },
        CF: { periods: [] },
      },
      ratios: [
        {
          period: { year: 2025, granularity: 'Y' as const },
          values: { pe_ttm: 18.109, pb: 2.313 },
        },
      ],
      valuation: {
        sotpCurrency: 'CNY',
        sotpAsOf: '2026-03-31',
        netCash: null,
        netCashAsOf: '2026-03-31',
        marketCapOverride: 583014.75161094,
        segments: [
          {
            id: 'smart_ev_ai_new',
            name: '智能电动汽车、AI 等创新业务',
            method: 'PS',
            metricLabel: 'Q1 2026 收入年化',
            metricValue: 79457.6,
            metricAsOf: '2026-03-31',
            peers: [],
            rationale: 'real cached valuation input',
          },
        ],
      },
    };

    const fetched: CompanyFinancials = {
      ticker: '01810',
      name: '小米集团',
      industry: '综合',
      market: 'HK',
      currency: 'CNY',
      unit: 'yuan',
      accountingStandard: 'IFRS',
      statements: {
        IS: { periods: [{ period: { year: 2026, granularity: 'Q' as const, index: 1 as const }, values: { rev_total: 1 } }] },
        BS: { periods: [] },
        CF: { periods: [] },
      },
    };

    const merged = mergeFetchedCompany(fetched, existing);

    expect(merged.statements.IS.periods).toHaveLength(1);
    expect(merged.valuation).toEqual(existing.valuation);
    expect(merged.ratios).toEqual(existing.ratios);
    expect(merged.nameEn).toBe('Xiaomi Corporation');
    expect(merged.shortName).toBe('小米');
  });

  it('uses fetched valuation and ratios for first-time companies with no existing curated data', () => {
    const fetched: CompanyFinancials = {
      ticker: 'AAPL',
      name: 'Apple',
      industry: 'Technology',
      market: 'US',
      currency: 'USD',
      unit: 'yuan',
      accountingStandard: 'US-GAAP',
      statements: {
        IS: { periods: [] },
        BS: { periods: [] },
        CF: { periods: [] },
      },
      ratios: [
        {
          period: { year: 2026, granularity: 'Q' as const, index: 1 as const },
          values: { pe_ttm: 20 },
        },
      ],
      valuation: {
        sotpCurrency: 'USD',
        sotpAsOf: '2026-03-31',
        netCash: null,
        netCashAsOf: '2026-03-31',
        marketCapOverride: null,
        segments: [],
      },
    };

    const merged = mergeFetchedCompany(fetched, null);

    expect(merged.ratios).toEqual(fetched.ratios);
    expect(merged.valuation).toEqual(fetched.valuation);
  });

  it('refuses to write when an existing valuation or ratio set would be dropped', () => {
    const existing = {
      ratios: [{ period: { year: 2025, granularity: 'Y' as const }, values: { pe_ttm: 18.109 } }],
      valuation: {
        sotpCurrency: 'CNY',
        sotpAsOf: '2026-03-31',
        netCash: null,
        netCashAsOf: '2026-03-31',
        marketCapOverride: null,
        segments: [],
      },
    } satisfies Partial<CompanyFinancials>;

    expect(() => assertCuratedFieldsPreserved(existing, {})).toThrow(
      /Refusing to overwrite company JSON/,
    );
  });
});
