interface EmptyStateProps {
  ticker: string;
  companyName: string;
}

export function EmptyState({ ticker, companyName }: EmptyStateProps) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-center">
      <h2 className="text-xl font-semibold text-gray-900">尚未配置 SOTP 估值数据</h2>
      <p className="mt-3 text-sm text-gray-600">
        <span className="font-medium">{companyName}</span>（{ticker}）暂未维护分部估值配置。
      </p>
      <p className="mt-2 text-sm text-gray-500">
        请在{' '}
        <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">
          web/src/data/companies/{ticker}.json
        </code>{' '}
        中添加{' '}
        <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">valuation</code> 字段。
      </p>
      <p className="mt-1 text-xs text-gray-400">
        字段结构参考 <code>docs/superpowers/specs/2026-06-01-sotp-valuation-design.md</code> §3.1
      </p>
      <a
          href={`/company/${encodeURIComponent(ticker)}?tab=financials`}
        className="mt-8 inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
      >
        ← 回研究页
      </a>
    </div>
  );
}
