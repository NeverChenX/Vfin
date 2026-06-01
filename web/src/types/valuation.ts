export type ValuationMethod = 'PS' | 'PE' | 'EV_EBITDA';
export type SotpCurrency = 'CNY' | 'HKD' | 'USD';
export type Verdict = 'STRONG_UNDER' | 'MILD_UNDER' | 'FAIR' | 'MILD_OVER' | 'STRONG_OVER';

export interface PeerMultiple {
  name: string;
  ticker: string;
  multiple: number;
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
  peers: PeerMultiple[];
  rationale: string;
}

export interface ValuationConfig {
  sotpCurrency: SotpCurrency;
  sotpAsOf: string;
  netCash: number | null;
  netCashAsOf: string;
  marketCapOverride: number | null;
  segments: BusinessSegment[];
}

export interface SegmentValuation {
  segment: BusinessSegment;
  peerMedian: number | null;
  peerMean: number | null;
  peerCount: number;
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
  currentMarketCap: number;
  impliedUpsidePct: number;
  verdict: Verdict;
  currency: SotpCurrency;
  asOf: string;
}
