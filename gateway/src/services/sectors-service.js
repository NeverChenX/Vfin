/**
 * 申万一级 31 个行业实时涨跌数据。
 *
 * 数据源：push2delay.eastmoney.com（push2 主域不可达，但延迟节点稳定；
 * 闭市后延迟节点 = 收盘数据；盘中相比实时延迟 ~5 分钟，对"行业热度"展示完全够用）。
 *
 * 申万一级 → 东财 BK 代码：完全 1:1 名字匹配（31 全部命中），见 SECTOR_MAP。
 *
 * 接口形态：单次拉所有 31 个，30s TTL 缓存。原 SectorHeatmap 走 31 次并发 quote
 * 调用且 secid=1.801010 在 push2 体系下根本不支持（v_pv_none_match），全部
 * 落 mock 返回 0 → 31 格全 "—"。
 */

import { fetchJson } from '../providers/http-client.js';

const URL = 'https://push2delay.eastmoney.com/api/qt/stock/get';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
  Referer: 'https://quote.eastmoney.com/',
  Connection: 'close',
};
const DEFAULT_TTL_MS = 30_000;

// 申万一级 31 行业 → 东方财富板块代码（push2delay 已验证全部可拉）。
// 名字一致，UI 显示侧无需变更。
export const SECTOR_MAP = [
  { name: '农林牧渔', code: 'BK0433' },
  { name: '基础化工', code: 'BK1206' },
  { name: '钢铁',     code: 'BK0479' },
  { name: '有色金属', code: 'BK0478' },
  { name: '电子',     code: 'BK1201' },
  { name: '家用电器', code: 'BK0456' },
  { name: '食品饮料', code: 'BK0438' },
  { name: '纺织服饰', code: 'BK0436' },
  { name: '轻工制造', code: 'BK1212' },
  { name: '医药生物', code: 'BK1216' },
  { name: '公用事业', code: 'BK0427' },
  { name: '交通运输', code: 'BK1210' },
  { name: '房地产',   code: 'BK1202' },
  { name: '商贸零售', code: 'BK1213' },
  { name: '社会服务', code: 'BK1214' },
  { name: '综合',     code: 'BK1217' },
  { name: '建筑材料', code: 'BK1208' },
  { name: '建筑装饰', code: 'BK1209' },
  { name: '电力设备', code: 'BK1200' },
  { name: '国防军工', code: 'BK1204' },
  { name: '计算机',   code: 'BK1207' },
  { name: '传媒',     code: 'BK0486' },
  { name: '通信',     code: 'BK1215' },
  { name: '银行',     code: 'BK1283' },
  { name: '非银金融', code: 'BK1203' },
  { name: '汽车',     code: 'BK1211' },
  { name: '机械设备', code: 'BK1205' },
  { name: '煤炭',     code: 'BK0437' },
  { name: '石油石化', code: 'BK0464' },
  { name: '环保',     code: 'BK0728' },
  { name: '美容护理', code: 'BK1035' },
];

/**
 * 抓单个板块的实时报价。失败/超时返回 null，让聚合层把它显示成 "—"。
 * f43 = price×100, f60 = prevClose×100, f170 = pct×100。
 */
async function fetchOne(boardCode) {
  try {
    const url = `${URL}?secid=90.${boardCode}&fields=f43,f57,f58,f60,f170`;
    const json = await fetchJson(url, { headers: HEADERS, timeout: 6_000 });
    const d = json?.data;
    if (!d || typeof d.f170 !== 'number') return null;
    return { pct: d.f170 / 100 };
  } catch {
    return null;
  }
}

/**
 * 并发拉所有 31 个板块。整批共享 6s 超时上限——任何一个挂掉不影响其余。
 */
export async function computeSectors() {
  const results = await Promise.all(SECTOR_MAP.map((s) => fetchOne(s.code)));
  return SECTOR_MAP.map((s, i) => ({
    code: s.code,
    name: s.name,
    pct: results[i]?.pct ?? null,
  }));
}

export function createSectorsService({ ttlMs = DEFAULT_TTL_MS, fetcher = computeSectors } = {}) {
  let cache = null;
  let cachedAt = 0;
  let inflight = null;

  async function get() {
    const now = Date.now();
    if (cache && now - cachedAt < ttlMs) return cache;
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const data = await fetcher();
        cache = data;
        cachedAt = Date.now();
        return data;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  return { get };
}
