import 'server-only';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { CompanyFinancials, PeriodKey } from '@/types/finance';
import { marketGroup, type MarketGroup } from '@/lib/symbol-utils';

const DIR = join(process.cwd(), 'src', 'data', 'companies');

export interface CompanyListEntry {
  ticker: string;
  name: string;
  nameEn?: string;
  shortName?: string;
  industry: string;
  market: MarketGroup;
  dataAsOf: string;
  expectedAsOf: string;
  isStale: boolean;
  periodsCoverage: string;
  updatedAt: string;
  source?: string;
  fetchedAt?: string;
  isDemoFetched?: boolean;
}

/**
 * 截至 today，根据市场披露节奏，应该已发布的最新报告期末日期。
 *  - A / US: 季报。Q1 截止次月底 (4-30), Q2 (7-31), Q3 (10-31), FY (次年 4-30)
 *  - HK: 半年报。Interim (H1) 截止 ~9-30, Annual (FY) 截止 ~4-30
 */
function expectedLatestPeriodEnd(market: 'A' | 'US' | 'HK' | 'other', today: Date): string {
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const d = today.getDate();
  const fmt = (dt: Date) => dt.toISOString().slice(0, 10);

  if (market === 'HK') {
    if (m > 9 || (m === 9 && d >= 30)) return fmt(new Date(Date.UTC(y, 5, 30)));    // H1 of this year (6-30)
    if (m > 4 || (m === 4 && d >= 30)) return fmt(new Date(Date.UTC(y - 1, 11, 31))); // FY of last year
    return fmt(new Date(Date.UTC(y - 1, 5, 30)));                                   // H1 of last year
  }
  // A / US / 其他默认按季报
  if (m > 10 || (m === 10 && d >= 31)) return fmt(new Date(Date.UTC(y, 8, 30)));    // Q3
  if (m > 7 || (m === 7 && d >= 31)) return fmt(new Date(Date.UTC(y, 5, 30)));      // Q2
  if (m > 4 || (m === 4 && d >= 30)) return fmt(new Date(Date.UTC(y, 2, 31)));      // Q1 / FY of last year
  return fmt(new Date(Date.UTC(y - 1, 11, 31)));                                    // FY of last year
}

function readCompany(ticker: string): { data: CompanyFinancials; mtime: number } | undefined {
  const path = join(DIR, `${ticker}.json`);
  try {
    const stat = statSync(path);
    const data = JSON.parse(readFileSync(path, 'utf-8')) as CompanyFinancials;
    return { data, mtime: stat.mtimeMs };
  } catch {
    return undefined;
  }
}

/** 把 `01811.hk` / `TSLA.us` / `600519.sh` 这类带后缀的 ticker 规范成多个候选 */
function candidateTickers(raw: string): string[] {
  const trimmed = raw.trim();
  const out = new Set<string>([trimmed]);
  // 去掉市场后缀
  if (/\.(sh|sz|bj|hk|us)$/i.test(trimmed)) {
    out.add(trimmed.replace(/\.[a-z]+$/i, ''));
  }
  // US 大写
  if (/^[A-Za-z]/.test(trimmed)) {
    out.add(trimmed.toUpperCase());
    out.add(trimmed.replace(/\.[a-z]+$/i, '').toUpperCase());
  }
  return Array.from(out);
}

export function getCompany(ticker: string): CompanyFinancials | undefined {
  for (const t of candidateTickers(ticker)) {
    const r = readCompany(t);
    if (r) return r.data;
  }
  return undefined;
}

function periodToDate(p: PeriodKey): string {
  if (p.granularity === 'Y') return `${p.year}-12-31`;
  if (p.granularity === 'H') return p.index === 1 ? `${p.year}-06-30` : `${p.year}-12-31`;
  if (p.granularity === 'Q') {
    const m = p.index === 1 ? '03-31' : p.index === 2 ? '06-30' : p.index === 3 ? '09-30' : '12-31';
    return `${p.year}-${m}`;
  }
  return '';
}

function periodSortVal(p: PeriodKey): number {
  const off = p.granularity === 'H' ? (p.index ?? 0) * 2 : p.granularity === 'Q' ? (p.index ?? 0) : 4;
  return p.year * 10 + off;
}

function dataAsOfFromCompany(c: CompanyFinancials): { dataAsOf: string; coverage: string } {
  const all: PeriodKey[] = [];
  for (const s of [c.statements.IS, c.statements.BS, c.statements.CF]) {
    for (const p of s.periods) all.push(p.period);
  }
  const latest = all.sort((a, b) => periodSortVal(b) - periodSortVal(a))[0];
  // 计算各粒度期数
  const countY = new Set(all.filter((p) => p.granularity === 'Y').map((p) => p.year)).size;
  const countH = new Set(all.filter((p) => p.granularity === 'H').map((p) => `${p.year}H${p.index}`)).size;
  const countQ = new Set(all.filter((p) => p.granularity === 'Q').map((p) => `${p.year}Q${p.index}`)).size;
  const coverage = [
    countY ? `${countY}Y` : null,
    countH ? `${countH}H` : null,
    countQ ? `${countQ}Q` : null,
  ].filter(Boolean).join(' · ');
  return { dataAsOf: latest ? periodToDate(latest) : '', coverage };
}

// 模块级缓存：每次 force-dynamic 请求都 readdirSync + N×readFileSync 太浪费。
// 公司 JSON 只有 /api/fetch-company POST 时才会改变；30s TTL 在用户体感和数据新鲜度间平衡。
const LIST_TTL_MS = 30_000;
let cachedList: CompanyListEntry[] | null = null;
let cachedAt = 0;

export function invalidateCompanyListCache(): void {
  cachedList = null;
  cachedAt = 0;
}

function computeAllCompanies(): CompanyListEntry[] {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.json') && f !== 'index.json');
  const entries: CompanyListEntry[] = [];
  for (const f of files) {
    const ticker = f.replace(/\.json$/, '');
    const rec = readCompany(ticker);
    if (!rec) continue;
    const { dataAsOf, coverage } = dataAsOfFromCompany(rec.data);
    const meta = rec.data as unknown as { _demo?: boolean; _source?: string; _fetchedAt?: string; market?: 'A'|'HK'|'US' };
    const market = meta.market ?? marketGroup(rec.data.ticker);
    const expectedAsOf = expectedLatestPeriodEnd(market, new Date());
    // isStale 判定：dataAsOf 早于 expectedAsOf
    // 但若 _fetchedAt 在 7 天内，认为"数据源已是最新可用"，不算 stale（避免"刚同步就过期"误导）
    const recentlyFetched = (() => {
      const f = meta._fetchedAt;
      if (!f) return false;
      const t = Date.parse(f);
      if (!Number.isFinite(t)) return false;
      return Date.now() - t < 7 * 86400_000;
    })();
    const isStale = dataAsOf < expectedAsOf && !recentlyFetched;
    entries.push({
      ticker: rec.data.ticker,
      name: rec.data.name,
      nameEn: (rec.data as unknown as { nameEn?: string }).nameEn,
      shortName: rec.data.shortName,
      industry: rec.data.industry,
      market,
      dataAsOf,
      expectedAsOf,
      isStale,
      periodsCoverage: coverage,
      updatedAt: new Date(rec.mtime).toISOString(),
      source: meta._source,
      fetchedAt: meta._fetchedAt,
      isDemoFetched: meta._demo ?? false,
    });
  }
  // 纯 ASCII ticker，无需 localeCompare
  return entries.sort((a, b) => (a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0));
}

export function getAllCompanies(): CompanyListEntry[] {
  if (cachedList && Date.now() - cachedAt < LIST_TTL_MS) return cachedList;
  cachedList = computeAllCompanies();
  cachedAt = Date.now();
  return cachedList;
}
