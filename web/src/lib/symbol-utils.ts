/**
 * 股票代码 / 公司名 显示辅助
 */

export type Market = 'sh' | 'sz' | 'bj' | 'hk' | 'us' | string;

export function detectMarket(symbol: string): Market {
  const lower = symbol.toLowerCase();
  if (lower.includes('.')) return lower.split('.').pop() as Market;
  if (/^\d{6}$/.test(lower)) {
    if (/^(6|9|110|113)/.test(lower)) return 'sh';
    return 'sz';
  }
  if (/^\d{5}$/.test(lower) || /^0\d{4}$/.test(lower)) return 'hk';
  return 'us';
}

export function isAShare(symbol: string): boolean {
  const m = detectMarket(symbol);
  return m === 'sh' || m === 'sz' || m === 'bj';
}

/** 把 detectMarket 的细分代码（sh/sz/bj/hk/us）卷成 A 股 / 港股 / 美股三组 */
export type MarketGroup = 'A' | 'HK' | 'US' | 'other';
export function marketGroup(symbol: string): MarketGroup {
  const m = detectMarket(symbol);
  if (m === 'sh' || m === 'sz' || m === 'bj') return 'A';
  if (m === 'hk') return 'HK';
  if (m === 'us') return 'US';
  return 'other';
}

/** 港股 06030 / 美股 TSLA — 用作中文名后的英文/简码副标题 */
export function shortCode(symbol: string): string {
  const lower = symbol.toLowerCase();
  if (lower.includes('.')) {
    const [code, market] = lower.split('.');
    if (market === 'us') return code.toUpperCase();
    return code; // 港股保持数字，A 股也用数字
  }
  return symbol.toUpperCase();
}

/** 给定 quote.name + symbol，返回 {primary, secondary}: A 股仅中文；港美股中文+简码 */
export function buildDisplayName(symbol: string, name?: string): { primary: string; secondary?: string } {
  const fallback = symbol.toUpperCase();
  const trimmed = name?.trim();
  const primary = trimmed && trimmed !== symbol ? trimmed : fallback;
  if (isAShare(symbol)) return { primary };
  return { primary, secondary: shortCode(symbol) };
}
