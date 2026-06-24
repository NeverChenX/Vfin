import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSECCompany } from '@/lib/fetchers/sec';

function fact(records: unknown[]) {
  return { label: 'fixture', units: { USD: records } };
}

function annualDuration(year: number, start: string, end: string, val: number) {
  return { fy: year, fp: 'FY', form: '10-K', filed: `${year}-07-30`, start, end, val };
}

function annualInstant(year: number, end: string, val: number) {
  return { fy: year, fp: 'FY', form: '10-K', filed: `${year}-07-30`, end, val };
}

describe('SEC fetcher', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses fiscal-year 10-K facts for non-calendar-year companies', async () => {
    const facts: Record<string, unknown> = {
      Revenues: fact([annualDuration(2025, '2024-07-01', '2025-06-30', 1000)]),
      CostOfRevenue: fact([annualDuration(2025, '2024-07-01', '2025-06-30', 400)]),
      GrossProfit: fact([annualDuration(2025, '2024-07-01', '2025-06-30', 600)]),
      OperatingIncomeLoss: fact([annualDuration(2025, '2024-07-01', '2025-06-30', 300)]),
      NetIncomeLoss: fact([annualDuration(2025, '2024-07-01', '2025-06-30', 200)]),
      IncomeTaxExpenseBenefit: fact([annualDuration(2025, '2024-07-01', '2025-06-30', 50)]),
      Assets: fact([annualInstant(2025, '2025-06-30', 5000)]),
      Liabilities: fact([annualInstant(2025, '2025-06-30', 2000)]),
      StockholdersEquity: fact([annualInstant(2025, '2025-06-30', 3000)]),
      CashAndCashEquivalentsAtCarryingValue: fact([annualInstant(2025, '2025-06-30', 700)]),
      NetCashProvidedByUsedInOperatingActivities: fact([annualDuration(2025, '2024-07-01', '2025-06-30', 136162)]),
      NetCashProvidedByUsedInInvestingActivities: fact([annualDuration(2025, '2024-07-01', '2025-06-30', -72599)]),
      NetCashProvidedByUsedInFinancingActivities: fact([annualDuration(2025, '2024-07-01', '2025-06-30', -51699)]),
    };

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ cik: 789019, entityName: 'Microsoft Corporation', facts: { 'us-gaap': facts } }),
    })));

    const company = await fetchSECCompany('MSFT');
    const cf2025 = company.statements.CF.periods.find((p) => p.period.year === 2025);
    const bs2025 = company.statements.BS.periods.find((p) => p.period.year === 2025);

    expect(cf2025?.values.net_op_cf).toBe(136162);
    expect(cf2025?.values.net_inv_cf).toBe(-72599);
    expect(cf2025?.values.net_fin_cf).toBe(-51699);
    expect(cf2025?.values.end_cash).toBe(700);
    expect(bs2025?.values.total_assets).toBe(5000);
  });
});
