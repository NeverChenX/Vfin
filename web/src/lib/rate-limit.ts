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

const buckets = new Map<string, Entry>();

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
    return false;
  }
  entry.count += 1;
  if (entry.count > cfg.max) return true;
  return false;
}

/** 从 Request 拿 client IP（容忍代理头） */
export function clientIp(req: Request): string {
  const xf = req.headers.get('x-forwarded-for');
  if (xf) return xf.split(',')[0]?.trim() || 'unknown';
  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();
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
