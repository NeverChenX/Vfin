import { fetchJson } from '../providers/http-client.js';

// eastmoney kamt (沪深港通) API.
// fields1: 大盘汇总；fields2: 单通道明细。这里只关心当日净流入。
const HK_CONNECT_URL =
  'https://push2.eastmoney.com/api/qt/kamt/get?fields1=f1,f2,f3,f4&fields2=f51,f52,f53,f54,f55,f56';

const DEFAULT_TTL_MS = 60_000;

// Eastmoney 单位换算：kamt 返回的 dayNetAmtIn 单位是「万元」（一万元 == 10000 元）。
// 历史依据：dayAmtThreshold=4200000 对应沪港通南向每日额度 420 亿元 → 4,200,000 万元 ✓。
// 服务层一律换算为「元」，前端 HKZone.fmtYuan 才能正确分档到 "亿/万"。
const WAN_TO_YUAN = 10_000;

/**
 * Eastmoney kamt 返回 4 个通道：sh2hk / sz2hk (南向流入港股) 与 hk2sh / hk2sz (北向).
 *
 * 字段名（实测 push2 响应）：
 *   - dayNetAmtIn   当日净流入额（单位：万元）  ← 我们要的
 *   - dayAmtRemain  剩余额度（单位：万元）
 *   - dayAmtThreshold 当日额度上限（单位：万元）
 *   - date / date2  交易日
 *
 * 旧代码读的 netBuyAmt / today / f4 全部不存在 → extractNet 永远返 null
 * → 前端"南向净流入"永远显示 "--"。这是原 bug。
 */
function extractNet(channel) {
  if (!channel) return null;
  const raw = Number(channel.dayNetAmtIn);
  if (!Number.isFinite(raw)) return null;
  return raw * WAN_TO_YUAN;
}

export async function computeHkConnect() {
  const json = await fetchJson(HK_CONNECT_URL, {
    headers: { Referer: 'https://data.eastmoney.com/' }
  });
  const data = json?.data ?? {};
  const sh2hk = extractNet(data.sh2hk);
  const sz2hk = extractNet(data.sz2hk);
  const hk2sh = extractNet(data.hk2sh);
  const hk2sz = extractNet(data.hk2sz);

  const southboundNet = sh2hk !== null || sz2hk !== null
    ? (sh2hk ?? 0) + (sz2hk ?? 0)
    : null;
  const northboundNet = hk2sh !== null || hk2sz !== null
    ? (hk2sh ?? 0) + (hk2sz ?? 0)
    : null;

  return {
    southboundNet,
    northboundNet,
    // eastmoney 不直接给"已连涨/连跌"天数；前端只用 net 数据，先返 null 占位。
    southboundDays: null
  };
}

export function createHkConnectService({ ttlMs = DEFAULT_TTL_MS, fetcher = computeHkConnect } = {}) {
  let cache = null; // { at, data }
  let inflight = null;

  async function get() {
    const now = Date.now();
    if (cache && now - cache.at < ttlMs) return cache.data;
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const data = await fetcher();
        cache = { at: Date.now(), data };
        return data;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  return { get };
}
