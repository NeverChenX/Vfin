import { notFound } from 'next/navigation';
import { getCompany } from '@/data/companies';
import { AppShell } from '@/components/shell/AppShell';
import { ValuationWorkspace } from '@/components/valuation/ValuationWorkspace';
import { enrichCompanyWithLiveMarketData } from '@/lib/market/live-company-market';

type Params = Promise<{ ticker: string }>;

export default async function ValuationPage(props: { params: Params }) {
  const { ticker } = await props.params;
  const storedCompany = getCompany(ticker);
  if (!storedCompany) notFound();
  const company = await enrichCompanyWithLiveMarketData(storedCompany);

  return (
    <AppShell ticker={ticker}>
      <ValuationWorkspace
        ticker={company.ticker}
        company={company}
        backHref={`/company/${encodeURIComponent(company.ticker)}?tab=financials`}
        backLabel="← 回财报"
      />
    </AppShell>
  );
}

export const dynamic = 'force-dynamic';
