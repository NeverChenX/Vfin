import { notFound } from 'next/navigation';
import { getCompany } from '@/data/companies';
import { computeSotp } from '@/lib/valuation/sotp';
import { EmptyState } from '@/components/valuation/EmptyState';

type Params = Promise<{ ticker: string }>;

export default async function ValuationPage(props: { params: Params }) {
  const { ticker } = await props.params;
  const company = getCompany(ticker);
  if (!company) notFound();

  if (!company.valuation) {
    return <EmptyState ticker={ticker} companyName={company.name} />;
  }

  const cfg = company.valuation;
  const marketCap = cfg.marketCapOverride;
  if (marketCap === null || marketCap === undefined) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h2 className="text-xl font-semibold text-gray-900">市值未配置</h2>
        <p className="mt-3 text-sm text-gray-600">
          {company.name}（{ticker}）的{' '}
          <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">
            valuation.marketCapOverride
          </code>{' '}
          缺失，无法计算 SOTP 对比。
        </p>
      </div>
    );
  }

  const result = computeSotp(cfg, marketCap);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-2xl font-bold text-gray-900">
        {company.name}（{ticker}）— SOTP 估值评估
      </h1>
      <pre className="mt-6 overflow-x-auto rounded bg-gray-50 p-4 text-xs">
        {JSON.stringify(result, null, 2)}
      </pre>
      <a
        href={`/research/${encodeURIComponent(ticker)}`}
        className="mt-6 inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
      >
        ← 回研究页
      </a>
    </div>
  );
}
