import { describe, expect, it } from 'vitest';
import { resolveCompanyQuery } from '@/lib/fetchers/resolve-company-query';

describe('resolveCompanyQuery', () => {
  it('accepts Hong Kong tickers with exchange suffixes from company pages', () => {
    expect(resolveCompanyQuery('01810.hk')).toEqual({ ticker: '01810', market: 'HK' });
    expect(resolveCompanyQuery('01810.HK')).toEqual({ ticker: '01810', market: 'HK' });
  });

  it('keeps direct Hong Kong tickers and Chinese aliases working', () => {
    expect(resolveCompanyQuery('01810')).toEqual({ ticker: '01810', market: 'HK' });
    expect(resolveCompanyQuery('小米')).toEqual({ ticker: '01810', market: 'HK' });
  });
});
