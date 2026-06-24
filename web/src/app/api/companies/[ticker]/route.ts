import { NextResponse } from 'next/server';
import { getCompany } from '@/data/companies';
import { buildRatios } from '@/lib/finance/ratios';
import { requireAuth } from '@/lib/auth-guard';
import { fetchLiveQuoteSnapshot } from '@/lib/market/live-quote';
import { buildCurrentMarketMetrics } from '@/components/companies/key-metrics-market-data';

interface RouteCtx {
  params: Promise<{ ticker: string }>;
}

/**
 * GET /api/companies/:ticker — 返回该股票的关键财务指标（PE / PB / ROE / 行业 等）
 * 用于经典版 /hq-classic 顶部财务条；找不到返回 404。
 */
export async function GET(_req: Request, ctx: RouteCtx) {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  const { ticker } = await ctx.params;
  const company = getCompany(decodeURIComponent(ticker));
  if (!company) {
    return NextResponse.json({ error: 'company not found' }, { status: 404 });
  }
  const liveQuote = await fetchLiveQuoteSnapshot(ticker);
  const currentMetrics = buildCurrentMarketMetrics(company, liveQuote);
  const rows = buildRatios(company);
  const latestY = rows.find((r) => r.period.granularity === 'Y') ?? rows[0];
  const v = latestY?.values ?? {};
  return NextResponse.json({
    ticker: company.ticker,
    name: company.name,
    nameEn: (company as unknown as { nameEn?: string }).nameEn,
    industry: company.industry,
    market: company.market,
    accountingStandard: company.accountingStandard,
    currency: company.currency,
    periodLabel: latestY ? labelFromPeriod(latestY.period.year, latestY.period.granularity, latestY.period.index) : null,
    metrics: {
      price: currentMetrics.price,
      pe: currentMetrics.peTtm,
      pb: currentMetrics.pb,
      marketMultiplesValidationStatus: currentMetrics.marketMultiplesValidationStatus,
      marketMultiplesSources: currentMetrics.sources ?? [],
      roe: v.roe ?? null,
      roa: v.roa ?? null,
      gross_margin: v.gross_margin ?? null,
      net_margin: v.net_margin ?? null,
      dividend_yield: v.dividend_yield ?? null,
      market_cap: v.market_cap ?? null,
      market_cap_currency: v.market_cap_currency ?? company.currency,
    },
  });
}

function labelFromPeriod(y: number, g: string, i?: number): string {
  if (g === 'Y') return `${y}FY`;
  if (g === 'H') return i === 1 ? `${y}H1` : `${y}H2`;
  if (g === 'Q') return `${y}Q${i ?? '?'}`;
  return `${y}`;
}
