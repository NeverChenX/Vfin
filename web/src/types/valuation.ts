export type ValuationMethod = 'PS' | 'PE' | 'EV_EBITDA' | 'EV_SALES';
export type SotpCurrency = 'CNY' | 'HKD' | 'USD';
export type Verdict = 'STRONG_UNDER' | 'MILD_UNDER' | 'FAIR' | 'MILD_OVER' | 'STRONG_OVER';

export interface PeerMultiple {
  name: string;
  ticker: string;
  /** 对标公司估值分母，单位与估值配置一致：百万。PE=净利润，PS/EV_SALES=收入，EV_EBITDA=EBITDA。 */
  netIncome: number | null;
  /** 对标公司估值分子，单位与估值配置一致：百万。PE/PS=市值，EV_SALES/EV_EBITDA=企业价值。 */
  marketValue: number | null;
  /** 已由外部结构化数据源直接给出的估值倍数，如 PE-TTM。存在时优先使用，避免混用单季分母。 */
  valuationMultiple?: number | null;
  valuationMultipleLabel?: string;
  asOf: string;
  source: string;
}

export interface BusinessSegment {
  id: string;
  name: string;
  method: ValuationMethod;
  metricLabel: string;
  metricValue: number | null;
  metricAsOf: string;
  source?: string;
  peers: PeerMultiple[];
  rationale: string;
}

export interface ValuationConfig {
  sotpCurrency: SotpCurrency;
  sotpAsOf: string;
  netCash: number | null;
  netCashAsOf: string;
  marketCapOverride: number | null;
  currentMarketData?: {
    asOf: string;
    currency: SotpCurrency;
    price: number | null;
    change: number | null;
    changePct: number | null;
    volume: number | null;
    marketCap: number | null;
    sharesOutstanding: number | null;
    validationStatus: 'verified' | 'degraded_single_source';
    sources: string[];
    note?: string;
  };
  segments: BusinessSegment[];
}

export interface SegmentValuation {
  segment: BusinessSegment;
  peerMedian: number | null;
  peerMean: number | null;
  peerCount: number;
  peerImpliedMultiples: Record<string, number>;
  impliedValue: number | null;
  excluded: boolean;
  excludeReason?: string;
}

export interface SotpResult {
  segments: SegmentValuation[];
  segmentsTotal: number;
  excludedCount: number;
  netCash: number | null;
  sotpTotal: number;
  currentMarketCap: number | null;
  impliedUpsidePct: number | null;
  verdict: Verdict;
  currency: SotpCurrency;
  asOf: string;
}
