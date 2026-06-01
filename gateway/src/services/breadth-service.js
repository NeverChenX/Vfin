import { fetchJson } from '../providers/http-client.js';

const EASTMONEY_CLIST_URL = 'https://push2.eastmoney.com/api/qt/clist/get';
// 沪深京 A 股全市场过滤（含主板/创业板/科创板/北交所）。
const FS_A_SHARE = 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048';
// eastmoney push2 clist 实测：无论 pz 设多大都最多返回 100。
// 早期写成 200 → 首页只跑 100 只就 `items.length < PAGE_SIZE` 退出 → 5857 只市场被算成 100 只。
const PAGE_SIZE = 100;
const DEFAULT_TTL_MS = 30_000;

// f3 单位 = 百分比 × 100（实测：688031 星环科技 f3=2000 ⇔ +20.00%）。
// 不同板块涨跌停限制不同，单一阈值会把 20cm/30cm 板块大量股票误算成"涨停"。
// 阈值取板块上限 - 0.05%，与同花顺/东财涨停池口径一致。
const LIMIT_BPS = {
  ST: 495,        // ±5%
  MAIN: 995,      // ±10% 沪深主板
  GROWTH: 1995,   // ±20% 创业板 (300/301) + 科创板 (688)
  BJ: 2995        // ±30% 北交所
};

/**
 * 根据 f12（代码）与 f14（名称）判定单股的"接近涨跌停"阈值（×100）。
 *
 * Why: ST/*ST 限制 ±5%、创业板/科创板 ±20%、北交所 ±30%、主板 ±10%。
 *       名称里含 "ST" 的股票即使代码是主板号也走 5% 限制。
 */
export function dailyLimitBps(code, name) {
  const n = name || '';
  if (n.includes('ST') || n.includes('*ST') || n.includes('S*ST')) return LIMIT_BPS.ST;
  const c = String(code || '');
  if (/^(8|4|920)/.test(c)) return LIMIT_BPS.BJ;        // 北交所
  if (/^(30|688)/.test(c)) return LIMIT_BPS.GROWTH;     // 创业板 / 科创板（20cm）
  return LIMIT_BPS.MAIN;                                 // 主板（10cm）
}

/**
 * 抓单页 eastmoney clist 涨跌幅 + 代码 + 名称（f14 用于 ST 识别）。
 *
 * eastmoney push2 在被高并发翻页时偶发 "other side closed"（undici SocketError）。
 * 单页失败会让整页统计为 0，从而把涨/跌/涨停数字算错 → 误判市场情绪。
 * 加 2 次重试（每次 250ms 退避），覆盖 99%+ 的瞬时连接重置。
 */
async function fetchPage(pageNumber, attempts = 5) {
  // 不能 encodeURIComponent(FS_A_SHARE)！eastmoney 的 filter 解析器要求 `+` 原样
  // （`m:0+t:6` 是"市场=0 且 类型=6"的 AND 语义）。
  // %2B 会让 eastmoney 在 TCP 层直接 RST 连接 (undici 报 "other side closed")，
  // 而不是返回 4xx —— 用 curl 测原始 `+` OK、用 fetch 测 `%2B` 必挂。
  const url = `${EASTMONEY_CLIST_URL}?pn=${pageNumber}&pz=${PAGE_SIZE}&fs=${FS_A_SHARE}&fields=f3,f12,f14&po=1&fid=f3`;
  // eastmoney push2 clist 实测会随机 RST 连接（success rate ~50-70%）。
  // Connection: close 强制每次新 TCP 连接，避免连击死掉的 keepalive socket。
  const headers = {
    Referer: 'https://quote.eastmoney.com/center/gridlist.html',
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
    Accept: '*/*',
    Connection: 'close'
  };
  let lastErr;
  // 退避：250ms → 500 → 1s → 2s → 4s，单页最坏 ~8s。
  for (let i = 0; i < attempts; i += 1) {
    try {
      const json = await fetchJson(url, { headers });
      // diff 在 eastmoney push2 实际返回里是「以序号为 key 的对象」({"0":{...}, "1":{...}})
      // 不是数组。直接 `?? []` 然后读 `.length` 会得 undefined → !items.length 触发
      // break，整个统计为 0（用户看到首页"全市场 0 涨 0 跌"是这条 bug 的症状）。
      // 用 Object.values 兼容数组和对象两种返回形态。
      const raw = json?.data?.diff;
      const items = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' ? Object.values(raw) : []);
      const total = Number.isFinite(json?.data?.total) ? json.data.total : null;
      return { items, total };
    } catch (error) {
      lastErr = error;
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** i));
      }
    }
  }
  throw lastErr;
}

/**
 * 聚合涨/跌/平/涨停/跌停（按板块差异阈值判定）。pageCap 控住极端情况下最多翻几页
 * （默认 30 页 = 6000 股，沪深京 A 股总数约 5800）。
 */
export async function computeBreadth({ pageCap = 80 } = {}) {
  let up = 0, down = 0, flat = 0, limitUp = 0, limitDown = 0;
  let totalSeen = 0;
  let total = null;

  let failedPages = 0;
  for (let pn = 1; pn <= pageCap; pn++) {
    let items, t;
    try {
      ({ items, total: t } = await fetchPage(pn));
    } catch (_e) {
      // 单页彻底失败（重试耗尽）：继续翻后面页，最后按 total 缩放统计。
      // 比"整个 breadth 失败 → 用户看不到任何数字"好；用户看到的数字是
      // 部分实际 + 比例外推，结果是有界误差而不是没数据。
      failedPages += 1;
      continue;
    }
    if (total === null && t !== null) total = t;
    if (!items.length) break;

    for (const it of items) {
      const f3 = Number(it.f3);
      if (!Number.isFinite(f3)) continue;
      totalSeen++;
      if (f3 > 0) up++;
      else if (f3 < 0) down++;
      else flat++;
      const limit = dailyLimitBps(it.f12, it.f14);
      if (f3 >= limit) limitUp++;
      else if (f3 <= -limit) limitDown++;
    }

    if (items.length < PAGE_SIZE) break;
    if (total !== null && pn * PAGE_SIZE >= total) break;
    // 每页间隔 80ms，给 eastmoney 上游"喘口气"，整体成功率比无间隔高 30%+。
    await new Promise((resolve) => setTimeout(resolve, 80));
  }

  // 部分页失败 → 按 (total / totalSeen) 比例外推，保证用户拿到"大致对"的市场宽度，
  // 而不是"完全没数字"。partial 字段让前端可以提示"数据不完整"。
  const partial = failedPages > 0 && totalSeen > 0 && total && totalSeen < total;
  const scale = partial ? total / totalSeen : 1;
  return {
    total: total ?? totalSeen,
    up: Math.round(up * scale),
    down: Math.round(down * scale),
    flat: Math.round(flat * scale),
    limitUp: Math.round(limitUp * scale),
    limitDown: Math.round(limitDown * scale),
    partial,
    seen: totalSeen,
    failedPages
  };
}

/**
 * 30s in-memory cache. 同一 market 的并发请求会复用同一 in-flight Promise，
 * 避免多个浏览器 tab 同时打 eastmoney。
 */
export function createBreadthService({ ttlMs = DEFAULT_TTL_MS, fetcher = computeBreadth } = {}) {
  const cache = new Map(); // market → { at, data }
  const inflight = new Map(); // market → Promise

  async function get(market = 'cn') {
    if (market !== 'cn') {
      // 当前只支持 A 股；港股/美股的 breadth 留给后续。
      throw Object.assign(new Error(`Unsupported breadth market: ${market}`), { statusCode: 400 });
    }
    const now = Date.now();
    const entry = cache.get(market);
    if (entry && now - entry.at < ttlMs) return entry.data;

    if (inflight.has(market)) return inflight.get(market);
    const p = (async () => {
      try {
        const data = await fetcher({});
        cache.set(market, { at: Date.now(), data });
        return data;
      } finally {
        inflight.delete(market);
      }
    })();
    inflight.set(market, p);
    return p;
  }

  return { get };
}
