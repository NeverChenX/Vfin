/**
 * 比率计算（ROE / ROA / 毛利率 / 净利率）
 *
 * 设计：从 IS + BS 计算这些"派生"指标。
 * PE / PB / 股息率 需要市值，目前只有 CSV 通道（01811）有；其他通道留 null。
 */

import type { CompanyFinancials, KeyMetricsRow, PeriodKey, PeriodValues } from '@/types/finance';

const round = (n: number, decimals = 4) => {
  const m = Math.pow(10, decimals);
  return Math.round(n * m) / m;
};

const safeDiv = (a: number | null | undefined, b: number | null | undefined): number | null => {
  if (a === null || a === undefined || b === null || b === undefined) return null;
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  return round(a / b);
};

function periodKey(p: PeriodKey): string {
  return p.granularity === 'Y'
    ? String(p.year)
    : `${p.year}${p.granularity}${p.index ?? ''}`;
}

/**
 * 按 period 合并三表 + 已有的 ratios（CSV 通道带 pe/pb），算出最终 KeyMetricsRow。
 */
export function buildRatios(company: CompanyFinancials): KeyMetricsRow[] {
  const { IS, BS } = company.statements;
  const isByKey = new Map<string, PeriodValues>();
  const bsByKey = new Map<string, PeriodValues>();
  for (const p of IS.periods) isByKey.set(periodKey(p.period), p);
  for (const p of BS.periods) bsByKey.set(periodKey(p.period), p);

  const existing = new Map<string, KeyMetricsRow>();
  for (const r of company.ratios ?? []) existing.set(periodKey(r.period), r);

  const allKeys = new Set<string>([...isByKey.keys(), ...bsByKey.keys()]);
  const rows: KeyMetricsRow[] = [];

  for (const k of allKeys) {
    const is = isByKey.get(k);
    const bs = bsByKey.get(k);
    if (!is && !bs) continue;
    const period: PeriodKey = (is?.period ?? bs!.period);

    const isV = (is?.values ?? {}) as Record<string, number | null | undefined>;
    const bsV = (bs?.values ?? {}) as Record<string, number | null | undefined>;

    const ni_parent = isV.ni_parent ?? isV.net_income ?? null;
    const net_income = isV.net_income ?? null;
    const rev_total = isV.rev_total ?? null;
    const gross_profit = isV.gross_profit ?? null;
    const parent_equity = bsV.parent_equity ?? bsV.total_equity ?? null;
    const total_assets = bsV.total_assets ?? null;

    const roe = safeDiv(ni_parent, parent_equity);
    const roa = safeDiv(net_income, total_assets);
    const gross_margin = safeDiv(gross_profit, rev_total);
    const net_margin = safeDiv(net_income, rev_total);

    // 合并已有的 (pe/pb/market_cap 等) + 新计算的 (roe/roa/margins)
    const existingValues = existing.get(k)?.values ?? {};
    rows.push({
      period,
      values: {
        ...existingValues,
        roe,
        roa,
        gross_margin,
        net_margin,
      },
    });
  }
  // 排序：年 → 半年 → 季度
  rows.sort((a, b) => {
    const sortKey = (p: PeriodKey) => {
      const off = p.granularity === 'H' ? (p.index ?? 0) * 2 :
                  p.granularity === 'Q' ? (p.index ?? 0) : 4;
      return p.year * 10 + off;
    };
    return sortKey(b.period) - sortKey(a.period); // 最新在前
  });
  return rows;
}

export function formatPctRatio(r: number | null | undefined, digits = 2): string {
  if (r === null || r === undefined || !Number.isFinite(r)) return '—';
  return `${(r * 100).toFixed(digits)}%`;
}

export function formatRatio(r: number | null | undefined, digits = 2): string {
  if (r === null || r === undefined || !Number.isFinite(r)) return '—';
  return r.toFixed(digits);
}
