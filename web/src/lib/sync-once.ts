/**
 * 全局单例：每个浏览器 tab 只调用一次 /api/hq/watchlist/sync-portfolio。
 *
 * 之前的实现 — MarketsTable 和 LeftWatchlistPanel 各自在 useEffect([], []) 里独立 POST，
 * 跨页面切换又触发一次。同一 portfolio 文件被反复读写，gateway 也无幂等。
 *
 * 现在：第一个调用 ensurePortfolioSynced() 的组件触发真请求，
 * 之后所有调用复用同一个 Promise（无论成功失败），整个 tab 生命周期内只跑一次。
 */

let inflight: Promise<void> | null = null;

export function ensurePortfolioSynced(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      await fetch('/api/hq/watchlist/sync-portfolio', { method: 'POST' });
    } catch {
      // 离线 / 持仓文件不存在 / 网络错误 — 忽略，不阻塞 watchlist 加载
    }
  })();
  return inflight;
}
