import { NextResponse } from 'next/server';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fetchSinaCompany } from '@/lib/fetchers/sina';
import { fetchSECCompany, US_TICKER_CIK } from '@/lib/fetchers/sec';
import { fetchHKCompany } from '@/lib/fetchers/hk';
import { fetchLocalCSVCompany, hasLocalCSV } from '@/lib/fetchers/local-csv';
import { selfConsistencyChecks } from '@/lib/finance/cross-validate';
import { invalidateCompanyListCache } from '@/data/companies';
import { requireAuth } from '@/lib/auth-guard';
import type { ValidationReport } from '@/types/finance';

// 6 位 A 股代码
const A_SHARE_RE = /^\d{6}$/;
// 1-5 位字母（美股）
const US_TICKER_RE = /^[A-Za-z]{1,5}$/;
// 4-5 位数字（港股，可带前导 0）
const HK_TICKER_RE = /^0?\d{4,5}$/;

// 名称 → 代码（A 股 + 美股 + 港股）
const NAME_LOOKUP: Record<string, string> = {
  // A 股
  贵州茅台: '600519',
  五粮液: '000858',
  招商银行: '600036',
  比亚迪: '002594',
  宁德时代: '300750',
  中国广核: '003816',
  长江电力: '600900',
  国电南瑞: '600406',
  // 美股
  特斯拉: 'TSLA',
  苹果: 'AAPL',
  微软: 'MSFT',
  英伟达: 'NVDA',
  谷歌: 'GOOGL',
  亚马逊: 'AMZN',
  脸书: 'META',
  Meta: 'META',
  奈飞: 'NFLX',
  // 港股
  中广核新能源: '01811',
  腾讯: '00700',
  腾讯控股: '00700',
  阿里巴巴: '09988',
  美团: '03690',
  小米: '01810',
};

type Market = 'A' | 'US' | 'HK' | 'unknown';

function detectMarket(s: string): Market {
  if (A_SHARE_RE.test(s)) return 'A';
  if (US_TICKER_RE.test(s) && US_TICKER_CIK[s.toUpperCase()]) return 'US';
  if (HK_TICKER_RE.test(s)) return 'HK';
  return 'unknown';
}

function resolveTicker(query: string): { ticker: string | null; market: Market; reason?: string } {
  const q = query.trim();
  const direct = detectMarket(q);
  if (direct !== 'unknown') return { ticker: q.toUpperCase(), market: direct };
  // 中文别名
  const aliased = NAME_LOOKUP[q];
  if (aliased) return { ticker: aliased, market: detectMarket(aliased) };
  // 模糊匹配
  for (const [name, code] of Object.entries(NAME_LOOKUP)) {
    if (name.includes(q) || q.includes(name)) return { ticker: code, market: detectMarket(code) };
  }
  return { ticker: null, market: 'unknown', reason: '请输入 A 股代码（如 600519）或美股代码（如 TSLA）或公司名（如 特斯拉 / 贵州茅台）' };
}

function guessIndustry(name: string): string {
  if (/银行|金融|信托|保险/.test(name)) return '银行金融';
  if (/电|核|风|光伏|新能源/.test(name)) return '能源电力';
  if (/医药|药|医疗|生物/.test(name)) return '医药健康';
  if (/汽车|车业/.test(name)) return '汽车工业';
  if (/科技|软件|半导体|芯片|互联网|信息/.test(name)) return '科技互联网';
  if (/地产|建筑|建设|工程/.test(name)) return '地产建筑';
  if (/食品|饮料|消费|酒/.test(name)) return '消费食品';
  if (/钢铁|有色|金属|矿/.test(name)) return '钢铁有色';
  if (/通信|移动|联通|电信/.test(name)) return '通信服务';
  return '综合';
}

export async function POST(req: Request) {
  const guard = await requireAuth();
  if (guard instanceof NextResponse) return guard;
  let body: { query?: string; force?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求体非法' }, { status: 400 });
  }
  const query = (body.query ?? '').trim();
  const force = !!body.force;
  if (!query) return NextResponse.json({ error: '请提供公司名称或代码' }, { status: 400 });

  const { ticker, market, reason } = resolveTicker(query);
  if (!ticker) return NextResponse.json({ error: reason ?? '无法解析代码' }, { status: 400 });

  const outDir = join(process.cwd(), 'src', 'data', 'companies');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${ticker}.json`);

  if (existsSync(outPath) && !force) {
    return NextResponse.json({ ticker, message: '已存在，直接打开', mode: 'cache' });
  }

  try {
    let company: Awaited<ReturnType<typeof fetchSinaCompany>> | Awaited<ReturnType<typeof fetchSECCompany>>;
    let industry: string;

    // 优先：本地权威 CSV（100% 准确，覆盖外网通道拿不到的明细）
    const lookupTicker = market === 'HK' ? ticker.padStart(5, '0') : ticker;
    if (hasLocalCSV(lookupTicker)) {
      company = fetchLocalCSVCompany(lookupTicker);
      industry = company.industry;
    } else if (market === 'US') {
      company = await fetchSECCompany(ticker);
      industry = company.industry;
    } else if (market === 'A') {
      company = await fetchSinaCompany(ticker);
      industry = guessIndustry(company.name);
    } else if (market === 'HK') {
      const hk = ticker.padStart(5, '0');
      company = await fetchHKCompany(hk);
      industry = guessIndustry(company.name);
    } else {
      return NextResponse.json({ error: '尚未支持的市场' }, { status: 400 });
    }

    // 强制：每份 JSON 必须带 _validation 元数据
    // 见 memory/data-accuracy-zero-tolerance.md "多渠道 + 交叉校验"硬约束
    const consistency = selfConsistencyChecks(company);
    const consistencyPassed = consistency.every((c) => c.passed);
    const validation: ValidationReport = {
      passedAt: new Date().toISOString(),
      passed: false, // 单源数据自动 false — 项目硬性要求至少 2 源 cross-check
      sources: {
        primary: { name: company._sourceName ?? 'unknown', url: undefined, fetchedAt: new Date().toISOString() },
        secondary: { name: 'PENDING — 辅源未接入 (按项目零容忍要求需补)', url: undefined, fetchedAt: '' },
      },
      checks: consistency,
      notes: [
        `⚠️ 单源抓取 — 项目硬性要求"至少 2 个独立数据源 + 交叉校验"，自动 passed=false 直到接入辅源`,
        `内部一致性校验：${consistency.filter((c) => c.passed).length}/${consistency.length} 项通过`,
      ],
    };

    const out = {
      ...company,
      industry,
      _source: company._sourceName,
      _fetchedAt: new Date().toISOString(),
      _validation: validation,
    };
    delete (out as { _sourceName?: string })._sourceName;
    writeFileSync(outPath, JSON.stringify(out, null, 2));
    invalidateCompanyListCache();
    return NextResponse.json({
      ticker,
      name: company.name,
      industry,
      market,
      mode: 'live',
      source: company._sourceName,
      message: '抓取成功',
      validation: {
        passed: validation.passed,
        selfConsistency: { passed: consistencyPassed, ratio: `${consistency.filter((c) => c.passed).length}/${consistency.length}` },
        warning: validation.passed ? null : '⚠️ 单源数据未达项目"至少 2 源交叉校验"硬性要求 — 请手动接入辅源后重跑',
      },
    });
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `抓取失败：${err}` },
      { status: 502 },
    );
  }
}
