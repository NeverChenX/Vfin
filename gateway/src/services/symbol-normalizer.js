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

  if (['btc', 'bitcoin', '比特币'].includes(value)) {
    return { market: 'crypto', symbol: 'BTCUSD.crypto' };
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

  // 港股指数 / 字母代码：HSI、HSCEI、HSTECH、CES100 等
  // Tencent 端 URL 形如 `hkHSI`，buildTencentSymbol 已正确处理 ${market}${code}
  if (/^[a-z]{2,6}\.hk$/.test(value)) {
    const code = value.replace(/\.hk$/, '').toUpperCase();
    return { market: 'hk', symbol: `${code}.hk` };
  }

  if (/^\d{6}$/.test(value)) {
    if (value.startsWith('6')) {
      return { market: 'sh', symbol: `${value}.sh` };
    }

    if (/^[03]/.test(value)) {
      return { market: 'sz', symbol: `${value}.sz` };
    }

    // 可转债: 110xxx/113xxx → 上交所, 123xxx/127xxx/128xxx → 深交所
    if (/^(110|113)/.test(value)) {
      return { market: 'sh', symbol: `${value}.sh` };
    }

    if (/^(123|127|128)/.test(value)) {
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

  // FX / 商品 / 非美海外指数：字母代码（含数字，如 N225）+ 后缀
  // 必须在通用美股匹配前检查，否则会被当成美股处理
  if (/^[a-z0-9]{2,8}\.fx$/.test(value)) {
    const code = value.replace(/\.fx$/, '').toUpperCase();
    return { market: 'fx', symbol: `${code}.fx` };
  }

  if (/^[a-z0-9]{1,8}\.cm$/.test(value)) {
    const code = value.replace(/\.cm$/, '').toUpperCase();
    return { market: 'cm', symbol: `${code}.cm` };
  }

  if (/^[a-z0-9]{1,8}\.(jp|de|uk)$/.test(value)) {
    const lastDot = value.lastIndexOf('.');
    const code = value.slice(0, lastDot).toUpperCase();
    const mkt = value.slice(lastDot + 1);
    return { market: mkt, symbol: `${code}.${mkt}` };
  }

  if (/^[a-z0-9]{3,12}\.crypto$/.test(value)) {
    const code = value.replace(/\.crypto$/, '').toUpperCase();
    return { market: 'crypto', symbol: `${code}.crypto` };
  }

  // 美股代码可能含子类后缀（BRK.B、BF.B 等），保留代码段中的点
  if (/^[a-z]{1,5}(\.[a-z]{1,3})?\.us$/.test(value)) {
    const lastDot = value.lastIndexOf('.');
    const code = value.slice(0, lastDot);
    return { market: 'us', symbol: `${code.toUpperCase()}.us` };
  }

  if (/^[a-z]{1,5}(\.[a-z]{1,3})?$/.test(value)) {
    return { market: 'us', symbol: `${value.toUpperCase()}.us` };
  }

  throw createInvalidSymbolError(input);
}
