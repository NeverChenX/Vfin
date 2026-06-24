import { describe, expect, it } from 'vitest';
import { parseStockAnalysisFinancialCurrency, resolveHKChineseName } from '@/lib/fetchers/hk';

describe('parseStockAnalysisFinancialCurrency', () => {
  it('reads the financial reporting currency from stockanalysis metadata', () => {
    const html = 'curr:{main:"HKD",price:"HKD",dividend:"HKD",financial:"CNY"}';

    expect(parseStockAnalysisFinancialCurrency(html)).toBe('CNY');
  });

  it('returns null for unsupported or missing currencies', () => {
    expect(parseStockAnalysisFinancialCurrency('curr:{financial:"JPY"}')).toBeNull();
    expect(parseStockAnalysisFinancialCurrency('')).toBeNull();
  });

  it('keeps known Hong Kong stocks on Chinese primary names', () => {
    expect(resolveHKChineseName('03698', 'Huishang Bank Corporation Limited')).toBe('徽商银行');
    expect(resolveHKChineseName('09678', 'Unisound AI Technology Co., Ltd.')).toBe('云知声');
  });
});
