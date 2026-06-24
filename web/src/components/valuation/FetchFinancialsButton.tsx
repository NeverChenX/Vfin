'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface Props {
  ticker: string;
}

export function FetchFinancialsButton({ ticker }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/fetch-company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: ticker, force: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `抓取失败 (${res.status})`);
      setMessage(json.message ?? '抓取完成');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-medium text-gray-900">财报抓取与解析</div>
          <div className="mt-1 text-xs text-gray-500">
            手动抓取最新财报，解析三张表并写入本地公司 JSON，然后刷新估值。
          </div>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="inline-flex h-9 items-center justify-center rounded-md bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-400"
        >
          {loading ? '抓取中...' : '抓取财报'}
        </button>
      </div>
      {message && <div className="mt-2 text-xs text-emerald-700">{message}</div>}
      {error && <div className="mt-2 text-xs text-red-700">{error}</div>}
    </div>
  );
}
