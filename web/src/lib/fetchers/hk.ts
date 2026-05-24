/**
 * 港股数据抓取（stockanalysis.com）
 *
 * 思路：stockanalysis.com 的港股财报页（如 /quote/hkg/1811/financials/balance-sheet/）
 * 把全部年度数据以 JS 数组形式内嵌在 HTML 里（每个数组顺序：[TTM, 最近5年]）。
 * 正则抽取后映射到本地 schema。
 *
 * 单位：raw（百万美元的 1e6 倍，stockanalysis 用美元；个别港币计价公司用 HKD）。
 */

import type { CompanyFinancials } from '@/types/finance';

interface ScrapedPage {
  /** key → 数组（[0]=TTM/latest, [1]=2025, [2]=2024, [3]=2023, [4]=2022, [5]=2021）*/
  data: Record<string, Array<number | null>>;
  /** 数据排列对应的年度 */
  years: number[];
  raw: string;
}

const HK_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36';

async function fetchPage(url: string): Promise<ScrapedPage> {
  const res = await fetch(url, {
    headers: { 'User-Agent': HK_UA, Accept: 'text/html' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`stockanalysis.com ${url} → ${res.status}`);
  const html = await res.text();

  // 内嵌格式：`key:[val,val,val,...]`，散布在 self.__next_f.push 内。
  const data: Record<string, Array<number | null>> = {};
  // 匹配 `xxx:[1,2,3,...]` 模式（最多 12 个数值）
  const re = /([a-zA-Z_][a-zA-Z0-9_]{1,40}):\[((?:-?[\d.eE+]+|null)(?:,(?:-?[\d.eE+]+|null)){2,12})\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const key = m[1];
    if (data[key]) continue; // 取第一个出现的（页面内可能重复）
    const arr = m[2].split(',').map((s) => {
      const t = s.trim();
      if (t === 'null') return null;
      const n = parseFloat(t);
      return Number.isFinite(n) ? n : null;
    });
    data[key] = arr;
  }
  return { data, years: [], raw: html };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** stockanalysis 数组的常规索引：[0]=TTM, [1]=最新FY, [2]=次新FY, ...
 *  返回 null 表示该期间数据缺失（区别于 0 真值）。 */
function pickFY(arr: Array<number | null> | undefined, fyOffset: number): number | null {
  if (!arr) return null;
  const v = arr[fyOffset + 1];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
/** 把 null 当 0 参与计算（用于聚合）；返回原值时保持 null */
const N = (v: number | null): number => (v === null ? 0 : v);
/** 任一为 null 就返回 null（用于"上游缺数据时下游也缺"）*/
const sumOrNull = (...vs: Array<number | null>): number | null =>
  vs.some((v) => v === null) ? null : vs.reduce((s: number, v) => s + (v as number), 0);

export async function fetchHKCompany(
  ticker: string,
): Promise<CompanyFinancials & { _sourceName?: string }> {
  // ticker like "01811" or "1811" — stockanalysis 用不带前导 0 的格式
  const numeric = ticker.replace(/^0+/, '');
  const base = `https://stockanalysis.com/quote/hkg/${numeric}`;

  const [is, bs, cf, overview] = await Promise.all([
    fetchPage(`${base}/financials/`).catch(() => null),
    fetchPage(`${base}/financials/balance-sheet/`).catch(() => null),
    fetchPage(`${base}/financials/cash-flow-statement/`).catch(() => null),
    fetchPage(`${base}/`).catch(() => null),
  ]);

  if (!is || !bs || !cf) throw new Error('stockanalysis 抓取失败（可能页面结构变化）');

  // 公司名（中英）
  const nameMatch = (overview?.raw ?? '').match(/<h1[^>]*>([^<]+)\s*\(/);
  const nameEn = nameMatch ? nameMatch[1].trim() : `公司 ${ticker}`;
  // 中文名表（常见港股）
  const HK_ZH_NAME: Record<string, string> = {
    '01811': '中广核新能源',
    '00700': '腾讯控股',
    '09988': '阿里巴巴',
    '03690': '美团',
    '01810': '小米集团',
    '00939': '建设银行',
    '01398': '工商银行',
    '00005': '汇丰控股',
    '01299': '友邦保险',
    '02318': '中国平安',
  };
  const padded = ticker.padStart(5, '0');
  const nameZh = HK_ZH_NAME[padded] ?? nameEn;
  // 港股一律按 USD 计价（用户明确要求）
  const currency = 'USD' as const;

  // ─── 映射到 schema ───
  // stockanalysis 的数组顺序：[0]=TTM, [1]=最新FY, [2]=次新FY, ...
  // 中广核新能源最新 FY = 2025（截止日 2025-12-31）
  // 我们想要 5 年：2021, 2022, 2023, 2024, 2025
  // 对应 fyOffset: 4, 3, 2, 1, 0

  const YEARS = [2021, 2022, 2023, 2024, 2025];
  const offsetForYear = (y: number) => 2025 - y; // 0..4

  const isPeriods = YEARS.map((y) => {
    const off = offsetForYear(y);
    const rev_main = pickFY(is.data.revenue, off);
    if (rev_main === null) {
      // 整年缺数据 → 返回空对象，让 UI 显示 "—"
      return { period: { year: y, granularity: 'Y' as const }, values: {} };
    }
    const rev_other = 0;
    const rev_total = rev_main;
    const ebit_raw = pickFY(is.data.ebit, off);
    const pretax_raw = pickFY(is.data.pretax, off);
    const net_income_raw = pickFY(is.data.netinc, off);
    const ni_minority_raw = N(pickFY(is.data.minorityInterest, off));
    const sga = Math.abs(N(pickFY(is.data.sgaUti, off)));
    const interest_exp = Math.abs(N(pickFY(is.data.interestExpenseUti, off)));
    const interest_inc = Math.abs(N(pickFY(is.data.interestIncomeUti, off)));
    const da_total = N(pickFY(is.data.depAmorUti, off));
    const ebitda = N(pickFY(is.data.ebitda, off));
    const gross_profit_est = round2(ebitda + sga);
    const cogs_main = round2(rev_total - gross_profit_est);
    const cogs_other = 0;
    const selling_exp = 0;     // stockanalysis 只给 SG&A 合计
    const admin_exp = sga;
    const rd_exp = 0;
    const ebit = ebit_raw ?? 0;
    const da_exp = Math.max(0, round2(gross_profit_est - admin_exp - rd_exp - ebit));
    const asset_impairment = Math.abs(N(pickFY(is.data.assetWritedownUti, off)));
    const credit_impairment = 0;
    const fair_value_change = 0;
    const other_op_inc = N(pickFY(is.data.gainAssetsUti, off));
    const fx_gain = N(pickFY(is.data.currencyGainsUti, off));
    const ebt = pretax_raw ?? ebit;
    const non_op_net = round2(ebt - ebit + interest_exp - interest_inc);
    const invest_inc = N(pickFY(is.data.incomeEquityUti, off));
    const net_income = net_income_raw ?? round2(ebt - 0);
    const ni_parent = round2(net_income - ni_minority_raw);
    const ni_minority = ni_minority_raw;
    const tax_exp = round2(ebt - net_income);
    const oci = 0;
    const compr_inc = round2(net_income + oci);
    const gross_profit = round2(rev_total - cogs_main - cogs_other);

    return {
      period: { year: y, granularity: 'Y' as const },
      values: {
        rev_main, rev_other, rev_total,
        cogs_main, cogs_other, gross_profit,
        selling_exp, admin_exp, rd_exp, da_exp,
        asset_impairment, credit_impairment, fair_value_change, other_op_inc,
        ebit,
        interest_exp, interest_inc, invest_inc, fx_gain, non_op_net,
        ebt,
        tax_exp, ni_parent, ni_minority, net_income,
        oci, compr_inc,
      },
    };
  });

  const bsPeriods = YEARS.map((y) => {
    const off = offsetForYear(y);
    const total_assets_check = pickFY(bs.data.assets || bs.data.totalAssets, off);
    if (total_assets_check === null) {
      return { period: { year: y, granularity: 'Y' as const }, values: {} };
    }
    // stockanalysis 实际 key 名（探测后确认）
    const cash = N(pickFY(bs.data.cashneq, off));
    const ar = N(pickFY(bs.data.otherReceivables || bs.data.receivablesUti, off));
    const inventory = N(pickFY(bs.data.inventoryUti, off));
    const total_ca = N(pickFY(bs.data.assetsc, off));

    // stockanalysis 不细分 "已抵押银行存款"、合同资产、预付款、衍生资产等
    // 这些金额被合并在 otherCurrentAssetsUti / otherReceivables 中
    // 留 null 表示"源未细分"，UI 显示 "—"，准确诚实
    const pledged_deposits = null;
    const st_investments = N(pickFY(bs.data.investmentsc || bs.data.shortTermInvestmentsUti, off));
    const notes_receivable = null;
    const contract_assets_cur = null;
    const prepayments = null;
    const income_tax_recv = null;
    const deriv_assets_cur = null;
    // 把 stockanalysis 的 "otherCurrentAssetsUti" 计入 other_ca（catch-all 桶）
    // 对于 01811 这类港股公司，"已抵押银行存款"被并在这里
    const other_ca = round2(N(pickFY(bs.data.otherCurrentAssetsUti, off)) + Math.max(0, total_ca - cash - ar - inventory - N(pickFY(bs.data.otherCurrentAssetsUti, off))));

    const ppe = N(pickFY(bs.data.netPPE, off));
    const rou_assets = 0; // stockanalysis 已合并到 PP&E
    const cip = N(pickFY(bs.data.constructionInProgress, off));
    const investment_property = 0;
    const goodwill = N(pickFY(bs.data.goodwill, off));
    const intangibles = 0; // stockanalysis 把 intangibles 含在 goodwill 一起
    const lt_equity_inv = N(pickFY(bs.data.longTermInvestmentsUti, off));
    const deferred_tax_assets = N(pickFY(bs.data.defferedTaxAssetsUti || bs.data.defferedTaxAssets, off));
    const total_assets = total_assets_check;
    const total_nca = round2(total_assets - total_ca);
    const known_nca = ppe + rou_assets + cip + investment_property + lt_equity_inv + goodwill + intangibles + deferred_tax_assets;
    const other_nca = Math.max(0, round2(total_nca - known_nca));

    const st_debt = N(pickFY(bs.data.shortTermDebtUti, off));
    const lt_debt_current = N(pickFY(bs.data.currentPortLongTermDebtUti, off));
    const notes_payable = 0;
    const ap = N(pickFY(bs.data.accountsPayableUti, off));
    const income_tax_payable = N(pickFY(bs.data.currentIncomeTaxesPayable, off));
    const contract_liab_cur = N(pickFY(bs.data.currentUnearnedRevenueUti, off));
    const lease_liab_cur = N(pickFY(bs.data.currentCapLeases, off));
    const deriv_liab_cur = 0;
    const total_cl = N(pickFY(bs.data.currentLiabilities, off));
    const known_cl = st_debt + lt_debt_current + notes_payable + ap + income_tax_payable + contract_liab_cur + lease_liab_cur + deriv_liab_cur;
    const other_cl = Math.max(0, round2(total_cl - known_cl));

    const lt_debt = N(pickFY(bs.data.longTermDebtUti, off));
    const bonds_payable = 0;
    const lease_liab_noncur = 0;
    const deferred_tax_liab = N(pickFY(bs.data.longTermDeferredTaxLiabilitiesUti, off));
    const lt_deferred_revenue = N(pickFY(bs.data.longTermUnearnedRevenue, off));
    const total_liab = N(pickFY(bs.data.liabilities, off));
    const total_ncl = round2(total_liab - total_cl);
    const known_ncl = lt_debt + bonds_payable + lease_liab_noncur + deferred_tax_liab + lt_deferred_revenue;
    const other_ncl = Math.max(0, round2(total_ncl - known_ncl));

    const share_capital = N(pickFY(bs.data.commonStock, off));
    const capital_reserve = N(pickFY(bs.data.additionalPaidInCapital, off));
    const treasury_stock = 0;
    const other_reserves = N(pickFY(bs.data.otherEquityUti, off));
    const retained_earnings = N(pickFY(bs.data.retearn, off));
    const parent_equity = N(pickFY(bs.data.totalCommonEquity, off));
    const minority_equity = N(pickFY(bs.data.minorityInterestBS, off));
    const total_equity = N(pickFY(bs.data.equity, off)) || round2(parent_equity + minority_equity);
    const total_liab_equity = round2(total_liab + total_equity);

    return {
      period: { year: y, granularity: 'Y' as const },
      values: {
        cash, pledged_deposits, st_investments, notes_receivable, ar, inventory,
        contract_assets_cur, prepayments, income_tax_recv, deriv_assets_cur, other_ca, total_ca,
        ppe, rou_assets, cip, investment_property, lt_equity_inv, goodwill, intangibles,
        deferred_tax_assets, other_nca, total_nca, total_assets,
        st_debt, lt_debt_current, notes_payable, ap, income_tax_payable,
        contract_liab_cur, lease_liab_cur, deriv_liab_cur, other_cl, total_cl,
        lt_debt, bonds_payable, lease_liab_noncur, deferred_tax_liab, lt_deferred_revenue, other_ncl, total_ncl, total_liab,
        share_capital, capital_reserve, treasury_stock, other_reserves, retained_earnings, parent_equity,
        minority_equity, total_equity, total_liab_equity,
      },
    };
  });

  const cfPeriods = YEARS.map((y) => {
    const off = offsetForYear(y);
    const net_op_cf_raw = pickFY(cf.data.ncfo, off);
    if (net_op_cf_raw === null) {
      // 该年 CF 数据未发布 → 整年留空
      return { period: { year: y, granularity: 'Y' as const }, values: {} };
    }
    const net_op_cf = net_op_cf_raw;
    const net_inv_cf = N(pickFY(cf.data.ncfi, off));
    const net_fin_cf = N(pickFY(cf.data.ncff, off));

    // stockanalysis 提供的港股 CF 数据：只有三大净额 + 少量明细（capex / 借贷 / 分红）
    // CFI 明细
    const capex_raw = pickFY(cf.data.capex || cf.data.capexUti, off);
    const capex = capex_raw === null ? null : -Math.abs(N(capex_raw));
    const sale_of_ppe_raw = pickFY(cf.data.saleOfPropertyPlantAndEquipment, off);
    const disposal_ppe = sale_of_ppe_raw === null ? null : Math.abs(N(sale_of_ppe_raw));
    const purchase_invest_raw = pickFY(cf.data.investInSecurities, off);
    const purchase_investments = purchase_invest_raw === null ? null : -Math.abs(N(purchase_invest_raw));
    // CFF 明细
    const debt_issued_raw = pickFY(cf.data.debtIssuedLongTerm || cf.data.netDebtIssued, off);
    const debt_issued = debt_issued_raw === null ? null : Math.abs(N(debt_issued_raw));
    const debt_repaid_raw = pickFY(cf.data.debtRepaidLongTerm, off);
    const debt_repaid = debt_repaid_raw === null ? null : -Math.abs(N(debt_repaid_raw));
    const dividends_raw = pickFY(cf.data.commonDividendCF, off);
    const dividends_to_shareholders = dividends_raw === null ? null : -Math.abs(N(dividends_raw));
    const buyback_raw = pickFY(cf.data.commonRepurchased, off);
    const equity_repurchased = buyback_raw === null ? null : -Math.abs(N(buyback_raw));

    return {
      period: { year: y, granularity: 'Y' as const },
      values: {
        // CFO indirect 明细 — stockanalysis 未提供，全 null
        ebt_for_cf: null, da_cfo: null, impairment_cfo: null, sbc_cfo: null, other_non_cash: null,
        chg_receivables: null, chg_inventory: null, chg_payables: null, chg_other_wc: null,
        interest_paid: null, tax_paid: null,
        net_op_cf,
        // CFI
        capex, disposal_ppe,
        acquisitions: null, divestitures: null,
        purchase_investments, sale_investments: null,
        interest_dividends_received: null, other_investing: null,
        net_inv_cf,
        // CFF
        debt_issued, debt_repaid,
        equity_issued: null, equity_repurchased,
        dividends_to_shareholders,
        dividends_to_nci: null, lease_principal_paid: null, other_financing: null,
        net_fin_cf,
        // 净增加 / 期末
        fx_effect_on_cash: null,
        net_change_cash:
          net_op_cf !== null && net_inv_cf !== null && net_fin_cf !== null
            ? round2(net_op_cf + net_inv_cf + net_fin_cf)
            : null,
        beg_cash: null as number | null,
        end_cash: null as number | null,
      },
    };
  });

  // 链 CF 期初/期末（用 BS cash 作终点）— 跳过空值年份
  let prevEnd: number | null = null;
  for (let i = 0; i < cfPeriods.length; i++) {
    const v = cfPeriods[i].values as Record<string, number | null>;
    if (Object.keys(v).length === 0) { prevEnd = null; continue; }
    const bsCash = (bsPeriods[i].values as Record<string, number>).cash;
    const netChg = (v.net_change_cash as number) ?? 0;
    if (prevEnd === null) {
      v.beg_cash = round2(bsCash - netChg);
    } else {
      v.beg_cash = prevEnd;
    }
    v.end_cash = round2((v.beg_cash as number) + netChg);
    prevEnd = v.end_cash as number;
  }

  return {
    ticker: ticker.startsWith('0') ? ticker : `0${ticker}`,
    name: nameZh,
    nameEn,
    industry: '—',
    market: 'HK',
    currency,
    unit: 'yuan',
    accountingStandard: 'IFRS',
    statements: {
      IS: { periods: isPeriods },
      BS: { periods: bsPeriods },
      CF: { periods: cfPeriods },
    },
    _sourceName: 'stockanalysis.com',
  } as CompanyFinancials & { _sourceName?: string };
}
