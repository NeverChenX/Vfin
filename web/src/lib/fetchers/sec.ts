/**
 * SEC EDGAR XBRL 数据抓取（美股）
 *
 * 数据源：https://data.sec.gov/api/xbrl/companyfacts/CIK{10位补零CIK}.json
 * 监管机构原始数据；JSON 结构化、覆盖 1990+ 全部上市公司、完全免费、不需登录。
 *
 * 取年度（10-K, fp=FY）填本地 schema。Q/H 暂留空（10-Q 有 3-month 和 YTD 混合，
 * 需要按 start/end 区分；本 MVP 先把年度做扎实）。
 */

import type { CompanyFinancials, PeriodKey } from '@/types/finance';

const SEC_USER_AGENT = 'VFin/1.0 (lan@local)';

// Ticker → CIK（常见美股）
export const US_TICKER_CIK: Record<string, { cik: number; name: string; nameZh: string; industry: string }> = {
  TSLA:  { cik: 1318605,  name: 'Tesla, Inc.',           nameZh: '特斯拉',     industry: '汽车 / 新能源车' },
  AAPL:  { cik: 320193,   name: 'Apple Inc.',            nameZh: '苹果',       industry: '消费电子' },
  MSFT:  { cik: 789019,   name: 'Microsoft Corporation', nameZh: '微软',       industry: '软件 / 云服务' },
  GOOGL: { cik: 1652044,  name: 'Alphabet Inc.',         nameZh: '谷歌',       industry: '互联网 / 广告' },
  NVDA:  { cik: 1045810,  name: 'NVIDIA Corporation',    nameZh: '英伟达',     industry: '半导体' },
  AMZN:  { cik: 1018724,  name: 'Amazon.com, Inc.',      nameZh: '亚马逊',     industry: '电商 / 云服务' },
  META:  { cik: 1326801,  name: 'Meta Platforms, Inc.',  nameZh: 'Meta',       industry: '互联网 / 社交' },
  NFLX:  { cik: 1065280,  name: 'Netflix, Inc.',         nameZh: '奈飞',       industry: '流媒体' },
};

interface SECFactRecord {
  end: string;
  start?: string;
  val: number;
  fy: number;
  fp: 'FY' | 'Q1' | 'Q2' | 'Q3';
  form: string;     // 10-K / 10-Q
  filed: string;
  accn: string;
  frame?: string;
}

interface SECFactsResponse {
  cik: number;
  entityName: string;
  facts: {
    'us-gaap'?: Record<string, { label: string; units: Record<string, SECFactRecord[]> }>;
  };
}

async function fetchFacts(cik: number): Promise<SECFactsResponse> {
  const padded = String(cik).padStart(10, '0');
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${padded}.json`;
  const res = await fetch(url, {
    headers: { 'User-Agent': SEC_USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`SEC EDGAR ${url} → ${res.status}`);
  return res.json();
}

/**
 * 取年度（duration）数据：start=年初 end=年末 的当期值。
 * SEC 的 fy 字段是申报文档的财年（不是数据期），不能用来直接过滤；
 * 必须用 end / start 日期判断真实的数据期。
 * 同一份 10-K 文件里会同时包含当期 + 对比期；选最近 filed 的那条。
 */
function getAnnualDuration(
  facts: SECFactsResponse,
  candidates: string[],
  year: number,
): number {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  for (const concept of candidates) {
    const records = facts.facts['us-gaap']?.[concept]?.units?.USD;
    if (!records) continue;
    const matches = records
      .filter((r) => r.end === end && r.start === start)
      .sort((a, b) => b.filed.localeCompare(a.filed));
    if (matches.length > 0) return matches[0].val;
  }
  return 0;
}

/**
 * 取年度数据，未披露返回 null（区别于实际为 0）。
 * 用于 CF / IS 中需要严格分辨"零容忍"项（见 memory/data-accuracy-zero-tolerance.md）。
 */
function getAnnualDurationNullable(
  facts: SECFactsResponse,
  candidates: string[],
  year: number,
): number | null {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  for (const concept of candidates) {
    const records = facts.facts['us-gaap']?.[concept]?.units?.USD;
    if (!records) continue;
    const matches = records
      .filter((r) => r.end === end && r.start === start)
      .sort((a, b) => b.filed.localeCompare(a.filed));
    if (matches.length > 0) return matches[0].val;
  }
  return null;
}

const sumNullable = (...xs: (number | null)[]): number | null => {
  const valid = xs.filter((x): x is number => x !== null);
  return valid.length === 0 ? null : valid.reduce((a, b) => a + b, 0);
};
const negate = (x: number | null): number | null => x === null ? null : -x;

/**
 * 取年末时点（instant）数据：end=年末，没有 start。
 * Balance sheet 是 point-in-time。
 */
function getAnnualInstant(
  facts: SECFactsResponse,
  candidates: string[],
  year: number,
): number {
  const end = `${year}-12-31`;
  for (const concept of candidates) {
    const records = facts.facts['us-gaap']?.[concept]?.units?.USD;
    if (!records) continue;
    const matches = records
      .filter((r) => r.end === end && !r.start)
      .sort((a, b) => b.filed.localeCompare(a.filed));
    if (matches.length > 0) return matches[0].val;
  }
  return 0;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * 扫所有 us-gaap facts 取最大的 `filed` 日期。
 *
 * SEC `filed` 字段是 EDGAR 系统收到该 filing 的日期，等同于"财报公告日 / 披露日"。
 * 同一份 10-K 会被切成几百个 fact records，但它们 filed 相同；取整库最大值 = 最近一次提交。
 *
 * 失败/缺数据返回 null —— 零容忍：宁可前端降级显示"同步时间"，也不臆造一个日期。
 */
function latestFilingDate(facts: SECFactsResponse): string | null {
  let max: string | null = null;
  const gaap = facts.facts['us-gaap'];
  if (!gaap) return null;
  for (const concept of Object.values(gaap)) {
    for (const recs of Object.values(concept.units || {})) {
      for (const r of recs) {
        // YYYY-MM-DD 字符串可直接字典序比较
        if (r.filed && (max === null || r.filed > max)) max = r.filed;
      }
    }
  }
  return max;
}

export async function fetchSECCompany(
  ticker: string,
): Promise<CompanyFinancials & { _sourceName?: string; _latestFiledAt?: string }> {
  const meta = US_TICKER_CIK[ticker.toUpperCase()];
  if (!meta) throw new Error(`未知美股 ticker: ${ticker}。当前已收录: ${Object.keys(US_TICKER_CIK).join(', ')}`);

  const facts = await fetchFacts(meta.cik);
  const YEARS = [2021, 2022, 2023, 2024, 2025];

  // ─── IS 映射 ───
  const isPeriods = YEARS.map((year) => {
    const rev_main = getAnnualDuration(facts, ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax'], year);
    const cogs_main = getAnnualDuration(facts, ['CostOfRevenue', 'CostOfGoodsAndServicesSold'], year);
    const gross_profit_real = getAnnualDuration(facts, ['GrossProfit'], year);
    // 用 GrossProfit 倒推 cogs_other（覆盖税金 / 其他成本），保持公式一致
    const cogs_other = round2(rev_main - cogs_main - gross_profit_real);
    const rev_other = 0;
    const rev_total = round2(rev_main + rev_other);
    const gross_profit = round2(rev_total - cogs_main - cogs_other);

    const rd_exp = getAnnualDuration(facts, ['ResearchAndDevelopmentExpense'], year);
    const sga = getAnnualDuration(facts, ['SellingGeneralAndAdministrativeExpense'], year);
    const selling_exp = getAnnualDuration(facts, ['SellingExpense', 'SellingAndMarketingExpense', 'MarketingExpense'], year);
    const admin_exp_raw = getAnnualDuration(facts, ['GeneralAndAdministrativeExpense'], year);
    // 若 SG&A 合并披露 → 拆成销售为 0，管理 = SGA 总额（多数美股做法）
    const admin_exp = admin_exp_raw || sga;
    const sell_final = selling_exp || (sga ? 0 : 0);

    const ebit = getAnnualDuration(facts, ['OperatingIncomeLoss', 'OperatingIncome'], year);
    const da_exp = Math.max(0, round2(gross_profit - sell_final - admin_exp - rd_exp - ebit));

    const asset_impairment = getAnnualDuration(facts, ['AssetImpairmentCharges', 'GoodwillImpairmentLoss', 'ImpairmentOfIntangibleAssetsExcludingGoodwill'], year);
    const credit_impairment = getAnnualDuration(facts, ['ProvisionForLoanAndLeaseLosses', 'CreditLossExpenseReversal'], year);
    const fair_value_change = getAnnualDuration(facts, ['GainLossOnDerivativeInstrumentsNetPretax', 'UnrealizedGainLossOnInvestments'], year);
    const other_op_inc = getAnnualDuration(facts, ['OtherOperatingIncomeExpenseNet'], year);

    const interest_exp = getAnnualDuration(facts, ['InterestExpense', 'InterestExpenseDebt'], year);
    const interest_inc = getAnnualDuration(facts, ['InterestIncomeOperating', 'InvestmentIncomeInterest'], year);
    const fx_gain = getAnnualDuration(facts, ['ForeignCurrencyTransactionGainLossBeforeTax'], year);
    const non_op_net = getAnnualDuration(facts, ['NonoperatingIncomeExpense'], year);

    const invest_inc = getAnnualDuration(facts, ['IncomeLossFromEquityMethodInvestments', 'InvestmentIncomeNet'], year);
    const net_income = getAnnualDuration(facts, ['NetIncomeLoss', 'ProfitLoss'], year);
    const ni_parent = net_income; // US default 同合并 NI
    const ni_minority = getAnnualDuration(facts, ['NetIncomeLossAttributableToNoncontrollingInterest'], year);
    const tax_exp_real = getAnnualDuration(facts, ['IncomeTaxExpenseBenefit'], year);
    const ebt_real = getAnnualDuration(facts, [
      'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments',
      'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest',
      'IncomeLossBeforeIncomeTaxes',
    ], year);
    const ebt = ebt_real || round2(net_income + tax_exp_real);
    const tax_exp = round2(ebt - net_income);

    const oci = getAnnualDuration(facts, ['OtherComprehensiveIncomeLossNetOfTax', 'OtherComprehensiveIncomeLossNetOfTaxPortionAttributableToParent'], year);
    const compr_inc = round2(net_income + oci);

    return {
      period: { year, granularity: 'Y' as const } as PeriodKey,
      values: {
        rev_main, rev_other, rev_total,
        cogs_main, cogs_other, gross_profit,
        selling_exp: sell_final, admin_exp, rd_exp, da_exp,
        asset_impairment, credit_impairment, fair_value_change, other_op_inc,
        ebit,
        interest_exp, interest_inc, invest_inc, fx_gain, non_op_net,
        ebt,
        tax_exp, ni_parent, ni_minority, net_income,
        oci, compr_inc,
      },
    };
  });

  // ─── BS 映射 ───
  const bsPeriods = YEARS.map((year) => {
    // 流动资产
    const cash = getAnnualInstant(facts, ['CashAndCashEquivalentsAtCarryingValue', 'Cash'], year);
    const pledged_deposits = getAnnualInstant(facts, ['RestrictedCashCurrent', 'RestrictedCash'], year);
    const st_investments = getAnnualInstant(facts, ['ShortTermInvestments', 'AvailableForSaleSecuritiesCurrent', 'MarketableSecuritiesCurrent'], year);
    const notes_receivable = getAnnualInstant(facts, ['NotesAndLoansReceivableNetCurrent'], year);
    const ar = getAnnualInstant(facts, ['AccountsReceivableNetCurrent', 'ReceivablesNetCurrent'], year);
    const inventory = getAnnualInstant(facts, ['InventoryNet'], year);
    const contract_assets_cur = getAnnualInstant(facts, ['ContractWithCustomerAssetNetCurrent'], year);
    const prepayments = getAnnualInstant(facts, ['PrepaidExpenseAndOtherAssetsCurrent', 'PrepaidExpenseCurrent'], year);
    const income_tax_recv = getAnnualInstant(facts, ['IncomeTaxesReceivable'], year);
    const deriv_assets_cur = getAnnualInstant(facts, ['DerivativeAssets', 'DerivativeAssetsCurrent'], year);
    const total_ca = getAnnualInstant(facts, ['AssetsCurrent'], year);
    const known_ca = cash + pledged_deposits + st_investments + notes_receivable + ar + inventory + contract_assets_cur + prepayments + income_tax_recv + deriv_assets_cur;
    const other_ca = Math.max(0, round2(total_ca - known_ca));

    // 非流动资产
    const ppe = getAnnualInstant(facts, ['PropertyPlantAndEquipmentNet'], year);
    const rou_assets = getAnnualInstant(facts, ['OperatingLeaseRightOfUseAsset'], year);
    const cip = 0;
    const investment_property = 0;
    const lt_equity_inv = getAnnualInstant(facts, ['EquityMethodInvestments', 'LongTermInvestments'], year);
    const goodwill = getAnnualInstant(facts, ['Goodwill'], year);
    const intangibles = getAnnualInstant(facts, ['IntangibleAssetsNetExcludingGoodwill'], year);
    const deferred_tax_assets = getAnnualInstant(facts, ['DeferredIncomeTaxAssetsNet', 'DeferredTaxAssetsNetNoncurrent'], year);
    const total_assets = getAnnualInstant(facts, ['Assets'], year);
    const total_nca = round2(total_assets - total_ca);
    const known_nca = ppe + rou_assets + cip + investment_property + lt_equity_inv + goodwill + intangibles + deferred_tax_assets;
    const other_nca = Math.max(0, round2(total_nca - known_nca));

    // 流动负债
    const st_debt = getAnnualInstant(facts, ['ShortTermBorrowings', 'DebtCurrent'], year);
    const lt_debt_current = getAnnualInstant(facts, ['LongTermDebtCurrent'], year);
    const notes_payable = getAnnualInstant(facts, ['NotesPayableCurrent'], year);
    const ap = getAnnualInstant(facts, ['AccountsPayableCurrent'], year);
    const income_tax_payable = getAnnualInstant(facts, ['AccruedIncomeTaxesCurrent', 'IncomeTaxesPayableCurrent'], year);
    const contract_liab_cur = getAnnualInstant(facts, ['ContractWithCustomerLiabilityCurrent'], year);
    const lease_liab_cur = getAnnualInstant(facts, ['OperatingLeaseLiabilityCurrent'], year);
    const deriv_liab_cur = getAnnualInstant(facts, ['DerivativeLiabilities', 'DerivativeLiabilitiesCurrent'], year);
    const total_cl = getAnnualInstant(facts, ['LiabilitiesCurrent'], year);
    const known_cl = st_debt + lt_debt_current + notes_payable + ap + income_tax_payable + contract_liab_cur + lease_liab_cur + deriv_liab_cur;
    const other_cl = Math.max(0, round2(total_cl - known_cl));

    // 非流动负债
    const lt_debt = getAnnualInstant(facts, ['LongTermDebtNoncurrent', 'LongTermDebt'], year);
    const bonds_payable = getAnnualInstant(facts, ['BondsPayable'], year);
    const lease_liab_noncur = getAnnualInstant(facts, ['OperatingLeaseLiabilityNoncurrent'], year);
    const deferred_tax_liab = getAnnualInstant(facts, ['DeferredIncomeTaxLiabilitiesNet', 'DeferredTaxLiabilitiesNoncurrent'], year);
    const lt_deferred_revenue = getAnnualInstant(facts, ['DeferredRevenueNoncurrent', 'ContractWithCustomerLiabilityNoncurrent'], year);
    const total_liab = getAnnualInstant(facts, ['Liabilities'], year);
    const total_ncl = round2(total_liab - total_cl);
    const known_ncl = lt_debt + bonds_payable + lease_liab_noncur + deferred_tax_liab + lt_deferred_revenue;
    const other_ncl = Math.max(0, round2(total_ncl - known_ncl));

    // 权益
    const share_capital = getAnnualInstant(facts, ['CommonStockValue'], year);
    const capital_reserve = getAnnualInstant(facts, ['AdditionalPaidInCapital'], year);
    const treasury_stock = getAnnualInstant(facts, ['TreasuryStockValue'], year);
    const other_reserves = getAnnualInstant(facts, ['AccumulatedOtherComprehensiveIncomeLossNetOfTax'], year);
    const retained_earnings = getAnnualInstant(facts, ['RetainedEarningsAccumulatedDeficit'], year);
    const parent_equity = getAnnualInstant(facts, ['StockholdersEquity'], year);
    const minority_equity = getAnnualInstant(facts, ['MinorityInterest'], year);
    const total_equity = getAnnualInstant(facts, ['StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'], year) || round2(parent_equity + minority_equity);
    const total_liab_equity = round2(total_liab + total_equity);

    return {
      period: { year, granularity: 'Y' as const } as PeriodKey,
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

  // ─── CF 映射（CFA / IFRS Indirect Method）───
  // SEC XBRL 字段映射参考 memory/financial-data-fetching-playbook.md §八
  const cfPeriods = YEARS.map((year) => {
    const N = (cands: string[]) => getAnnualDurationNullable(facts, cands, year);

    // 三大净额（最权威）
    const net_op_cf = N(['NetCashProvidedByUsedInOperatingActivities']);
    const net_inv_cf = N(['NetCashProvidedByUsedInInvestingActivities']);
    const net_fin_cf = N(['NetCashProvidedByUsedInFinancingActivities']);

    // CFO Indirect 调整项
    const ebt_for_cf = N([
      'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments',
      'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest',
      'IncomeLossBeforeIncomeTaxes',
    ]);
    const da_cfo = N(['DepreciationDepletionAndAmortization', 'DepreciationAndAmortization', 'Depreciation']);
    const impairment_cfo = sumNullable(
      N(['AssetImpairmentCharges']),
      N(['GoodwillImpairmentLoss']),
      N(['ImpairmentOfIntangibleAssetsExcludingGoodwill']),
    );
    const sbc_cfo = N(['ShareBasedCompensation']);
    const chg_receivables = N(['IncreaseDecreaseInAccountsReceivable', 'IncreaseDecreaseInReceivables']);
    const chg_inventory = N(['IncreaseDecreaseInInventories']);
    const chg_payables = N([
      'IncreaseDecreaseInAccountsPayable',
      'IncreaseDecreaseInAccountsPayableAndAccruedLiabilities',
    ]);
    const chg_other_wc = N([
      'IncreaseDecreaseInOtherOperatingCapitalNet',
      'IncreaseDecreaseInOtherOperatingAssetsAndLiabilitiesNet',
    ]);
    const interest_paid = negate(N(['InterestPaidNet', 'InterestPaid']));
    const tax_paid = negate(N(['IncomeTaxesPaidNet', 'IncomeTaxesPaid']));
    // other_non_cash 是个杂项桶，无单一 XBRL 概念；留 null（未来按需精化）
    const other_non_cash: number | null = null;

    // CFI
    const capex = negate(N(['PaymentsToAcquirePropertyPlantAndEquipment']));
    const disposal_ppe = N(['ProceedsFromSaleOfPropertyPlantAndEquipment']);
    const acquisitions = negate(N(['PaymentsToAcquireBusinessesNetOfCashAcquired']));
    const divestitures = N([
      'ProceedsFromDivestitureOfBusinesses',
      'ProceedsFromDivestitureOfBusinessesNetOfCashDivested',
    ]);
    const purchase_investments = negate(sumNullable(
      N(['PaymentsToAcquireAvailableForSaleSecurities', 'PaymentsToAcquireAvailableForSaleSecuritiesDebt']),
      N(['PaymentsToAcquireInvestments']),
    ));
    const sale_investments = sumNullable(
      N(['ProceedsFromSaleOfAvailableForSaleSecurities', 'ProceedsFromSaleOfAvailableForSaleSecuritiesDebt']),
      N(['ProceedsFromMaturitiesPrepaymentsAndCallsOfAvailableForSaleSecurities']),
    );
    const interest_dividends_received = N([
      'ProceedsFromInterestReceived',
      'InterestReceived',
    ]);
    const other_investing: number | null = null; // 剩余项暂留

    // CFF
    const debt_issued = sumNullable(
      N(['ProceedsFromIssuanceOfLongTermDebt']),
      N(['ProceedsFromShortTermDebt']),
      N(['ProceedsFromIssuanceOfDebt']),
    );
    const debt_repaid = negate(sumNullable(
      N(['RepaymentsOfLongTermDebt']),
      N(['RepaymentsOfShortTermDebt']),
      N(['RepaymentsOfDebt']),
    ));
    const equity_issued = sumNullable(
      N(['ProceedsFromIssuanceOfCommonStock']),
      N(['ProceedsFromIssuanceOfPreferredStockPreferenceStock']),
    );
    const equity_repurchased = negate(N(['PaymentsForRepurchaseOfCommonStock']));
    const dividends_to_shareholders = negate(N(['PaymentsOfDividends', 'PaymentsOfDividendsCommonStock']));
    const dividends_to_nci = negate(N(['PaymentsOfDividendsMinorityInterest']));
    const lease_principal_paid = negate(N([
      'RepaymentsOfFinanceLeasePrincipal',
      'FinanceLeasePrincipalPayments',
    ]));
    const other_financing: number | null = null;

    const fx_effect_on_cash = N([
      'EffectOfExchangeRateOnCashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents',
      'EffectOfExchangeRateOnCashAndCashEquivalents',
    ]);
    const net_change_cash = sumNullable(net_op_cf, net_inv_cf, net_fin_cf); // 不含 FX（schema §四）

    // Reconciliation：catch-all 桶 = 净额 - 已知子项之和。
    // SEC XBRL 概念集合远大于 schema 13 个 indirect 字段，差额代表 schema 未细分的剩余调整。
    // 这跟年报常见的 "Other operating activities / Other investing / Other financing" 同语义。
    // 注意：interest_paid 在 US GAAP 通常计 CFO，跟港股 IFRS 计 CFF 不同。
    const cfo_known = sumNullable(
      ebt_for_cf, da_cfo, impairment_cfo, sbc_cfo,
      chg_receivables, chg_inventory, chg_payables, chg_other_wc,
      interest_paid, tax_paid,
    );
    const other_non_cash_final =
      net_op_cf !== null && cfo_known !== null ? round2(net_op_cf - cfo_known) : other_non_cash;
    const cfi_known = sumNullable(capex, disposal_ppe, acquisitions, divestitures, purchase_investments, sale_investments, interest_dividends_received);
    const other_investing_final =
      net_inv_cf !== null && cfi_known !== null ? round2(net_inv_cf - cfi_known) : other_investing;
    const cff_known = sumNullable(debt_issued, debt_repaid, equity_issued, equity_repurchased, dividends_to_shareholders, dividends_to_nci, lease_principal_paid);
    const other_financing_final =
      net_fin_cf !== null && cff_known !== null ? round2(net_fin_cf - cff_known) : other_financing;

    return {
      period: { year, granularity: 'Y' as const } as PeriodKey,
      values: {
        // CFO
        ebt_for_cf, da_cfo, impairment_cfo, sbc_cfo, other_non_cash: other_non_cash_final,
        chg_receivables, chg_inventory, chg_payables, chg_other_wc,
        interest_paid, tax_paid,
        net_op_cf,
        // CFI
        capex, disposal_ppe, acquisitions, divestitures,
        purchase_investments, sale_investments, interest_dividends_received,
        other_investing: other_investing_final,
        net_inv_cf,
        // CFF
        debt_issued, debt_repaid, equity_issued, equity_repurchased,
        dividends_to_shareholders, dividends_to_nci, lease_principal_paid,
        other_financing: other_financing_final,
        net_fin_cf,
        // 净增加 & 期末
        fx_effect_on_cash, net_change_cash,
        beg_cash: null as number | null,
        end_cash: null as number | null,
      },
    };
  });

  // 链 CF 期初 / 期末（用 BS 现金作终点；缺数据保 null 不臆造）
  for (let i = 0; i < cfPeriods.length; i++) {
    const bs = bsPeriods[i];
    const v = cfPeriods[i].values;
    const bsCash = (bs.values.cash as number | null) ?? null;
    if (bsCash === null) continue;
    v.end_cash = bsCash;
    const netChg = v.net_change_cash as number | null;
    const fx = v.fx_effect_on_cash as number | null;
    if (netChg !== null) {
      v.beg_cash = round2(bsCash - netChg - (fx ?? 0));
    }
  }

  return {
    ticker: ticker.toUpperCase(),
    name: meta.nameZh,
    nameEn: meta.name,
    industry: meta.industry,
    market: 'US',
    currency: 'USD',
    unit: 'yuan',
    accountingStandard: 'US-GAAP',
    statements: {
      IS: { periods: isPeriods },
      BS: { periods: bsPeriods },
      CF: { periods: cfPeriods },
    },
    _sourceName: `SEC EDGAR · CIK${String(meta.cik).padStart(10, '0')}`,
    _latestFiledAt: latestFilingDate(facts) ?? undefined,
  } as CompanyFinancials & { _sourceName?: string; _latestFiledAt?: string };
}
