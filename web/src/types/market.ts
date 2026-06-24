/**
 * Watchlist / 实时报价相关的共享类型。
 * 之前在 MarketsTable.tsx + LeftWatchlistPanel.tsx 各定义一份，shape 完全一致 — 抽到这里复用。
 */

export interface WatchlistItem {
  symbol: string;
  displayName?: string;
  market?: string;
  category?: string;
  assetType?: 'stock' | 'bond' | 'crypto' | 'other';
}

export interface QuoteSnapshot {
  symbol: string;
  name?: string;
  price?: number;
  yclose?: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
  amount?: number;
  peTtm?: number | null;
  pb?: number | null;
  marketMultiplesValidationStatus?: 'verified' | 'degraded_single_source' | 'unavailable';
  marketMultiplesSources?: string[];
  timestamp?: string;
}

export interface WatchlistApiResponse {
  items?: WatchlistItem[];
}
