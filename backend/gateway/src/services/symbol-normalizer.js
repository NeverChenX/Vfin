function createInvalidSymbolError(input) {
  const value = typeof input === 'string' ? input : '';
  const error = new Error(`Invalid symbol: ${value}`);
  error.statusCode = 400;
  return error;
}

export function normalizeSymbol(input) {
  if (typeof input !== 'string') {
    throw createInvalidSymbolError(input);
  }

  const value = input.trim().toLowerCase();

  if (!value) {
    throw createInvalidSymbolError(input);
  }

  // 带明确市场后缀时直接信任，无需校验前缀（指数如 000001.sh 合法）
  if (/^\d{6}\.sh$/.test(value)) {
    return { market: 'sh', symbol: value };
  }

  if (/^\d{6}\.sz$/.test(value)) {
    return { market: 'sz', symbol: value };
  }

  if (/^\d{5}\.hk$/.test(value)) {
    return { market: 'hk', symbol: value };
  }

  if (/^\d{6}$/.test(value)) {
    if (value.startsWith('6')) {
      return { market: 'sh', symbol: `${value}.sh` };
    }

    if (/^[03]/.test(value)) {
      return { market: 'sz', symbol: `${value}.sz` };
    }

    throw createInvalidSymbolError(input);
  }

  if (/^\d{1,5}$/.test(value)) {
    return {
      market: 'hk',
      symbol: `${value.padStart(5, '0')}.hk`
    };
  }

  if (/^[a-z]{1,5}\.us$/.test(value)) {
    const [code] = value.split('.');
    return { market: 'us', symbol: `${code.toUpperCase()}.us` };
  }

  if (/^[a-z]{1,5}$/.test(value)) {
    return { market: 'us', symbol: `${value.toUpperCase()}.us` };
  }

  throw createInvalidSymbolError(input);
}
