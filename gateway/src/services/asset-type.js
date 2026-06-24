export function inferAssetType(symbol, market) {
  const normalizedSymbol = String(symbol ?? '').toLowerCase();
  const normalizedMarket = String(market ?? '').toLowerCase();
  const code = normalizedSymbol.split('.')[0];

  if (normalizedMarket === 'crypto' || normalizedSymbol.endsWith('.crypto')) return 'crypto';
  if (/^(110|113|123|127|128)\d{3}$/.test(code)) return 'bond';
  if (['sh', 'sz', 'bj', 'hk', 'us'].includes(normalizedMarket)) return 'stock';
  return 'other';
}
