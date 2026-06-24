import { NextResponse } from 'next/server';
import { writeFileSync, readFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { fetchSinaCompany } from '@/lib/fetchers/sina';
import { fetchSECCompany } from '@/lib/fetchers/sec';
import { fetchHKCompany } from '@/lib/fetchers/hk';
import { fetchLocalCSVCompany, hasLocalCSV } from '@/lib/fetchers/local-csv';
import { fetchAshareLatestNoticeDate } from '@/lib/fetchers/eastmoney-disclosure';
import { resolveCompanyQuery, type FetchMarket } from '@/lib/fetchers/resolve-company-query';
import { selfConsistencyChecks } from '@/lib/finance/cross-validate';
import { assertCuratedFieldsPreserved, mergeFetchedCompany } from '@/lib/companies/merge-fetched-company';
import { invalidateCompanyListCache } from '@/data/companies';
import { requireAuth } from '@/lib/auth-guard';
import type { CompanyFinancials, ValidationReport } from '@/types/finance';

function readExistingJson(path: string): Partial<CompanyFinancials> | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as Partial<CompanyFinancials>;
  } catch {
    return null;
  }
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
  let body: { query?: string; force?: boolean; strict?: boolean | string | number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求体非法' }, { status: 400 });
  }
  const query = (body.query ?? '').trim();
  const force = !!body.force;
  // C5: when set, single-source (validation.passed=false) data is REFUSED
  // with 422 instead of being written to disk. Use this in environments
  // that enforce the project's "at least 2 cross-checked sources" rule.
  const strict = body.strict === true || body.strict === '1' || body.strict === 1;
  if (!query) return NextResponse.json({ error: '请提供公司名称或代码' }, { status: 400 });

  const { ticker, market, reason } = resolveCompanyQuery(query);
  if (!ticker) return NextResponse.json({ error: reason ?? '无法解析代码' }, { status: 400 });

  // C4: defense-in-depth ticker whitelist before any filesystem op. resolveTicker
  // already canonicalises, but a regex here guarantees nothing pathological
  // (slashes, '..', null bytes, control chars) ever reaches join().
  if (!/^[A-Z0-9._-]{1,16}$/i.test(ticker)) {
    return NextResponse.json({ error: '代码格式非法' }, { status: 400 });
  }

  // C4: outDir env-overridable so prod containers with read-only src/ work.
  const outDir =
    process.env.VFIN_COMPANIES_DIR ?? join(process.cwd(), 'src', 'data', 'companies');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${ticker}.json`);
  const existing = readExistingJson(outPath);

  if (existsSync(outPath) && !force) {
    return NextResponse.json({ ticker, message: '已存在，直接打开', mode: 'cache' });
  }

  try {
    let company: Awaited<ReturnType<typeof fetchSinaCompany>> | Awaited<ReturnType<typeof fetchSECCompany>>;
    let industry: string;

    // 优先：本地权威 CSV（100% 准确，覆盖外网通道拿不到的明细）
    const resolvedMarket: FetchMarket = market;
    const lookupTicker = resolvedMarket === 'HK' ? ticker.padStart(5, '0') : ticker;
    if (hasLocalCSV(lookupTicker)) {
      company = fetchLocalCSVCompany(lookupTicker);
      industry = company.industry;
    } else if (resolvedMarket === 'US') {
      company = await fetchSECCompany(ticker);
      industry = company.industry;
    } else if (resolvedMarket === 'A') {
      company = await fetchSinaCompany(ticker);
      industry = guessIndustry(company.name);
    } else if (resolvedMarket === 'HK') {
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

    // C5: strict mode refuses to write single-source data. Default mode
    // still writes (compatibility) but flags _quarantined so the frontend
    // can hide / badge it instead of showing it as plain "fetched".
    if (strict && !validation.passed) {
      return NextResponse.json(
        {
          error: '⚠️ 单源数据未通过 cross-check 校验，strict 模式拒绝写盘',
          code: 'single_source_unverified',
          ticker,
          name: company.name,
          source: company._sourceName,
          selfConsistency: {
            passed: consistencyPassed,
            ratio: `${consistency.filter((c) => c.passed).length}/${consistency.length}`,
          },
          requires_second_source: true,
        },
        { status: 422 },
      );
    }

    // 公告日：
    //  - 美股已由 fetchSECCompany 写入 _latestFiledAt（EDGAR `filed`）
    //  - A 股走东方财富 RPT_LICO_FN_CPD 的 NOTICE_DATE（datacenter-web 网络可达）
    //  - 港股暂无（HKEX disclosure 接口可达但 stockId 参数协议未定，留 spike）
    let latestFiledAt = (company as { _latestFiledAt?: string })._latestFiledAt;
    if (!latestFiledAt && market === 'A') {
      latestFiledAt = (await fetchAshareLatestNoticeDate(ticker)) ?? undefined;
    }

    const merged = mergeFetchedCompany(company, existing);
    const out = {
      ...merged,
      industry,
      _source: company._sourceName,
      _fetchedAt: new Date().toISOString(),
      // 真实"财报公告日"。零容错——拿不到就 undefined，前端显示 `--` 不臆造。
      _latestFiledAt: latestFiledAt,
      _validation: validation,
      // C5: explicit on-disk quarantine flag so any consumer can detect
      // "this row is single-source unverified" without re-running validation.
      _quarantined: !validation.passed,
    };
    assertCuratedFieldsPreserved(existing, out);
    delete (out as { _sourceName?: string })._sourceName;
    // Atomic write so concurrent readers never see a half-written JSON.
    const tmp = `${outPath}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(out, null, 2));
    renameSync(tmp, outPath);
    invalidateCompanyListCache();
    return NextResponse.json({
      ticker,
      name: company.name,
      industry,
      market,
      mode: 'live',
      source: company._sourceName,
      message: validation.passed ? '抓取成功' : '抓取成功（已隔离：等待辅源接入）',
      quarantined: !validation.passed,
      requires_second_source: !validation.passed,
      validation: {
        passed: validation.passed,
        selfConsistency: { passed: consistencyPassed, ratio: `${consistency.filter((c) => c.passed).length}/${consistency.length}` },
        warning: validation.passed ? null : '⚠️ 单源数据未达项目"至少 2 源交叉校验"硬性要求 — 已写入但标记为 _quarantined，请手动接入辅源后重跑',
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
