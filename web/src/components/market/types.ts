/**
 * 首页市场模块的共享类型。
 * 与 web/src/types/market.ts 的 QuoteSnapshot 兼容；这里聚焦 dashboard 视图需要的最小集合。
 */

export interface Quote {
  symbol: string;
  name?: string;
  price?: number;
  yclose?: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
  amount?: number;
}

/** 行业 / 板块 cell */
export interface SectorItem {
  code: string;     // 申万指数 symbol，如 '801010.sh'
  name: string;     // '农林牧渔'
  pct: number | null; // null = 拿不到
}

/** 市场宽度数据（Phase 1 = 占位 / null） */
export interface BreadthData {
  total: number;
  up: number;
  flat: number;
  down: number;
  limitUp: number;
  limitDown: number;
}

/** 港股专区 */
export interface HKConnectData {
  southboundNet: number | null;     // 元
  southboundDays: number | null;
  northboundNet: number | null;
}

/** 跨市场带的一格 */
export interface CrossMarketItem {
  symbol: string;
  label: string;
  pct: number | null;
  price?: number;        // 对 FX/商品有意义
  highlight?: boolean;   // 重点标识（USDCNY / USDJPY）
}
