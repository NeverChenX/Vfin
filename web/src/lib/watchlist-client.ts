import type { WatchlistItem } from '@/types/market';

export const WATCHLIST_CHANGED_EVENT = 'vfin:watchlist-changed';

type Fetcher = typeof fetch;

interface AddWatchlistResponse {
  item?: WatchlistItem;
  error?: string;
}

export async function addSymbolToWatchlist(
  symbol: string,
  fetcher: Fetcher = fetch,
): Promise<AddWatchlistResponse> {
  const res = await fetcher('/api/hq/watchlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol }),
  });
  const data = (await res.json()) as AddWatchlistResponse;
  if (!res.ok) {
    throw new Error(data.error || `添加失败：HTTP ${res.status}`);
  }
  return data;
}

export function notifyWatchlistChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(WATCHLIST_CHANGED_EVENT));
}
