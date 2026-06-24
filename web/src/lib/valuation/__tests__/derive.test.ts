import { describe, it, expect } from 'vitest';
import {
  deriveLatestRevenue,
  deriveLatestNetIncomeParent,
  deriveLatestParentEquity,
  deriveNetCashConservative,
  deriveRevenueSeries,
  deriveNetIncomeSeries,
  deriveGrossMarginSeries,
  deriveNetMarginSeries,
  yoy,
  getLatestAnnualPeriod,
  getLatestPeriod,
} from '../derive';
import type { CompanyFinancials, PeriodValues } from '@/types/finance';

function mkIS(year: number, rev: number | null, gp: number | null, ni: number | null): PeriodValues {
  return {
    period: { year, granularity: 'Y' },
    values: {
      rev_total: rev,
      gross_profit: gp,
      ni_parent: ni,
    } as Record<string, number | null>,
  };
}

function mkBS(year: number, vals: Record<string, number | null>): PeriodValues {
  return {
    period: { year, granularity: 'Y' },
    values: vals,
  };
}

function mkCompany(opts: {
  is?: PeriodValues[];
  bs?: PeriodValues[];
  unit?: 'yuan' | 'wan' | 'yi';
}): CompanyFinancials {
  return {
    ticker: 'TEST',
    name: 'Test',
    industry: '',
    currency: 'CNY',
    unit: opts.unit ?? 'yuan',
    accountingStandard: 'IFRS',
    statements: {
      IS: { periods: opts.is ?? [] },
      BS: { periods: opts.bs ?? [] },
      CF: { periods: [] },
    },
  };
}

// ─── 小米真实数据快照（自检 10 次的事实基础） ────────────────────────
//
// 自小米 01810.json 2025-Y 实际报表抽样（单位：yuan）：
//   IS: rev_total=457,286,687,000；gross_profit=38,874,399,000；ni_parent=41,566,439,000
//   BS: cash=26,914,377,000；st_investments=51,508,666,000；
//       st_debt/notes_payable/lt_debt_current/lt_debt/bonds_payable=0
//       parent_equity=266,218,661,000
//
// 派生预期：
//   revenue (百万元)        = 457,286.687
//   netIncomeParent (百万元) = 41,566.439
//   parentEquity (百万元)    = 266,218.661
//   netCashConservative (百万元) = 78,423.043   (= 26914.377 + 51508.666 − 0)
//   grossMargin              = 38,874.399 / 457,286.687 = 0.0850 = 8.50%
//   netMargin                = 41,566.439 / 457,286.687 = 0.0909 = 9.09%
//   注：小米毛利率实际更高（10%+）；JSON 里 gross_profit 与公开口径有差异，
//        这是数据源问题。**派生函数本身数学正确**——用户能在 UI 上看到完整
//        公式 + raw 值，自行判断口径是否符合预期。

describe('getLatestAnnualPeriod', () => {
  it('取 IS/BS/CF 三表中最晚的年报', () => {
    const c = mkCompany({
      is: [mkIS(2023, 100, 30, 10), mkIS(2024, 110, 33, 12)],
      bs: [mkBS(2025, { cash: 100 })],
    });
    expect(getLatestAnnualPeriod(c)).toEqual({ year: 2025, granularity: 'Y' });
  });
  it('全空 → null', () => {
    expect(getLatestAnnualPeriod(mkCompany({}))).toBeNull();
  });
});

describe('getLatestPeriod', () => {
  it('取 IS/BS/CF 三表中最晚的任意报表期，季度优先于更早年报', () => {
    const c = mkCompany({
      is: [
        mkIS(2025, 110, 33, 12),
        {
          period: { year: 2026, granularity: 'Q', index: 1 },
          values: { rev_total: 99, gross_profit: 22, ni_parent: 4 },
        },
      ],
      bs: [mkBS(2025, { cash: 100 })],
    });
    expect(getLatestPeriod(c)).toEqual({ year: 2026, granularity: 'Q', index: 1 });
  });
});

describe('deriveLatestRevenue', () => {
  it('小米 2025 真实数据：rev_total → 百万元', () => {
    const c = mkCompany({ is: [mkIS(2025, 457_286_687_000, null, null)] });
    const r = deriveLatestRevenue(c);
    expect(r).not.toBeNull();
    expect(r!.value).toBeCloseTo(457_286.687, 3);
    expect(r!.unit).toBe('million_yuan');
    expect(r!.asOf).toBe('2025-12-31');
    expect(r!.formula).toMatch(/rev_total/);
    expect(r!.components).toHaveLength(1);
    expect(r!.components[0].rawValue).toBe(457_286_687_000);
  });
  it('多年时取最新', () => {
    const c = mkCompany({ is: [mkIS(2023, 270e9, null, null), mkIS(2025, 457e9, null, null)] });
    const r = deriveLatestRevenue(c);
    expect(r!.value).toBeCloseTo(457_000, 0);
  });
  it('rev_total = null → value=null, raw=null', () => {
    const c = mkCompany({ is: [mkIS(2025, null, null, null)] });
    const r = deriveLatestRevenue(c);
    expect(r!.value).toBeNull();
    expect(r!.components[0].rawValue).toBeNull();
  });
  it('无 IS 期间 → null（整体）', () => {
    expect(deriveLatestRevenue(mkCompany({}))).toBeNull();
  });
});

describe('deriveLatestNetIncomeParent', () => {
  it('小米 2025: ni_parent=41,566,439,000 → 41,566.439 百万元', () => {
    const c = mkCompany({ is: [mkIS(2025, null, null, 41_566_439_000)] });
    const r = deriveLatestNetIncomeParent(c);
    expect(r!.value).toBeCloseTo(41_566.439, 3);
    expect(r!.asOf).toBe('2025-12-31');
  });
});

describe('deriveLatestParentEquity', () => {
  it('小米 2025: parent_equity=266,218,661,000 → 266,218.661 百万元', () => {
    const c = mkCompany({ bs: [mkBS(2025, { parent_equity: 266_218_661_000 })] });
    const r = deriveLatestParentEquity(c);
    expect(r!.value).toBeCloseTo(266_218.661, 3);
  });
});

describe('deriveNetCashConservative', () => {
  it('小米 2025 BS：所有负债=0，cash + st_inv = 78,423.043 百万元', () => {
    const c = mkCompany({
      bs: [
        mkBS(2025, {
          cash: 26_914_377_000,
          st_investments: 51_508_666_000,
          st_debt: 0,
          notes_payable: 0,
          lt_debt_current: 0,
          lt_debt: 0,
          bonds_payable: 0,
        }),
      ],
    });
    const r = deriveNetCashConservative(c);
    expect(r!.value).toBeCloseTo(78_423.043, 3);
    // 必须暴露完整 7 项 components 让用户看清楚来源
    expect(r!.components).toHaveLength(7);
    expect(r!.components.map((x) => x.name)).toEqual([
      '+ cash',
      '+ st_investments',
      '− st_debt',
      '− notes_payable',
      '− lt_debt_current',
      '− lt_debt',
      '− bonds_payable',
    ]);
  });
  it('任一字段 null → value=null（不能猜测）', () => {
    const c = mkCompany({
      bs: [mkBS(2025, { cash: 100e9, st_investments: 50e9, st_debt: null, notes_payable: 0, lt_debt_current: 0, lt_debt: 0, bonds_payable: 0 })],
    });
    const r = deriveNetCashConservative(c);
    expect(r!.value).toBeNull();
    // 但 components 仍展示给用户看哪项缺
    expect(r!.components.find((x) => x.name === '− st_debt')!.rawValue).toBeNull();
  });
  it('负债不为 0 时正确扣减', () => {
    const c = mkCompany({
      bs: [mkBS(2025, {
        cash: 100_000_000_000, st_investments: 50_000_000_000,
        st_debt: 20_000_000_000, notes_payable: 10_000_000_000,
        lt_debt_current: 5_000_000_000, lt_debt: 15_000_000_000, bonds_payable: 30_000_000_000,
      })],
    });
    const r = deriveNetCashConservative(c);
    // = (100 + 50) − (20 + 10 + 5 + 15 + 30) = 150 − 80 = 70 亿
    expect(r!.value).toBeCloseTo(70_000, 0);
  });
  it('无 BS 期间 → null（整体）', () => {
    expect(deriveNetCashConservative(mkCompany({}))).toBeNull();
  });
});

describe('deriveRevenueSeries', () => {
  it('5 年序列按时间升序', () => {
    const c = mkCompany({
      is: [
        mkIS(2024, 365e9, null, null),
        mkIS(2021, 328e9, null, null),
        mkIS(2025, 457e9, null, null),
        mkIS(2022, 280e9, null, null),
        mkIS(2023, 270e9, null, null),
      ],
    });
    const s = deriveRevenueSeries(c);
    expect(s.points.map((p) => p.period.year)).toEqual([2021, 2022, 2023, 2024, 2025]);
    expect(s.points[0].value).toBeCloseTo(328_000, 0);
    expect(s.points[4].value).toBeCloseTo(457_000, 0);
  });
});

describe('deriveNetIncomeSeries', () => {
  it('用真实小米数据，2022 利润骤降反映正确', () => {
    const c = mkCompany({
      is: [
        mkIS(2021, null, null, 19_283_235_000),
        mkIS(2022, null, null, 2_502_568_000),
        mkIS(2023, null, null, 17_474_196_000),
        mkIS(2024, null, null, 23_578_449_000),
        mkIS(2025, null, null, 41_566_439_000),
      ],
    });
    const s = deriveNetIncomeSeries(c);
    expect(s.points[0].value).toBeCloseTo(19_283.235, 3);
    expect(s.points[1].value).toBeCloseTo(2_502.568, 3); // 2022 骤降
    expect(s.points[4].value).toBeCloseTo(41_566.439, 3); // 2025 强势恢复
  });
});

describe('deriveGrossMarginSeries', () => {
  it('小米 2021: gp/rev = 22,029/328,309 = 6.71%', () => {
    const c = mkCompany({
      is: [mkIS(2021, 328_309_145_000, 22_029_178_000, null)],
    });
    const s = deriveGrossMarginSeries(c);
    expect(s[0].value).toBeCloseTo(22_029_178_000 / 328_309_145_000, 4);
  });
  it('gp 或 rev 任一为 null → 该点 null', () => {
    const c = mkCompany({ is: [mkIS(2021, 100e9, null, null)] });
    expect(deriveGrossMarginSeries(c)[0].value).toBeNull();
  });
  it('rev=0 → null（防除零）', () => {
    const c = mkCompany({ is: [mkIS(2021, 0, 100e9, null)] });
    expect(deriveGrossMarginSeries(c)[0].value).toBeNull();
  });
});

describe('deriveNetMarginSeries', () => {
  it('小米 2025 净利率 = 41566 / 457287 = 9.09%', () => {
    const c = mkCompany({
      is: [mkIS(2025, 457_286_687_000, null, 41_566_439_000)],
    });
    const s = deriveNetMarginSeries(c);
    expect(s[0].value).toBeCloseTo(41_566_439_000 / 457_286_687_000, 4);
  });
});

describe('yoy', () => {
  it('第一个点 YoY=null；后续点正确', () => {
    const c = mkCompany({
      is: [
        mkIS(2023, 270_970_141_000, null, null),
        mkIS(2024, 365_906_350_000, null, null),
        mkIS(2025, 457_286_687_000, null, null),
      ],
    });
    const y = yoy(deriveRevenueSeries(c));
    expect(y[0].value).toBeNull();
    // 2024 YoY = (365,906 − 270,970) / 270,970 ≈ 35.04%
    expect(y[1].value).toBeCloseTo(0.3504, 3);
    expect(y[2].value).toBeCloseTo(0.2497, 3);
  });
  it('前期为 0 → 该点 YoY=null（无意义）', () => {
    const c = mkCompany({ is: [mkIS(2023, 0, null, null), mkIS(2024, 100e9, null, null)] });
    expect(yoy(deriveRevenueSeries(c))[1].value).toBeNull();
  });
  it('前期为负 → 用 abs 防止符号翻转', () => {
    // 边界：通常营收不会负，但若 ni 为负需 abs。这里用 mock 验证逻辑
    const c = mkCompany({ is: [mkIS(2023, -100e9, null, null), mkIS(2024, 100e9, null, null)] });
    const y = yoy(deriveRevenueSeries(c));
    // (100 − (−100)) / |−100| = 2.0 → 增长 200%
    expect(y[1].value).toBeCloseTo(2.0, 2);
  });
});
