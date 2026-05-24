/**
 * 内存级 IP rate limiter — 单进程、无外部依赖。
 * 适合 LAN 单实例部署；多实例需上 Redis。
 *
 * 用法：
 *   const blocked = checkRateLimit(ip, { max: 10, windowMs: 60_000 });
 *   if (blocked) return NextResponse.json({ error: '请求过于频繁' }, { status: 429 });
 */

interface Entry {
  count: number;
  resetAt: number;
}

// H7: hard cap on bucket cardinality. An attacker spamming distinct fake
// X-Forwarded-For values could otherwise grow `buckets` unboundedly between
// cleanup intervals. When over-cap we drop the oldest entry (Map preserves
// insertion order so iterator.next() gives the oldest key).
const MAX_BUCKETS = 100_000;
const buckets = new Map<string, Entry>();

function evictIfOverCap(): void {
  while (buckets.size > MAX_BUCKETS) {
    const oldest = buckets.keys().next().value;
    if (oldest === undefined) break;
    buckets.delete(oldest);
  }
}

export interface RateLimitConfig {
  /** 时间窗口内的最大次数 */
  max: number;
  /** 窗口大小（毫秒） */
  windowMs: number;
}

/**
 * 返回 true = 超限（应拒绝）；false = 通过。
 * 调用一次即记一次。
 */
export function checkRateLimit(key: string, cfg: RateLimitConfig): boolean {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || entry.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + cfg.windowMs });
    evictIfOverCap();
    return false;
  }
  entry.count += 1;
  if (entry.count > cfg.max) return true;
  return false;
}

/**
 * 从 Request 拿 client IP（容忍代理头）
 *
 * H5: only trust proxy headers when RATE_LIMIT_TRUST_PROXY=1. Otherwise an
 * attacker can spoof X-Forwarded-For per request to bypass IP-based limits;
 * a misconfigured reverse proxy collapses all real IPs into 'unknown' which
 * effectively shares one bucket among real users.
 */
const TRUST_PROXY_HEADERS = process.env.RATE_LIMIT_TRUST_PROXY === '1';

export function clientIp(req: Request): string {
  if (TRUST_PROXY_HEADERS) {
    const xf = req.headers.get('x-forwarded-for');
    if (xf) return xf.split(',')[0]?.trim() || 'unknown';
    const real = req.headers.get('x-real-ip');
    if (real) return real.trim();
    const cf = req.headers.get('cf-connecting-ip');
    if (cf) return cf.trim();
  }
  return 'unknown';
}

// 周期清理（防内存无限增长）
const CLEANUP_INTERVAL_MS = 5 * 60_000;
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of buckets.entries()) {
      if (v.resetAt <= now) buckets.delete(k);
    }
  }, CLEANUP_INTERVAL_MS).unref?.();
}
