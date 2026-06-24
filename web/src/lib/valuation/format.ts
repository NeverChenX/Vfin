import type { SotpCurrency } from '@/types/valuation';

const N = new Intl.NumberFormat('en-US');

/**
 * 大数本地化格式化。输入：金额（百万为单位）+ 币种。
 *
 * 换算: 1 百万 = 100 万 = 0.01 亿 (CN/HK)；1 百万 = 1 M = 0.001 B (US)
 *
 * 显示规则见 format.test.ts 顶部注释。
 */
export function formatMoney(
  amountMillions: number | null | undefined,
  currency: SotpCurrency,
): string {
  if (amountMillions === null || amountMillions === undefined || !Number.isFinite(amountMillions)) {
    return '--';
  }
  if (currency === 'USD') {
    if (Math.abs(amountMillions) >= 1000) {
      return `USD ${(amountMillions / 1000).toFixed(2)} B`;
    }
    return `USD ${N.format(Math.round(amountMillions))} M`;
  }
  // CNY / HKD
  if (Math.abs(amountMillions) >= 100) {
    const yi = amountMillions / 100;
    if (Math.abs(yi) >= 100) {
      return `${currency} ${N.format(Math.round(yi))} 亿`;
    }
    return `${currency} ${yi.toFixed(2)} 亿`;
  }
  const wan = amountMillions * 100;
  return `${currency} ${N.format(Math.round(wan))} 万`;
}

export function formatMultiple(m: number | null | undefined): string {
  if (m === null || m === undefined || !Number.isFinite(m)) return '--';
  return `${m.toFixed(2)}x`;
}

export function formatPct(p: number | null | undefined): string {
  if (p === null || p === undefined || !Number.isFinite(p)) return '--';
  const sign = p >= 0 ? '+' : '';
  return `${sign}${(p * 100).toFixed(1)}%`;
}
