import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import type { CompanyFinancials } from '@/types/finance';

type MarketData = NonNullable<NonNullable<CompanyFinancials['valuation']>['currentMarketData']>;

export interface LiveHkQuote {
  source: string;
  timestamp: string;
  price: number;
  prevClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  change: number | null;
  changePct: number | null;
  volume: number | null;
  amount: number | null;
  marketCapHkdMillions: number | null;
}

interface LiveMarketPayload {
  quote: LiveHkQuote;
  validationSources: string[];
  quoteVerified: boolean;
  hkdToCny: number | null;
  fxSource?: string;
}

interface CachedFacts {
  cacheVersion?: number;
  quote: LiveHkQuote;
  validationSources: string[];
  quoteVerified: boolean;
  hkdToCny: number | null;
  fxSource?: string;
}

const CACHE_ROOT = join(process.cwd(), 'src', 'data', 'source-cache');
const CACHE_VERSION = 1;
const QUOTE_TTL_MS = 60_000;

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function scaled(value: unknown, scale: number): number | null {
  const n = toNumber(value);
  return n === null ? null : n / Math.pow(10, scale);
}

function tickerCode(ticker: string): string {
  return ticker.toLowerCase().replace(/\.hk$/, '').padStart(5, '0');
}

function cacheDir(ticker: string, date: string): string {
  return join(CACHE_ROOT, tickerCode(ticker), date);
}

function cachePath(ticker: string, date: string, filename: string): string {
  return join(cacheDir(ticker, date), filename);
}

function todayHongKong(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function ensureCacheDir(ticker: string, date: string): void {
  mkdirSync(cacheDir(ticker, date), { recursive: true });
}

function readJson<T>(path: string): T | null {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

function writeJson(path: string, data: unknown): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
  } catch {
    // Fall through to the write; Node will surface a useful error if it still fails.
  }
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function round(value: number, decimals: number): number {
  return Number(value.toFixed(decimals));
}

function isAfterHongKongClose(): boolean {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Hong_Kong',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return hour > 16 || (hour === 16 && minute >= 10);
}

function isFreshCache(path: string, facts: CachedFacts, date: string): boolean {
  if (facts.cacheVersion !== CACHE_VERSION) return false;
  if (!existsSync(path)) return false;
  if (formatHongKongAsOf(facts.quote.timestamp).startsWith(date) && isAfterHongKongClose()) return true;
  const ageMs = Date.now() - statSync(path).mtimeMs;
  return ageMs >= 0 && ageMs <= QUOTE_TTL_MS;
}

export function formatHongKongAsOf(timestamp: string): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(timestamp));
}

export function parseEastmoneyHkQuote(raw: unknown): LiveHkQuote | null {
  const data = raw && typeof raw === 'object' && 'data' in raw ? (raw as { data?: Record<string, unknown> }).data : null;
  if (!data) return null;

  const scale = toNumber(data.f59) ?? 3;
  const price = scaled(data.f43, scale);
  const prevClose = scaled(data.f60, scale);
  const timestampSeconds = toNumber(data.f86);
  if (price === null || !timestampSeconds) return null;

  const change = prevClose === null ? null : price - prevClose;
  const pctFromRaw = scaled(data.f170, 2);
  const changePct = pctFromRaw === null ? (prevClose ? round(change! / prevClose, 4) : null) : pctFromRaw / 100;
  const marketCap = toNumber(data.f116);

  return {
    source: 'Eastmoney push2 HK quote',
    timestamp: new Date(timestampSeconds * 1000).toISOString(),
    price,
    prevClose,
    open: scaled(data.f46, scale),
    high: scaled(data.f44, scale),
    low: scaled(data.f45, scale),
    change,
    changePct,
    volume: toNumber(data.f47),
    amount: toNumber(data.f48),
    marketCapHkdMillions: marketCap === null ? null : marketCap / 1_000_000,
  };
}

function parseTencentTimestamp(value: string | undefined): string | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, y, m, d, hh, mm, ss] = match;
  return new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}+08:00`).toISOString();
}

export function parseTencentHkQuote(payload: string): LiveHkQuote | null {
  const quoted = payload.match(/="([^"]+)"/)?.[1];
  if (!quoted) return null;
  const parts = quoted.split('~');
  const timestampIndex = parts.findIndex((part) => /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/.test(part));
  const price = toNumber(parts[3]);
  const prevClose = toNumber(parts[4]);
  const timestamp = parseTencentTimestamp(parts[timestampIndex]);
  if (price === null || !timestamp) return null;

  const tencentMarketCapHundredMillion = toNumber(parts[45]) ?? toNumber(parts[46]);
  const change = toNumber(parts[timestampIndex + 1]) ?? (prevClose === null ? null : price - prevClose);
  const pct = toNumber(parts[timestampIndex + 2]);

  return {
    source: 'Tencent Finance HK quote',
    timestamp,
    price,
    prevClose,
    open: toNumber(parts[5]),
    high: toNumber(parts[timestampIndex + 3]),
    low: toNumber(parts[timestampIndex + 4]),
    change,
    changePct: pct === null ? (prevClose ? round(change! / prevClose, 4) : null) : pct / 100,
    volume: toNumber(parts[timestampIndex + 7]) ?? toNumber(parts[6]),
    amount: toNumber(parts[timestampIndex + 8]),
    marketCapHkdMillions: tencentMarketCapHundredMillion === null ? null : tencentMarketCapHundredMillion * 100,
  };
}

function quotesAgree(a: LiveHkQuote, b: LiveHkQuote): boolean {
  const sameDate = formatHongKongAsOf(a.timestamp).slice(0, 10) === formatHongKongAsOf(b.timestamp).slice(0, 10);
  const samePrice = Math.abs(a.price - b.price) <= 0.02;
  const sameMarketCap =
    a.marketCapHkdMillions === null ||
    b.marketCapHkdMillions === null ||
    Math.abs(a.marketCapHkdMillions - b.marketCapHkdMillions) <= Math.max(100, a.marketCapHkdMillions * 0.001);
  return sameDate && samePrice && sameMarketCap;
}

export function applyLiveMarketData(company: CompanyFinancials, payload: LiveMarketPayload): CompanyFinancials {
  if (!company.valuation) return company;

  const existing = company.valuation.currentMarketData;
  if (existing?.asOf && existing.asOf > formatHongKongAsOf(payload.quote.timestamp)) return company;

  const sources = [...payload.validationSources];
  if (payload.fxSource) sources.push(payload.fxSource);
  const marketData: MarketData = {
    asOf: formatHongKongAsOf(payload.quote.timestamp),
    currency: 'HKD',
    price: payload.quote.price,
    change: payload.quote.change,
    changePct: payload.quote.changePct,
    volume: payload.quote.volume,
    marketCap: payload.quote.marketCapHkdMillions,
    sharesOutstanding: null,
    validationStatus: payload.quoteVerified ? 'verified' : 'degraded_single_source',
    sources,
    note: payload.quoteVerified
      ? 'Eastmoney 与 Tencent 结构化行情交叉校验；SOTP CNY 市值按缓存汇率换算'
      : '仅取得单一结构化行情源，已降级标注',
  };

  return {
    ...company,
    valuation: {
      ...company.valuation,
      currentMarketData: marketData,
      marketCapOverride:
        payload.quote.marketCapHkdMillions !== null && payload.hkdToCny !== null
          ? payload.quote.marketCapHkdMillions * payload.hkdToCny
          : company.valuation.marketCapOverride,
    },
  };
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: 'no-store', headers: { accept: 'application/json,text/plain,*/*' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { cache: 'no-store', headers: { accept: 'text/plain,*/*' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

async function fetchLiveHkMarket(ticker: string, date: string): Promise<CachedFacts | null> {
  ensureCacheDir(ticker, date);
  const code = tickerCode(ticker);
  const eastmoneyUrl =
    `https://push2.eastmoney.com/api/qt/stock/get?secid=116.${code}` +
    '&fields=f43,f44,f45,f46,f47,f48,f57,f58,f59,f60,f86,f116,f117,f168,f170';
  const eastmoneyRaw = await fetchJson(eastmoneyUrl);
  writeJson(cachePath(ticker, date, 'eastmoney-hk-quote.raw.json'), {
    url: eastmoneyUrl,
    fetchedAt: new Date().toISOString(),
    response: eastmoneyRaw,
  });

  const quote = parseEastmoneyHkQuote(eastmoneyRaw);
  if (!quote) return null;

  const validationSources = [quote.source];
  let quoteVerified = false;
  try {
    const tencentUrl = `https://qt.gtimg.cn/q=hk${code}`;
    const tencentRaw = await fetchText(tencentUrl);
    writeJson(cachePath(ticker, date, 'tencent-hk-quote.raw.json'), {
      url: tencentUrl,
      fetchedAt: new Date().toISOString(),
      response: tencentRaw,
    });
    const tencentQuote = parseTencentHkQuote(tencentRaw);
    if (tencentQuote && quotesAgree(quote, tencentQuote)) {
      validationSources.push(tencentQuote.source);
      quoteVerified = true;
    }
  } catch {
    quoteVerified = false;
  }

  let hkdToCny: number | null = null;
  let fxSource: string | undefined;
  try {
    const fxUrl = 'https://open.er-api.com/v6/latest/HKD';
    const fxRaw = await fetchJson(fxUrl);
    writeJson(cachePath(ticker, date, 'exchange-rate-api-HKD.raw.json'), {
      url: fxUrl,
      fetchedAt: new Date().toISOString(),
      response: fxRaw,
    });
    const rates =
      fxRaw && typeof fxRaw === 'object' && 'rates' in fxRaw
        ? (fxRaw as { rates?: Record<string, unknown> }).rates
        : null;
    hkdToCny = toNumber(rates?.CNY);
    if (hkdToCny !== null) fxSource = 'ExchangeRate-API HKD/CNY';
  } catch {
    hkdToCny = null;
  }

  const facts: CachedFacts = { cacheVersion: CACHE_VERSION, quote, validationSources, quoteVerified, hkdToCny, fxSource };
  writeJson(cachePath(ticker, date, 'live-market-facts.json'), facts);
  return facts;
}

async function getLiveHkMarketFacts(ticker: string): Promise<CachedFacts | null> {
  const date = todayHongKong();
  const factsPath = cachePath(ticker, date, 'live-market-facts.json');
  const cached = readJson<CachedFacts>(factsPath);
  if (cached && isFreshCache(factsPath, cached, date)) return cached;
  try {
    return await fetchLiveHkMarket(ticker, date);
  } catch {
    return cached;
  }
}

export async function enrichCompanyWithLiveMarketData(company: CompanyFinancials): Promise<CompanyFinancials> {
  if (company.market !== 'HK' || !company.valuation) return company;
  const facts = await getLiveHkMarketFacts(company.ticker);
  if (!facts) return company;
  return applyLiveMarketData(company, facts);
}
