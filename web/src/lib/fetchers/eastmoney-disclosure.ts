/**
 * 东方财富 datacenter-web 财报披露接口（仅 A 股 + 港股最近披露日）
 *
 * 用途：抓"最近一次财报公告日"，作为 SEC EDGAR `filed` 字段的 A/HK 对应物，
 * 填到 company JSON 的 `_latestFiledAt` 字段，让首页 FinancialMeta 能显示
 * 真实的"公告日期"而不是 "--"。
 *
 * 数据源：https://datacenter-web.eastmoney.com/api/data/v1/get
 *   - reportName=RPT_LICO_FN_CPD（A 股一/中/年报披露日历，含 NOTICE_DATE/REPORTDATE/QDATE）
 *   - filter=(SECURITY_CODE="600519") 拿单只
 *   - sortColumns=NOTICE_DATE&sortTypes=-1 取最近
 *
 * 这个数据源**网络层可达**（与 push2.eastmoney 不同子域，datacenter-web 在我们网络下通），
 * 与 sec.ts 走同一套"零容错"语义——拿不到就 null，不臆造。
 */

interface CpdRecord {
  SECURITY_CODE: string;
  SECURITY_NAME_ABBR: string;
  NOTICE_DATE: string;   // "2026-04-25 00:00:00"
  REPORTDATE?: string;
  QDATE?: string;        // "2026Q1"
  DATATYPE?: string;     // "2026年 一季报"
}

interface EmEnvelope<T> {
  version: string | null;
  result: { pages: number; data: T[] } | null;
  success?: boolean;
  message?: string;
  code?: number;
}

const BASE = 'https://datacenter-web.eastmoney.com/api/data/v1/get';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
  Referer: 'https://data.eastmoney.com/',
  Accept: 'application/json, text/plain, */*',
  Connection: 'close',
};

/**
 * 取 A 股最近一次财报公告日（YYYY-MM-DD）。
 * - 找不到 / 网络错 → null（前端降级显示 `--`）
 * - **不会 throw**：作为 sec.ts/sina.ts 的可选 enrich，失败不阻断主流程
 */
export async function fetchAshareLatestNoticeDate(securityCode: string): Promise<string | null> {
  // 防御性：只接受 6 位纯数字代码，避免把任意 string 拼到 URL
  if (!/^\d{6}$/.test(securityCode)) return null;
  const params = new URLSearchParams({
    reportName: 'RPT_LICO_FN_CPD',
    columns: 'SECURITY_CODE,NOTICE_DATE,REPORTDATE,QDATE,DATATYPE',
    pageNumber: '1',
    pageSize: '1',
    sortColumns: 'NOTICE_DATE',
    sortTypes: '-1',
    filter: `(SECURITY_CODE="${securityCode}")`,
  });
  try {
    const res = await fetch(`${BASE}?${params}`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as EmEnvelope<CpdRecord>;
    const row = json.result?.data?.[0];
    if (!row?.NOTICE_DATE) return null;
    // "2026-04-25 00:00:00" → "2026-04-25"
    return row.NOTICE_DATE.slice(0, 10);
  } catch {
    return null;
  }
}
