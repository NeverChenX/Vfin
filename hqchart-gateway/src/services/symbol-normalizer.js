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

  if (/^\d{6}\.sh$/.test(value)) {
    if (!value.startsWith('6')) {
      throw createInvalidSymbolError(input);
    }

    return { market: 'sh', symbol: value };
  }

  if (/^\d{6}\.sz$/.test(value)) {
    if (!/^[03]/.test(value)) {
      throw createInvalidSymbolError(input);
    }

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

  throw createInvalidSymbolError(input);
}
