/**
 * 轮询工具 — 带超时、可中断、限流的 fetch。
 *
 * 修两个真实坑：
 *  1. 慢源（腾讯偶发 30s 不响应）会卡死 Promise.all → 加 4s 超时
 *  2. 51 个 symbol 并发会塞满 HTTP/1 连接池 → 分批限流到 6
 */

const DEFAULT_TIMEOUT_MS = 4000;
const MAX_CONCURRENT = 6;

let unauthorizedRedirected = false;

function handleUnauthorized(): void {
  if (unauthorizedRedirected) return;
  if (typeof window === 'undefined') return;
  // 避免登录页 / API 自身的 401 触发死循环
  if (window.location.pathname === '/login' || window.location.pathname === '/register') return;
  unauthorizedRedirected = true;
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = `/login?next=${next}`;
}

export async function fetchJSONSafe<T = unknown>(
  url: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<T | null> {
  const { signal, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const local = new AbortController();
  const onParentAbort = () => local.abort();
  if (signal) {
    if (signal.aborted) return null;
    signal.addEventListener('abort', onParentAbort);
  }
  const timer = setTimeout(() => local.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: local.signal, cache: 'no-store' });
    if (res.status === 401) {
      handleUnauthorized();
      return null;
    }
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onParentAbort);
  }
}

/**
 * 限流并发执行，最多 `concurrency` 个 fetch 同时跑。
 * 比 Promise.all 全发更稳；保留输入顺序对应输出顺序。
 */
export async function fetchAllLimited<T, R>(
  inputs: ReadonlyArray<T>,
  worker: (input: T, index: number) => Promise<R>,
  concurrency: number = MAX_CONCURRENT,
): Promise<R[]> {
  const results: R[] = new Array(inputs.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, inputs.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= inputs.length) return;
      results[i] = await worker(inputs[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

/** 报价类轮询统一周期（之前在 MarketCards/MarketsTable/LeftWatchlistPanel 各写一份） */
export const QUOTE_POLL_MS = 5000;

/**
 * 启动一个可中断的 setTimeout 轮询循环；标签隐藏时自动放慢到 60s，
 * 标签重新可见时立刻补一次。
 *
 * 返回 stop() 用于 cleanup。
 *
 * 用法：
 *   useEffect(() => startVisibilityPoll(tick, QUOTE_POLL_MS), [deps]);
 */
export function startVisibilityPoll(
  tick: (signal: AbortSignal) => Promise<void> | void,
  intervalMs: number = QUOTE_POLL_MS,
): () => void {
  if (typeof window === 'undefined') return () => {};

  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const schedule = () => {
    if (stopped || ctrl.signal.aborted) return;
    const delay = document.hidden ? 60_000 : intervalMs;
    timer = setTimeout(loop, delay);
  };

  const loop = async () => {
    if (stopped || ctrl.signal.aborted) return;
    try { await tick(ctrl.signal); } catch { /* tick 内部自处理 */ }
    schedule();
  };

  const onVisibility = () => {
    if (stopped || ctrl.signal.aborted) return;
    if (!document.hidden) {
      // 回到前台立刻补一次：清掉慢周期 timer，马上跑
      if (timer) clearTimeout(timer);
      loop();
    }
  };

  document.addEventListener('visibilitychange', onVisibility);
  loop();

  return () => {
    stopped = true;
    ctrl.abort();
    if (timer) clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
