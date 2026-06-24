import type { WatchlistItem } from '@/types/market';

export type AssetType = NonNullable<WatchlistItem['assetType']>;

export function inferAssetType(item: Pick<WatchlistItem, 'symbol' | 'market' | 'assetType'>): AssetType {
  if (item.assetType) return item.assetType;
  const symbol = item.symbol.toLowerCase();
  const market = item.market?.toLowerCase();
  const code = symbol.split('.')[0];
  if (market === 'crypto' || symbol.endsWith('.crypto')) return 'crypto';
  if (/^(110|113|123|127|128)\d{3}$/.test(code)) return 'bond';
  if (['sh', 'sz', 'bj', 'hk', 'us'].includes(market ?? '') || /\.(sh|sz|bj|hk|us)$/.test(symbol)) return 'stock';
  return 'other';
}

export function assetTypeLabel(type: AssetType): string {
  if (type === 'stock') return '股票';
  if (type === 'bond') return '债券';
  if (type === 'crypto') return '数字货币';
  return '其它';
}

export function assetTypeClass(type: AssetType): string {
  if (type === 'stock') return 'border-[#F0B90B]/40 bg-[#F0B90B]/10 text-[#F0B90B]';
  if (type === 'bond') return 'border-sky-400/40 bg-sky-400/10 text-sky-300';
  if (type === 'crypto') return 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300';
  return 'border-[var(--color-border-base)] bg-[var(--color-bg-elev2)] text-[var(--color-text-tertiary)]';
}
