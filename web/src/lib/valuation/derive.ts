/**
 * 从公司 JSON 报表派生估值用事实数据。零编造，全部可追溯到报表字段。
 *
 * 单位约定：
 *   - 输入：JSON 里全部 yuan/USD 原币（取决于 company.currency + company.unit）
 *   - 输出：派生函数返回 { value (百万原币), formula, components } 或 null
 *   - 转换：value = rawSum / 1_000_000（仅当 unit='yuan'）；其他 unit 由调用方决定
 */

import type { CompanyFinancials, PeriodKey, PeriodValues } from '@/types/finance';

export interface DerivedValue {
  /** 派生后的值（单位见 unit 字段）。null = 公式中含 null 项 */
  value: number | null;
  /** 单位：'million_yuan' | 'million_usd'。前端格式化按此 */
  unit: 'million_yuan' | 'million_usd';
  /** 该值对应的报表期 ISO 日期（如 '2025-12-31'） */
  asOf: string;
  /** 人类可读公式，含每个加减项 */
  formula: string;
  /** 公式各组成项及其 raw 值（null 也展示给用户看缺哪项） */
  components: ReadonlyArray<{ name: string; rawValue: number | null }>;
}

export interface DerivedSeries {
  unit: 'million_yuan' | 'million_usd';
  points: ReadonlyArray<{ period: PeriodKey; asOf: string; value: number | null }>;
}

// ─── helpers ───────────────────────────────────────────────────────────

function periodSortKey(p: PeriodKey): number {
  const idx = p.granularity === 'Q' ? (p.index ?? 0) : p.granularity === 'H' ? (p.index ?? 0) * 2 : 4;
  return p.year * 10 + idx;
}

function periodToISO(p: PeriodKey): string {
  if (p.granularity === 'Y') return `${p.year}-12-31`;
  if (p.granularity === 'H') return p.index === 1 ? `${p.year}-06-30` : `${p.year}-12-31`;
  if (p.granularity === 'Q') {
    const m = p.index === 1 ? '03-31' : p.index === 2 ? '06-30' : p.index === 3 ? '09-30' : '12-31';
    return `${p.year}-${m}`;
  }
  return '';
}

function pickUnit(c: CompanyFinancials): 'million_yuan' | 'million_usd' {
  // unit='yuan'（元）→ 派生输出统一换为百万。currency 字段在 fetcher 中常有 bug
  // （如小米被标 USD 实为 CNY），但 unit='yuan' 是 raw 数值单位的事实，更可靠。
  return c.unit === 'yuan' ? 'million_yuan' : 'million_usd';
}

/** 取所有年报期，按时间升序排列（最旧 → 最新） */
function annualPeriods(c: CompanyFinancials, statementId: 'IS' | 'BS' | 'CF'): PeriodValues[] {
  return [...c.statements[statementId].periods]
    .filter((p) => p.period.granularity === 'Y')
    .sort((a, b) => periodSortKey(a.period) - periodSortKey(b.period));
}

/** 取最新年报期 */
function latestAnnual(c: CompanyFinancials, statementId: 'IS' | 'BS' | 'CF'): PeriodValues | null {
  const periods = annualPeriods(c, statementId);
  return periods.length > 0 ? periods[periods.length - 1] : null;
}

function asNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** raw（元） → 百万（除以 1e6）。null 透传 */
function toMillion(raw: number | null): number | null {
  return raw === null ? null : raw / 1_000_000;
}

// ─── public API ────────────────────────────────────────────────────────

/** 最新报表期（取 IS / BS / CF 三表中最晚的年报） */
export function getLatestAnnualPeriod(c: CompanyFinancials): PeriodKey | null {
  const candidates = (['IS', 'BS', 'CF'] as const)
    .map((s) => latestAnnual(c, s)?.period ?? null)
    .filter((p): p is PeriodKey => p !== null);
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (periodSortKey(a) > periodSortKey(b) ? a : b));
}

/** 最新年报营收 (LTM 年报口径) */
export function deriveLatestRevenue(c: CompanyFinancials): DerivedValue | null {
  const p = latestAnnual(c, 'IS');
  if (!p) return null;
  const raw = asNum(p.values.rev_total);
  return {
    value: toMillion(raw),
    unit: pickUnit(c),
    asOf: periodToISO(p.period),
    formula: 'rev_total（最新年报）',
    components: [{ name: 'rev_total', rawValue: raw }],
  };
}

/** 最新年报归母净利润 */
export function deriveLatestNetIncomeParent(c: CompanyFinancials): DerivedValue | null {
  const p = latestAnnual(c, 'IS');
  if (!p) return null;
  const raw = asNum(p.values.ni_parent);
  return {
    value: toMillion(raw),
    unit: pickUnit(c),
    asOf: periodToISO(p.period),
    formula: 'ni_parent（归属母公司股东净利润，最新年报）',
    components: [{ name: 'ni_parent', rawValue: raw }],
  };
}

/** 最新年报归母权益 */
export function deriveLatestParentEquity(c: CompanyFinancials): DerivedValue | null {
  const p = latestAnnual(c, 'BS');
  if (!p) return null;
  const raw = asNum(p.values.parent_equity);
  return {
    value: toMillion(raw),
    unit: pickUnit(c),
    asOf: periodToISO(p.period),
    formula: 'parent_equity（归属母公司股东权益，最新 BS）',
    components: [{ name: 'parent_equity', rawValue: raw }],
  };
}

/**
 * 净现金（保守口径）= cash + st_investments − (st_debt + notes_payable
 *   + lt_debt_current + lt_debt + bonds_payable)
 *
 * ⚠ 这是保守口径，可能严重低估：
 *   1. 公司常有"定期存款 / 长期投资中的金融资产"未计入 cash/st_investments
 *   2. 数据源（stockanalysis.com）对小型有息负债字段映射不全（如把银行借款合并到 other_cl）
 *
 * 用户可在 valuation 配置中填 netCashOverride + sourceUrl 覆盖。
 */
export function deriveNetCashConservative(c: CompanyFinancials): DerivedValue | null {
  const p = latestAnnual(c, 'BS');
  if (!p) return null;
  const v = p.values;
  const cash = asNum(v.cash);
  const stInv = asNum(v.st_investments);
  const stDebt = asNum(v.st_debt);
  const notesPay = asNum(v.notes_payable);
  const ltDebtCur = asNum(v.lt_debt_current);
  const ltDebt = asNum(v.lt_debt);
  const bondsPay = asNum(v.bonds_payable);

  const components = [
    { name: '+ cash', rawValue: cash },
    { name: '+ st_investments', rawValue: stInv },
    { name: '− st_debt', rawValue: stDebt },
    { name: '− notes_payable', rawValue: notesPay },
    { name: '− lt_debt_current', rawValue: ltDebtCur },
    { name: '− lt_debt', rawValue: ltDebt },
    { name: '− bonds_payable', rawValue: bondsPay },
  ];

  const anyNull = components.some((x) => x.rawValue === null);
  let raw: number | null = null;
  if (!anyNull) {
    raw = (cash as number) + (stInv as number)
      - (stDebt as number) - (notesPay as number) - (ltDebtCur as number)
      - (ltDebt as number) - (bondsPay as number);
  }

  return {
    value: toMillion(raw),
    unit: pickUnit(c),
    asOf: periodToISO(p.period),
    formula: '(cash + st_investments) − (st_debt + notes_payable + lt_debt_current + lt_debt + bonds_payable)',
    components,
  };
}

/** 5 年（或可用年数）营收序列，按时间升序 */
export function deriveRevenueSeries(c: CompanyFinancials): DerivedSeries {
  const periods = annualPeriods(c, 'IS');
  return {
    unit: pickUnit(c),
    points: periods.map((p) => ({
      period: p.period,
      asOf: periodToISO(p.period),
      value: toMillion(asNum(p.values.rev_total)),
    })),
  };
}

/** 5 年归母净利润序列 */
export function deriveNetIncomeSeries(c: CompanyFinancials): DerivedSeries {
  const periods = annualPeriods(c, 'IS');
  return {
    unit: pickUnit(c),
    points: periods.map((p) => ({
      period: p.period,
      asOf: periodToISO(p.period),
      value: toMillion(asNum(p.values.ni_parent)),
    })),
  };
}

/** 毛利率序列：gross_profit / rev_total。每点独立校验，缺一项即 null */
export function deriveGrossMarginSeries(c: CompanyFinancials): ReadonlyArray<{ asOf: string; value: number | null }> {
  return annualPeriods(c, 'IS').map((p) => {
    const gp = asNum(p.values.gross_profit);
    const rev = asNum(p.values.rev_total);
    return {
      asOf: periodToISO(p.period),
      value: gp !== null && rev !== null && rev !== 0 ? gp / rev : null,
    };
  });
}

/** 净利率序列：ni_parent / rev_total */
export function deriveNetMarginSeries(c: CompanyFinancials): ReadonlyArray<{ asOf: string; value: number | null }> {
  return annualPeriods(c, 'IS').map((p) => {
    const ni = asNum(p.values.ni_parent);
    const rev = asNum(p.values.rev_total);
    return {
      asOf: periodToISO(p.period),
      value: ni !== null && rev !== null && rev !== 0 ? ni / rev : null,
    };
  });
}

/** YoY 增长序列。需要 ≥2 个点；第一个点的 YoY 为 null（无前一期） */
export function yoy(series: DerivedSeries): ReadonlyArray<{ asOf: string; value: number | null }> {
  const points = series.points;
  return points.map((p, i) => {
    if (i === 0) return { asOf: p.asOf, value: null };
    const prev = points[i - 1].value;
    if (p.value === null || prev === null || prev === 0) return { asOf: p.asOf, value: null };
    return { asOf: p.asOf, value: (p.value - prev) / Math.abs(prev) };
  });
}
