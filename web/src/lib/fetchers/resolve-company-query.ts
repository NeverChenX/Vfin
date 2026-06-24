import { US_TICKER_CIK } from '@/lib/fetchers/sec';

const A_SHARE_RE = /^\d{6}$/;
const US_TICKER_RE = /^[A-Za-z]{1,5}$/;
const HK_TICKER_RE = /^0?\d{4,5}$/;
const EXCHANGE_SUFFIX_RE = /\.(sh|sz|bj|hk|us)$/i;

export type FetchMarket = 'A' | 'US' | 'HK' | 'unknown';

export const COMPANY_NAME_LOOKUP: Record<string, string> = {
  贵州茅台: '600519',
  五粮液: '000858',
  招商银行: '600036',
  比亚迪: '002594',
  宁德时代: '300750',
  中国广核: '003816',
  长江电力: '600900',
  国电南瑞: '600406',
  特斯拉: 'TSLA',
  苹果: 'AAPL',
  微软: 'MSFT',
  英伟达: 'NVDA',
  谷歌: 'GOOGL',
  亚马逊: 'AMZN',
  脸书: 'META',
  Meta: 'META',
  奈飞: 'NFLX',
  中广核新能源: '01811',
  腾讯: '00700',
  腾讯控股: '00700',
  阿里巴巴: '09988',
  美团: '03690',
  小米: '01810',
  小米集团: '01810',
};

export function detectFetchMarket(s: string): FetchMarket {
  if (A_SHARE_RE.test(s)) return 'A';
  if (US_TICKER_RE.test(s) && US_TICKER_CIK[s.toUpperCase()]) return 'US';
  if (HK_TICKER_RE.test(s)) return 'HK';
  return 'unknown';
}

export function normalizeCompanyQuery(query: string): string {
  return query.trim().replace(EXCHANGE_SUFFIX_RE, '');
}

export function resolveCompanyQuery(query: string): { ticker: string | null; market: FetchMarket; reason?: string } {
  const q = query.trim();
  const normalized = normalizeCompanyQuery(q);
  const direct = detectFetchMarket(normalized);
  if (direct !== 'unknown') return { ticker: normalized.toUpperCase(), market: direct };

  const aliased = COMPANY_NAME_LOOKUP[q] ?? COMPANY_NAME_LOOKUP[normalized];
  if (aliased) return { ticker: aliased, market: detectFetchMarket(aliased) };

  for (const [name, code] of Object.entries(COMPANY_NAME_LOOKUP)) {
    if (name.includes(q) || q.includes(name) || name.includes(normalized) || normalized.includes(name)) {
      return { ticker: code, market: detectFetchMarket(code) };
    }
  }

  return {
    ticker: null,
    market: 'unknown',
    reason: '请输入 A 股代码（如 600519）、港股代码（如 01810 / 01810.hk）、美股代码（如 TSLA）或公司名（如 小米 / 特斯拉 / 贵州茅台）',
  };
}
