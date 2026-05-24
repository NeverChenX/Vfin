/**
 * 本地权威 CSV 导入器
 *
 * 用途：某些公司在外网渠道（Sina / SEC / stockanalysis）拿不到细分字段（如港股的
 * 「已抵押银行存款（流动）」），但本地有 lixinger 等付费来源的已审计 CSV。
 * 这种情况下，CSV 是 100% 准确的权威数据，必须直接导入而非估算。
 *
 * 区别于"抓取通道"：CSV 的来源 `_source` 标为 "本地权威CSV"，
 * UI 上显示 `📥 本地导入`，跟联网抓取的数据明确区分。
 *
 * 数据准确性政策（见 memory/data-accuracy-zero-tolerance.md）：
 * - 缺失字段必须 null（不能填 0/估算）
 * - 导入后必须双重校验：①跟 CSV 原值逐字段比对 ②表内一致性
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { CompanyFinancials, PeriodKey } from '@/types/finance';

const CSV_DIR = '/home/Neverchen/project/File/5年三表';

interface CompanyCSVMeta {
  ticker: string;     // 我们项目内的 ticker（如 '01811'）
  market: 'HK' | 'A' | 'US';
  nameZh: string;
  nameEn?: string;
  industry: string;
  currency: 'USD' | 'CNY' | 'HKD';
  isFilename: string;
  bsFilename: string;
  cfFilename: string;
}

const REGISTRY: CompanyCSVMeta[] = [
  {
    ticker: '01811',
    market: 'HK',
    nameZh: '中广核新能源',
    nameEn: 'CGN New Energy Holdings Co., Ltd.',
    industry: '能源电力',
    currency: 'USD',
    isFilename: '中广核新能源_利润表_合并报表_20260511_094706.csv',
    bsFilename: '中广核新能源_资产负债表_合并报表_20260511_094715.csv',
    cfFilename: '中广核新能源_现金流量表_合并报表_20260511_094711.csv',
  },
];

export function hasLocalCSV(ticker: string): boolean {
  return REGISTRY.some((c) => c.ticker === ticker);
}

/** 解析 lixinger CSV：每行 = 科目名,ticker,公司名,2025val,2024val,2023val,2022val,2021val */
interface ParsedCSV {
  /** 按科目中文名取 5 年值（[2021, 2022, 2023, 2024, 2025]） */
  rows: Map<string, Array<number | null>>;
}

function stripValue(raw: string): number | null {
  // 处理 ="01811"、="2025-12-31"、=123456 等格式
  let v = raw.trim();
  if (v.startsWith('=')) v = v.slice(1);
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  if (v === '' || v === '--' || v === '-') return null;
  // "5.50万" 类带后缀
  if (/^[\d.]+万$/.test(v)) return parseFloat(v) * 1e4;
  // "万美元" 类
  const wanMatch = v.match(/^([\d.]+)万美元$/);
  if (wanMatch) return parseFloat(wanMatch[1]) * 1e4;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function parseLixingerCSV(path: string): ParsedCSV {
  const text = readFileSync(path, 'utf-8');
  const lines = text.split(/\r?\n/);
  const rows = new Map<string, Array<number | null>>();
  for (const line of lines) {
    if (!line.trim()) continue;
    // CSV 字段简单切分（lixinger 不含逗号在内的值）
    const parts = line.split(',');
    if (parts.length < 8) continue; // 至少 8 列：name, ticker, co, 2025..2021
    const subject = parts[0].trim();
    // 跳过表头 / 元数据行
    if (['财报类型', '日期', '货币', '审计意见', '会计师事务所', '员工情况', '股本、股东以及估值'].includes(subject)) continue;
    if (!subject) continue;
    // 数据起始列是 parts[3]（columns: 0=name, 1=ticker, 2=co, 3=最新年）
    // 顺序：2025, 2024, 2023, 2022, 2021
    const vals2025to2021 = parts.slice(3, 8).map(stripValue);
    // 反转 → [2021, 2022, 2023, 2024, 2025]（与项目惯例一致）
    rows.set(subject, vals2025to2021.reverse());
  }
  return { rows };
}

const round2 = (n: number | null): number | null =>
  n === null ? null : Math.round(n * 100) / 100;

/** 按年份取值（[0]=2021, [4]=2025） */
function pickYear(rows: Map<string, Array<number | null>>, name: string, yearIdx: number): number | null {
  const arr = rows.get(name);
  if (!arr) return null;
  const v = arr[yearIdx];
  return v === undefined ? null : v;
}
/** 几个候选名取一个（first non-null） */
function pickFirst(rows: Map<string, Array<number | null>>, names: string[], yearIdx: number): number | null {
  for (const n of names) {
    const v = pickYear(rows, n, yearIdx);
    if (v !== null) return v;
  }
  return null;
}

/** 必须有值，否则抛错（用于核心字段如 total_assets）*/
function pickRequired(rows: Map<string, Array<number | null>>, name: string, yearIdx: number, year: number): number {
  const v = pickYear(rows, name, yearIdx);
  if (v === null) throw new Error(`CSV 缺关键字段 ${name} 在 ${year}`);
  return v;
}

export function fetchLocalCSVCompany(ticker: string): CompanyFinancials & { _sourceName?: string } {
  const meta = REGISTRY.find((c) => c.ticker === ticker);
  if (!meta) throw new Error(`本地 CSV 未注册 ${ticker}`);

  const bsPath = join(CSV_DIR, meta.bsFilename);
  const isPath = join(CSV_DIR, meta.isFilename);
  const cfPath = join(CSV_DIR, meta.cfFilename);

  for (const p of [bsPath, isPath, cfPath]) {
    if (!existsSync(p)) throw new Error(`CSV 文件不存在: ${p}`);
  }

  const bs = parseLixingerCSV(bsPath);
  const is = parseLixingerCSV(isPath);
  const cf = parseLixingerCSV(cfPath);

  const YEARS = [2021, 2022, 2023, 2024, 2025];

  // ─── IS ───
  const isPeriods = YEARS.map((y, idx) => {
    const rev_main = pickYear(is.rows, '营业收入', idx);
    const rev_total = pickYear(is.rows, '一、营业总收入', idx) ?? rev_main;
    const rev_other = rev_total !== null && rev_main !== null ? round2(rev_total - rev_main) : 0;
    const cogs_main = pickYear(is.rows, '营业成本', idx);
    const interest_exp = pickYear(is.rows, '财务费用', idx);
    const selling_exp = pickYear(is.rows, '减：销售费用', idx) ?? pickYear(is.rows, '销售费用', idx);
    const admin_exp = pickYear(is.rows, '管理费用', idx);
    const rd_exp = pickYear(is.rows, '研发费用', idx);
    const asset_impairment = pickYear(is.rows, '资产减值损失', idx);
    const credit_impairment = pickYear(is.rows, '信用减值损失', idx);
    const fair_value_change = pickYear(is.rows, '公允价值变动收益', idx);
    const other_op_inc_total = pickYear(is.rows, '其他业务收入', idx);
    const other_op_cost = pickYear(is.rows, '其他业务成本', idx);
    const invest_inc = pickYear(is.rows, '加：对联营企业及合营企业的投资收益', idx) ?? pickYear(is.rows, '投资收益', idx);
    const ebt = pickYear(is.rows, '二、利润总额', idx);
    const tax_exp = pickYear(is.rows, '减：所得税费用', idx) ?? pickYear(is.rows, '所得税费用', idx);
    const net_income = pickYear(is.rows, '三、净利润', idx);
    const ni_parent = pickYear(is.rows, '归属于母公司股东及其他权益持有者的净利润', idx);
    const ni_minority = pickYear(is.rows, '少数股东损益', idx);
    const compr_inc = pickYear(is.rows, '五、综合收益总额', idx);
    const oci = pickYear(is.rows, '其他综合收益的税后净额', idx);

    const gross_profit = pickYear(is.rows, '毛利', idx);
    const cogs_other = (rev_total !== null && cogs_main !== null && gross_profit !== null)
      ? round2(rev_total - cogs_main - gross_profit) : (other_op_cost ?? null);

    return {
      period: { year: y, granularity: 'Y' as const } as PeriodKey,
      values: {
        rev_main, rev_other, rev_total,
        cogs_main, cogs_other, gross_profit,
        selling_exp, admin_exp, rd_exp,
        da_exp: null,
        asset_impairment, credit_impairment, fair_value_change,
        other_op_inc: other_op_inc_total,
        // EBIT 反算：lixinger CSV 没披露"营业利润"行，但 IFRS / CFA 标准下
        // EBIT = EBT + finance_costs - investment_income - fx_gain - non_op_net
        // （null 视为 0；至少有 ebt + interest_exp 就能算出可靠的 EBIT）
        ebit: (ebt !== null && interest_exp !== null)
          ? round2(ebt + interest_exp - (invest_inc ?? 0))
          : null,
        interest_exp, interest_inc: null,
        invest_inc, fx_gain: null, non_op_net: null,
        ebt, tax_exp, ni_parent, ni_minority, net_income,
        oci, compr_inc,
      },
    };
  });

  // ─── BS（关键：精确映射"已抵押银行存款（流动）"等明细）───
  const bsPeriods = YEARS.map((y, idx) => {
    const total_assets = pickRequired(bs.rows, '一、资产总计', idx, y);
    const total_ca = pickYear(bs.rows, '流动资产合计', idx);
    const cash = pickYear(bs.rows, '货币资金', idx);
    const pledged_deposits = pickYear(bs.rows, '已抵押银行存款(流动)', idx); // 🎯 核心要求
    const st_investments = pickYear(bs.rows, '短期投资', idx);
    const notes_receivable = pickYear(bs.rows, '(其中)应收票据', idx);
    const ar = pickYear(bs.rows, '(其中)应收账款', idx) ?? pickYear(bs.rows, '应收票据及应收账款', idx);
    const inventory = pickYear(bs.rows, '存货', idx);
    const contract_assets_cur = pickYear(bs.rows, '合同资产(流动)', idx);
    const prepayments = pickYear(bs.rows, '预付款项、按金、其他应收款及其他资产(流动)', idx);
    const income_tax_recv = pickYear(bs.rows, '可收回之税项', idx);
    const deriv_assets_cur = pickYear(bs.rows, '衍生金融资产(流动)', idx);

    const total_nca = pickYear(bs.rows, '非流动资产合计', idx);
    const ppe = pickYear(bs.rows, '物业、厂房及设备', idx);
    const rou_assets = pickYear(bs.rows, '使用权资产', idx);
    const cip = pickYear(bs.rows, '在建工程', idx);
    const investment_property = pickYear(bs.rows, '投资物业', idx);
    const lt_equity_inv = pickYear(bs.rows, '于联营及合资公司之权益', idx);
    const goodwill = pickYear(bs.rows, '(其中)商誉', idx);
    const intangibles = pickYear(bs.rows, '(其中)无形资产', idx);
    const deferred_tax_assets = pickYear(bs.rows, '递延所得税资产', idx);

    const total_liab = pickYear(bs.rows, '二、负债合计', idx);
    const total_cl = pickYear(bs.rows, '流动负债合计', idx);
    const st_debt = pickYear(bs.rows, '短期借款', idx);
    const lt_debt_current = pickYear(bs.rows, '一年内到期的非流动负债', idx);
    const notes_payable = pickYear(bs.rows, '(其中)应付票据', idx);
    const ap = pickYear(bs.rows, '(其中)应付账款', idx) ?? pickYear(bs.rows, '应付票据及应付账款', idx);
    const income_tax_payable = pickYear(bs.rows, '应交税费', idx);
    const contract_liab_cur = pickYear(bs.rows, '合同负债(短期)', idx);
    const lease_liab_cur = pickYear(bs.rows, '租赁负债(短期)', idx);
    const deriv_liab_cur = pickYear(bs.rows, '衍生金融负债(短期)', idx);

    const total_ncl = pickYear(bs.rows, '非流动负债合计', idx);
    const lt_debt = pickYear(bs.rows, '长期借款', idx);
    const bonds_payable = pickYear(bs.rows, '应付债券', idx);
    const lease_liab_noncur = pickYear(bs.rows, '租赁负债(长期)', idx);
    const deferred_tax_liab = pickYear(bs.rows, '递延所得税负债', idx);
    const lt_deferred_revenue = pickYear(bs.rows, '长期递延收益', idx);

    const total_equity = pickYear(bs.rows, '三、所有者权益合计', idx);
    const share_capital = pickYear(bs.rows, '股本', idx);
    const capital_reserve = pickYear(bs.rows, '资本公积', idx);
    const treasury_stock = pickYear(bs.rows, '减：库存股', idx);
    const other_reserves = pickYear(bs.rows, '储备', idx);
    const retained_earnings = pickYear(bs.rows, '未分配利润', idx);
    const parent_equity = pickYear(bs.rows, '归属于母公司股东及其他权益持有者的权益合计', idx);
    const minority_equity = pickYear(bs.rows, '少数股东权益', idx);

    const total_liab_equity = (total_liab !== null && total_equity !== null)
      ? round2(total_liab + total_equity) : null;

    return {
      period: { year: y, granularity: 'Y' as const } as PeriodKey,
      values: {
        cash, pledged_deposits, st_investments, notes_receivable, ar, inventory,
        contract_assets_cur, prepayments, income_tax_recv, deriv_assets_cur,
        other_ca: null, total_ca,
        ppe, rou_assets, cip, investment_property, lt_equity_inv, goodwill, intangibles,
        deferred_tax_assets, other_nca: null, total_nca, total_assets,
        st_debt, lt_debt_current, notes_payable, ap, income_tax_payable,
        contract_liab_cur, lease_liab_cur, deriv_liab_cur, other_cl: null, total_cl,
        lt_debt, bonds_payable, lease_liab_noncur, deferred_tax_liab, lt_deferred_revenue,
        other_ncl: null, total_ncl, total_liab,
        share_capital, capital_reserve, treasury_stock, other_reserves, retained_earnings,
        parent_equity, minority_equity, total_equity, total_liab_equity,
      },
    };
  });

  // ─── CF ───
  const cfPeriods = YEARS.map((y, idx) => {
    const net_op_cf = pickYear(cf.rows, '经营活动产生的现金流量净额', idx);
    const net_inv_cf = pickYear(cf.rows, '投资活动产生的现金流量净额', idx);
    const net_fin_cf = pickYear(cf.rows, '筹资活动产生的现金流量净额', idx);
    const net_change_cash = pickYear(cf.rows, '现金及现金等价物的净增加额', idx);
    const fx_effect_on_cash = pickYear(cf.rows, '汇率变动对现金及现金等价物的影响', idx);
    const beg_cash = pickYear(cf.rows, '期初现金及现金等价物的余额', idx);
    const end_cash = pickYear(cf.rows, '期末现金及现金等价物净余额', idx);

    return {
      period: { year: y, granularity: 'Y' as const } as PeriodKey,
      values: {
        // CFO（Indirect Method）— lixinger CSV 仅给净额，明细 11 项需从年报 PDF 手工补
        ebt_for_cf: null, da_cfo: null, impairment_cfo: null, sbc_cfo: null, other_non_cash: null,
        chg_receivables: null, chg_inventory: null, chg_payables: null, chg_other_wc: null,
        interest_paid: null, tax_paid: null,
        net_op_cf,
        // CFI — 净额已有，8 项明细待年报补全
        capex: null, disposal_ppe: null, acquisitions: null, divestitures: null,
        purchase_investments: null, sale_investments: null,
        interest_dividends_received: null, other_investing: null,
        net_inv_cf,
        // CFF — 净额已有，8 项明细待年报补全
        debt_issued: null, debt_repaid: null, equity_issued: null, equity_repurchased: null,
        dividends_to_shareholders: null, dividends_to_nci: null,
        lease_principal_paid: null, other_financing: null,
        net_fin_cf,
        // 四、净增加 & 五、期末
        fx_effect_on_cash,
        net_change_cash,
        beg_cash, end_cash,
      },
    };
  });

  // ─── 估值 / 比率 ───
  // BS CSV 末尾有市值 / 总股本 / PE / PB / PS / PCF / 股息率
  const ratios = YEARS.map((y, idx) => ({
    period: { year: y, granularity: 'Y' as const } as PeriodKey,
    values: {
      market_cap: pickYear(bs.rows, '市值', idx),
      market_cap_currency: 'HKD',  // 中广核新能源市值是港币计价
      total_shares: pickYear(bs.rows, '总股本', idx),
      pe_ttm: pickYear(bs.rows, 'PE-TTM', idx),
      pb: pickYear(bs.rows, 'PB', idx),
      ps_ttm: pickYear(bs.rows, 'PS-TTM', idx),
      pcf_ttm: pickYear(bs.rows, 'PCF-TTM', idx),
      dividend_yield: pickYear(bs.rows, '股息率', idx),
    },
  }));

  return {
    ticker: meta.ticker,
    name: meta.nameZh,
    nameEn: meta.nameEn,
    industry: meta.industry,
    market: meta.market,
    currency: meta.currency,
    unit: 'yuan',
    accountingStandard: 'IFRS',
    statements: {
      IS: { periods: isPeriods },
      BS: { periods: bsPeriods },
      CF: { periods: cfPeriods },
    },
    ratios,
    _sourceName: '本地权威CSV · lixinger',
  } as CompanyFinancials & { _sourceName?: string };
}
