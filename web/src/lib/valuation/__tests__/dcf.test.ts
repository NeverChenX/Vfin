import { describe, it, expect } from 'vitest';
import {
  computeDcf,
  computeSensitivity,
  deriveDefaultFcfMargin,
  deriveDefaultGrowthRates,
  type DcfAssumptions,
  type DcfBaseInputs,
} from '../dcf';

// ─── 小米 base case (手算预期，用作 sanity check) ──────────────────────
//
// 已知 (从 01810.json 实算)：
//   base revenue (2025) = 457,286.687 百万元 (4572.87 亿)
//   3 年均 FCF = 29,467 百万元 (294.67 亿)
//   3 年均 FCF margin = 29,467 / 36,472 = 8.08%
//   net cash (保守) = 78,423 百万元 (784.23 亿)
//
// base case 假设：
//   revGrowthRates = [0.15, 0.12, 0.10, 0.08, 0.06]
//   fcfMargin = 0.08
//   discountRate = 0.10
//   perpetualGrowthRate = 0.03
//
// 手算预期：
//   Year 1: rev = 4572.87 * 1.15 = 5258.80; FCF = 420.70; PV = 420.70 / 1.10 = 382.46
//   Year 2: rev = 5258.80 * 1.12 = 5889.86; FCF = 471.19; PV = 471.19 / 1.21 = 389.41
//   Year 3: rev = 5889.86 * 1.10 = 6478.85; FCF = 518.31; PV = 518.31 / 1.331 = 389.41
//   Year 4: rev = 6478.85 * 1.08 = 6997.16; FCF = 559.77; PV = 559.77 / 1.4641 = 382.33
//   Year 5: rev = 6997.16 * 1.06 = 7416.99; FCF = 593.36; PV = 593.36 / 1.61051 = 368.43
//   ForecastPv sum ≈ 1912.04 (亿)
//   TV = 593.36 * 1.03 / (0.10 - 0.03) = 611.16 / 0.07 = 8730.86
//   TV PV = 8730.86 / 1.61051 = 5421.83
//   EV = 1912.04 + 5421.83 = 7333.87
//   Equity = EV + 784.23 = 8118.10 (亿元)
//
// 我们的代码以百万为单位算，所以预期 equityValue ≈ 811,810 百万元

const XIAOMI_BASE: DcfBaseInputs = {
  baseRevenue: 457_286.687,
  netCash: 78_423.043,
};

const XIAOMI_ASSUMPTIONS: DcfAssumptions = {
  forecastYears: 5,
  revGrowthRates: [0.15, 0.12, 0.10, 0.08, 0.06],
  fcfMargin: 0.08,
  discountRate: 0.10,
  perpetualGrowthRate: 0.03,
};

describe('computeDcf — 小米 base case', () => {
  const r = computeDcf(XIAOMI_ASSUMPTIONS, XIAOMI_BASE);

  it('rows 数量等于 forecastYears', () => {
    expect(r.rows).toHaveLength(5);
  });
  it('Year 1: 营收 = 4572.87 * 1.15 ≈ 5258.80 亿', () => {
    expect(r.rows[0].revenue).toBeCloseTo(525_879.69, 0); // 单位百万
  });
  it('Year 5: 营收 = 7417 亿', () => {
    expect(r.rows[4].revenue).toBeCloseTo(741_699, -2);
  });
  it('Year 5 FCF = 593.36 亿', () => {
    expect(r.rows[4].fcf).toBeCloseTo(59_336, -1);
  });
  it('discountFactor 单调递减', () => {
    for (let i = 1; i < r.rows.length; i++) {
      expect(r.rows[i].discountFactor).toBeLessThan(r.rows[i - 1].discountFactor);
    }
  });
  it('预测期 FCF 现值合计 ≈ 1912 亿', () => {
    expect(r.forecastPvSum).toBeCloseTo(191_200, -3);
  });
  it('终值 ≈ 8731 亿', () => {
    expect(r.terminalValue).toBeCloseTo(873_086, -3);
  });
  it('终值现值 ≈ 5422 亿', () => {
    expect(r.terminalValuePv).toBeCloseTo(542_183, -3);
  });
  it('企业价值 EV ≈ 7334 亿', () => {
    expect(r.enterpriseValue).toBeCloseTo(733_383, -3);
  });
  it('股权价值 ≈ 8118 亿 (含 784 亿净现金)', () => {
    expect(r.equityValue).toBeCloseTo(811_806, -3);
  });
  it('无 warning', () => {
    expect(r.warnings).toHaveLength(0);
  });
});

describe('computeDcf — 边界场景', () => {
  it('永续增长率 ≥ 折现率 → warning + terminalValue=0', () => {
    const r = computeDcf({ ...XIAOMI_ASSUMPTIONS, perpetualGrowthRate: 0.10 }, XIAOMI_BASE);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.warnings[0]).toMatch(/永续增长率/);
    expect(r.terminalValue).toBe(0);
    expect(r.terminalValuePv).toBe(0);
  });

  it('增长率序列长度不匹配 → warning', () => {
    const r = computeDcf(
      { ...XIAOMI_ASSUMPTIONS, revGrowthRates: [0.15, 0.10] },
      XIAOMI_BASE,
    );
    expect(r.warnings.some((w) => /revGrowthRates 长度/.test(w))).toBe(true);
  });

  it('净现金为负 (净负债) → 股权价值小于 EV', () => {
    const r = computeDcf(XIAOMI_ASSUMPTIONS, { ...XIAOMI_BASE, netCash: -10_000 });
    expect(r.equityValue).toBeLessThan(r.enterpriseValue);
    expect(r.equityValue).toBeCloseTo(r.enterpriseValue - 10_000, 2);
  });

  it('零增长 (g=0) 全程 → FCF = baseRev × margin × N + TV', () => {
    const r = computeDcf(
      {
        forecastYears: 3,
        revGrowthRates: [0, 0, 0],
        fcfMargin: 0.10,
        discountRate: 0.10,
        perpetualGrowthRate: 0,
      },
      { baseRevenue: 1000, netCash: 0 },
    );
    // Year 1-3: rev=1000, FCF=100; PV = 100/1.1 + 100/1.21 + 100/1.331 ≈ 248.69
    expect(r.forecastPvSum).toBeCloseTo(248.69, 1);
    // TV at end of year 3: FCF_4 / (0.10 - 0) = 100 / 0.10 = 1000
    expect(r.terminalValue).toBeCloseTo(1000, 1);
    expect(r.terminalValuePv).toBeCloseTo(1000 / 1.331, 1);
  });
});

describe('deriveDefaultFcfMargin', () => {
  it('用小米 2023-2025 三年实算: FCF=29467/Rev=109417 ≈ 8.08% (注: 2024/2025 FCF 不同)', () => {
    // 模拟 3 年均值口径
    const pairs = [
      { fcf: 35_031, revenue: 270_970 }, // 2023
      { fcf: 31_998, revenue: 365_906 }, // 2024
      { fcf: 21_373, revenue: 457_287 }, // 2025
    ];
    const m = deriveDefaultFcfMargin(pairs);
    expect(m).not.toBeNull();
    const total = (35_031 + 31_998 + 21_373) / (270_970 + 365_906 + 457_287);
    expect(m!).toBeCloseTo(total, 5);
  });
  it('< 2 个点 → null', () => {
    expect(deriveDefaultFcfMargin([])).toBeNull();
    expect(deriveDefaultFcfMargin([{ fcf: 100, revenue: 1000 }])).toBeNull();
  });
});

describe('deriveDefaultGrowthRates', () => {
  it('小米近 3 年营收: CAGR(270970→365906→457287) ≈ 30%/年, 5 年衰减序列', () => {
    const out = deriveDefaultGrowthRates([270_970, 365_906, 457_287]);
    expect(out).not.toBeNull();
    expect(out!).toHaveLength(5);
    // CAGR 3 年 = (457287/270970)^(1/2) - 1 = 0.2997 ≈ 30%
    // 精确 CAGR (3 年): (457287/270970)^(1/2) - 1 = 0.2991
    expect(out![0]).toBeCloseTo(0.2991, 3);
    expect(out![1]).toBeCloseTo(0.2991 * 0.8, 3);
    expect(out![4]).toBeCloseTo(0.2991 * 0.4, 3);
  });
  it('用 5 年完整: CAGR(2021→2025) ≈ (457287/328309)^(1/4)-1 ≈ 8.65%', () => {
    // 但实现用最近 3 年, 所以仍然是 30%
    const out = deriveDefaultGrowthRates([328_309, 280_044, 270_970, 365_906, 457_287]);
    expect(out![0]).toBeCloseTo(0.2991, 3);
  });
  it('< 2 点 → null', () => {
    expect(deriveDefaultGrowthRates([100])).toBeNull();
    expect(deriveDefaultGrowthRates([])).toBeNull();
  });
  it('起始 ≤ 0 → null（防止 CAGR 公式发散）', () => {
    expect(deriveDefaultGrowthRates([0, 100, 200])).toBeNull();
  });
});

describe('computeSensitivity', () => {
  it('5x5 矩阵尺寸正确', () => {
    const grid = computeSensitivity({
      base: XIAOMI_ASSUMPTIONS,
      baseInputs: XIAOMI_BASE,
      firstYearGrowthGrid: [0.05, 0.10, 0.15, 0.20, 0.25],
      discountRateGrid: [0.06, 0.08, 0.10, 0.12, 0.14],
    });
    expect(grid).toHaveLength(5);
    expect(grid[0]).toHaveLength(5);
  });

  it('折现率越低 / 增长率越高 → 估值越高（4 角校验）', () => {
    const grid = computeSensitivity({
      base: XIAOMI_ASSUMPTIONS,
      baseInputs: XIAOMI_BASE,
      firstYearGrowthGrid: [0.05, 0.25],
      discountRateGrid: [0.06, 0.14],
    });
    // grid[i][j]: i=growth, j=discount
    const lowG_lowR = grid[0][0].equityValue;   // 低增长 + 低折现
    const lowG_highR = grid[0][1].equityValue;  // 低增长 + 高折现
    const highG_lowR = grid[1][0].equityValue;  // 高增长 + 低折现 (最大)
    const highG_highR = grid[1][1].equityValue; // 高增长 + 高折现

    expect(highG_lowR).toBeGreaterThan(lowG_lowR);   // 增长越高估值越高
    expect(lowG_lowR).toBeGreaterThan(lowG_highR);   // 折现率越低估值越高
    expect(highG_lowR).toBeGreaterThan(highG_highR); // 同上
  });
});
