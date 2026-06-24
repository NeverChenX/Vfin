import type { QuoteSnapshot } from '@/types/market';

const INTERNAL_HOST = process.env.VFIN_INTERNAL_HOST || '127.0.0.1';

export async function fetchLiveQuoteSnapshot(symbol: string): Promise<QuoteSnapshot | null> {
  const port = process.env.PORT || '3816';
  const url = `http://${INTERNAL_HOST}:${port}/api/hq/stock?symbol=${encodeURIComponent(symbol)}`;
  try {
    const res = await fetch(url, { cache: 'no-store', headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    return (await res.json()) as QuoteSnapshot;
  } catch {
    return null;
  }
}
