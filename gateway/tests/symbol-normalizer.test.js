import { describe, expect, it } from 'vitest';
import { normalizeSymbol } from '../src/services/symbol-normalizer.js';

describe('normalizeSymbol', () => {
  it('keeps fully qualified A-share symbols unchanged', () => {
    expect(normalizeSymbol('600000.sh')).toEqual({
      market: 'sh',
      symbol: '600000.sh'
    });
    expect(normalizeSymbol('000001.sz')).toEqual({
      market: 'sz',
      symbol: '000001.sz'
    });
    // 带明确后缀的指数代码也应被接受（如上证综指 000001.sh、上证 50 000016.sh）
    expect(normalizeSymbol('000001.sh')).toEqual({
      market: 'sh',
      symbol: '000001.sh'
    });
    expect(normalizeSymbol('000016.sh')).toEqual({
      market: 'sh',
      symbol: '000016.sh'
    });
  });

  it('keeps fully qualified Hong Kong symbols unchanged', () => {
    expect(normalizeSymbol('00700.hk')).toEqual({
      market: 'hk',
      symbol: '00700.hk'
    });
  });

  it('normalizes shorthand mainland symbols by prefix', () => {
    expect(normalizeSymbol('600000')).toEqual({
      market: 'sh',
      symbol: '600000.sh'
    });
    expect(normalizeSymbol('000001')).toEqual({
      market: 'sz',
      symbol: '000001.sz'
    });
    expect(normalizeSymbol('300750')).toEqual({
      market: 'sz',
      symbol: '300750.sz'
    });
  });

  it('normalizes shorthand Hong Kong symbols to five digits', () => {
    expect(normalizeSymbol('700')).toEqual({
      market: 'hk',
      symbol: '00700.hk'
    });
    expect(normalizeSymbol('00700')).toEqual({
      market: 'hk',
      symbol: '00700.hk'
    });
  });

  it('normalizes US symbols', () => {
    expect(normalizeSymbol('AAPL')).toEqual({
      market: 'us',
      symbol: 'AAPL.us'
    });
    expect(normalizeSymbol('msft.us')).toEqual({
      market: 'us',
      symbol: 'MSFT.us'
    });
  });

  it('normalizes US symbols with subclass dot (BRK.B, BF.B)', () => {
    expect(normalizeSymbol('BRK.B')).toEqual({
      market: 'us',
      symbol: 'BRK.B.us'
    });
    expect(normalizeSymbol('brk.b.us')).toEqual({
      market: 'us',
      symbol: 'BRK.B.us'
    });
    expect(normalizeSymbol('bf.b')).toEqual({
      market: 'us',
      symbol: 'BF.B.us'
    });
  });

  it('normalizes convertible bond symbols', () => {
    // 上交所可转债
    expect(normalizeSymbol('110081')).toEqual({ market: 'sh', symbol: '110081.sh' });
    expect(normalizeSymbol('113050')).toEqual({ market: 'sh', symbol: '113050.sh' });
    // 深交所可转债
    expect(normalizeSymbol('123456')).toEqual({ market: 'sz', symbol: '123456.sz' });
    expect(normalizeSymbol('127000')).toEqual({ market: 'sz', symbol: '127000.sz' });
    expect(normalizeSymbol('128000')).toEqual({ market: 'sz', symbol: '128000.sz' });
  });

  it('throws a 400 error for invalid symbols', () => {
    for (const input of ['', '199999', '600000.xx', '00700.sz']) {
      expect(() => normalizeSymbol(input)).toThrowError(/invalid symbol/i);

      try {
        normalizeSymbol(input);
      } catch (error) {
        expect(error.statusCode).toBe(400);
      }
    }
  });
});
