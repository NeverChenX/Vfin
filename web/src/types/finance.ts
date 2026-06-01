import type { ValuationConfig } from './valuation';

export type PeriodGranularity = 'Y' | 'H' | 'Q';

export interface PeriodKey {
  year: number;
  granularity: PeriodGranularity;
  index?: 1 | 2 | 3 | 4;
}

export type StatementId = 'IS' | 'BS' | 'CF';

export type SubjectKind = 'item' | 'subtotal' | 'total';
export type SubjectSign = 'add' | 'sub' | 'neutral';

export interface SubjectMeta {
  id: string;
  zh: string;
  cfa: string;
  cfaFull?: string;
  level: 0 | 1 | 2;
  kind: SubjectKind;
  sign: SubjectSign;
  parentId?: string;
  formula?: string;
}

export interface StatementSchema {
  id: StatementId;
  zhName: string;
  cfaName: string;
  subjects: SubjectMeta[];
}

export interface PeriodValues {
  period: PeriodKey;
  values: Record<string, number | null>;
}

export type Currency = 'CNY' | 'USD' | 'HKD';
export type RawUnit = 'yuan' | 'wan' | 'yi';
export type AccountingStandard = 'CAS' | 'IFRS' | 'US-GAAP';

export type MarketCode = 'A' | 'HK' | 'US';

export interface KeyMetricsRow {
  period: PeriodKey;
  values: {
    pe_ttm?: number | null;       // P/E TTM
    pb?: number | null;           // P/B
    ps_ttm?: number | null;       // P/S TTM
    pcf_ttm?: number | null;      // P/CF TTM
    dividend_yield?: number | null;
    market_cap?: number | null;   // 市值（原币种）
    market_cap_currency?: string; // 市值原币 (HKD / USD / CNY)
    total_shares?: number | null; // 总股本
    roe?: number | null;          // 计算值：ni_parent / parent_equity
    roa?: number | null;          // ni / total_assets
    gross_margin?: number | null; // gross_profit / rev_total
    net_margin?: number | null;   // net_income / rev_total
  };
}

/** 单个对账点结果 */
export interface ValidationCheck {
  field: string;       // e.g. "net_op_cf", "total_assets"
  period: string;      // e.g. "2025-Y", "2024-Q3"
  primary: number | null;
  secondary: number | null;
  absDiff: number;     // 主源 - 辅源 的绝对差
  relDiff: number;     // 相对差 |abs| / max(|primary|,|secondary|)
  passed: boolean;     // |absDiff| <= 1 OR relDiff <= 0.0001
  note?: string;
}

/** 多源交叉校验报告（每份 JSON 必须带，见 memory/data-accuracy-zero-tolerance.md） */
export interface ValidationReport {
  passedAt: string;          // ISO 时间戳；只有所有 checks.passed 才允许写入
  passed: boolean;           // 全部 checks 都 passed === true
  sources: {
    primary: { name: string; url?: string; fetchedAt: string };
    secondary: { name: string; url?: string; fetchedAt: string };
  };
  checks: ValidationCheck[]; // 至少 9 项：CFO/CFI/CFF/NetΔ/Beg/End + total_assets/total_liab/total_equity
  notes?: string[];          // 任何"已知 acceptable 差异"的说明（如 restated）
}

export interface CompanyFinancials {
  ticker: string;
  name: string;
  nameEn?: string;
  shortName?: string;
  industry: string;
  market?: MarketCode;
  currency: Currency;
  unit: RawUnit;
  accountingStandard: AccountingStandard;
  statements: {
    IS: { periods: PeriodValues[] };
    BS: { periods: PeriodValues[] };
    CF: { periods: PeriodValues[] };
  };
  ratios?: KeyMetricsRow[];
  /** SOTP 分部估值配置；缺省时估值页显示 EmptyState */
  valuation?: ValuationConfig;
  /** 多源交叉校验报告。**无此字段或 passed=false 的 JSON 视为不可信，需重抓** */
  _validation?: ValidationReport;
}

export type AnalysisOverlay = 'yoy' | 'qoq' | 'common';
export type DisplayUnit = 'auto' | RawUnit;
