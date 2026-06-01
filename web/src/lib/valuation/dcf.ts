/**
 * DCF (Discounted Cash Flow) 内在价值估算。
 *
 * 这是一个**绝对估值**模型：不依赖外部 peer 数据，仅用公司自身报表 +
 * 用户假设，算出股权内在价值估算值。
 *
 * 公式（教科书 2-stage DCF）：
 *   1. 预测期：对 N 年 FCF = base_FCF × (1+g_i) × ... 逐年递推
 *   2. 折现每年 FCF：PV_t = FCF_t / (1 + r)^t
 *   3. 终值（Gordon Growth）：TV = FCF_N × (1 + g_perp) / (r - g_perp)
 *   4. 终值现值：PV(TV) = TV / (1 + r)^N
 *   5. 企业价值 EV = Σ PV(FCF_t) + PV(TV)
 *   6. 股权价值 = EV + 净现金 (− 净负债)
 *
 * 单位：所有金额以"百万元（原币）"为单位，输出同。
 */

export interface DcfAssumptions {
  /** 预测期年数 (典型 5-10) */
  forecastYears: number;
  /** 营收年度增长率序列，长度需等于 forecastYears (如 [0.15, 0.12, 0.10, 0.08, 0.06]) */
  revGrowthRates: number[];
  /** 稳态自由现金流率 (FCF / Revenue) */
  fcfMargin: number;
  /** 折现率 WACC */
  discountRate: number;
  /** 永续增长率 (Gordon Growth)，必须 < discountRate */
  perpetualGrowthRate: number;
}

export interface DcfBaseInputs {
  /** 起始年营收 (百万) */
  baseRevenue: number;
  /** 净现金/(−净负债) (百万)，加到 EV 上得到股权价值 */
  netCash: number;
}

export interface DcfForecastRow {
  yearOffset: number;        // 1..N（相对 base 年）
  growthRate: number;        // 该年增长率
  revenue: number;           // 预测营收（百万）
  fcf: number;               // 预测 FCF（百万）= revenue * fcfMargin
  discountFactor: number;    // 1/(1+r)^t
  fcfPv: number;             // 该年 FCF 现值
}

export interface DcfResult {
  rows: DcfForecastRow[];
  forecastPvSum: number;       // 预测期 FCF 现值合计
  terminalValue: number;       // 终值 (未折现)
  terminalValuePv: number;     // 终值现值
  enterpriseValue: number;     // EV = forecastPvSum + terminalValuePv
  equityValue: number;         // 股权价值 = EV + netCash
  /** 校验：永续增长率 < 折现率（否则 TV 公式发散）*/
  warnings: string[];
}

export function computeDcf(asm: DcfAssumptions, base: DcfBaseInputs): DcfResult {
  const warnings: string[] = [];
  const n = asm.forecastYears;
  if (asm.revGrowthRates.length !== n) {
    warnings.push(`revGrowthRates 长度 ${asm.revGrowthRates.length} ≠ forecastYears ${n}`);
  }
  if (asm.perpetualGrowthRate >= asm.discountRate) {
    warnings.push(
      `永续增长率 (${(asm.perpetualGrowthRate * 100).toFixed(1)}%) ≥ 折现率 (${(asm.discountRate * 100).toFixed(1)}%)，` +
        `终值公式发散。请降低永续增长率或提高折现率。`,
    );
  }

  const rows: DcfForecastRow[] = [];
  let rev = base.baseRevenue;
  let forecastPvSum = 0;
  let lastFcf = 0;

  for (let t = 1; t <= n; t++) {
    const g = asm.revGrowthRates[t - 1] ?? 0;
    rev = rev * (1 + g);
    const fcf = rev * asm.fcfMargin;
    const discountFactor = 1 / Math.pow(1 + asm.discountRate, t);
    const fcfPv = fcf * discountFactor;
    forecastPvSum += fcfPv;
    lastFcf = fcf;
    rows.push({
      yearOffset: t,
      growthRate: g,
      revenue: rev,
      fcf,
      discountFactor,
      fcfPv,
    });
  }

  // 终值（Gordon Growth）：TV at year N = FCF_{N+1} / (r - g_perp)
  //   其中 FCF_{N+1} = FCF_N × (1 + g_perp)
  let terminalValue = 0;
  let terminalValuePv = 0;
  if (asm.discountRate > asm.perpetualGrowthRate) {
    terminalValue = (lastFcf * (1 + asm.perpetualGrowthRate)) / (asm.discountRate - asm.perpetualGrowthRate);
    const lastDf = 1 / Math.pow(1 + asm.discountRate, n);
    terminalValuePv = terminalValue * lastDf;
  } else {
    // 公式发散；置 0 + warning（已加上面）
  }

  const enterpriseValue = forecastPvSum + terminalValuePv;
  const equityValue = enterpriseValue + base.netCash;

  return { rows, forecastPvSum, terminalValue, terminalValuePv, enterpriseValue, equityValue, warnings };
}

// ─── 敏感性矩阵 ────────────────────────────────────────────────────────

export interface SensitivityAxis {
  /** 默认假设 */
  base: DcfAssumptions;
  /** 测试增长率假设（"第一年增长率"作为整体增长缩放因子） */
  firstYearGrowthGrid: number[];
  /** 测试折现率假设 */
  discountRateGrid: number[];
  /** 基础值 */
  baseInputs: DcfBaseInputs;
}

export interface SensitivityCell {
  firstYearGrowth: number;
  discountRate: number;
  equityValue: number;
}

/**
 * 敏感性矩阵：两个最敏感的假设（首年增长率 + 折现率）做笛卡尔积。
 *
 * 增长率"缩放"语义：把整个 revGrowthRates 序列等比例缩放到首年等于
 * firstYearGrowth（保持衰减节奏不变）。
 */
export function computeSensitivity(axis: SensitivityAxis): SensitivityCell[][] {
  const baseFirstGrowth = axis.base.revGrowthRates[0] ?? 0;
  return axis.firstYearGrowthGrid.map((firstYearGrowth) => {
    const scale = baseFirstGrowth !== 0 ? firstYearGrowth / baseFirstGrowth : 1;
    const scaledGrowths = axis.base.revGrowthRates.map((g) => g * scale);
    return axis.discountRateGrid.map((discountRate) => {
      const asm: DcfAssumptions = {
        ...axis.base,
        revGrowthRates: scaledGrowths,
        discountRate,
      };
      const r = computeDcf(asm, axis.baseInputs);
      return { firstYearGrowth, discountRate, equityValue: r.equityValue };
    });
  });
}

// ─── 历史派生默认值 ────────────────────────────────────────────────────

/**
 * 从近 N 年的 FCF + 营收派生 fcfMargin 默认值（用 N 年均值，平滑波动）。
 * fcfRevPairs 长度 < 2 → 返回 null（不足以稳定派生）
 */
export function deriveDefaultFcfMargin(
  fcfRevPairs: ReadonlyArray<{ fcf: number; revenue: number }>,
): number | null {
  if (fcfRevPairs.length < 2) return null;
  const totalFcf = fcfRevPairs.reduce((s, p) => s + p.fcf, 0);
  const totalRev = fcfRevPairs.reduce((s, p) => s + p.revenue, 0);
  return totalRev !== 0 ? totalFcf / totalRev : null;
}

/**
 * 从历史营收序列派生默认增长率序列：取近 3 年 CAGR 作为首年增长率，
 * 然后按 [1.0, 0.8, 0.6, 0.5, 0.4] 衰减系数生成 5 年序列（衰减到永续）。
 * 序列长度 < 2 → 返回 null。
 */
export function deriveDefaultGrowthRates(
  revenueSeries: ReadonlyArray<number>,
  forecastYears = 5,
): number[] | null {
  if (revenueSeries.length < 2) return null;
  // 用最近 3 年（如果有）的 CAGR，避免单年异常
  const useLast = Math.min(3, revenueSeries.length);
  const startIdx = revenueSeries.length - useLast;
  const start = revenueSeries[startIdx];
  const end = revenueSeries[revenueSeries.length - 1];
  if (start <= 0) return null;
  const years = useLast - 1;
  if (years <= 0) return null;
  const cagr = Math.pow(end / start, 1 / years) - 1;

  // 衰减系数表（5 年）：保持节奏，越远期增长越接近永续
  const decay = [1.0, 0.8, 0.65, 0.5, 0.4];
  const out: number[] = [];
  for (let i = 0; i < forecastYears; i++) {
    const factor = decay[Math.min(i, decay.length - 1)];
    out.push(cagr * factor);
  }
  return out;
}
