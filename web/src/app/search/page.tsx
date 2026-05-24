import { AppShell } from '@/components/shell/AppShell';
import { SearchResults } from '@/components/search/SearchResults';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q : '';

  return (
    <AppShell>
      <div className="mx-auto max-w-[960px] px-4 py-6">
        <header className="mb-4">
          <h1 className="text-[16px] font-semibold tracking-tight text-[var(--color-text-primary)]">
            搜索 “{q}”
          </h1>
          <p className="mt-1 text-[11.5px] text-[var(--color-text-tertiary)]">
            点击结果进入行情交易页
          </p>
        </header>
        <SearchResults q={q} />
      </div>
    </AppShell>
  );
}

export const metadata = {
  title: '搜索 · VFin',
};
