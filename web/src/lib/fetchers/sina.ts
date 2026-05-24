/**
 * 新浪财经数据抓取器
 *
 * 数据源：
 *   利润表  → http://money.finance.sina.com.cn/corp/go.php/vFD_ProfitStatement/stockid/{code}/ctrl/{year}/displaytype/4.phtml
 *   资产负债 → http://money.finance.sina.com.cn/corp/go.php/vFD_BalanceSheet/...
 *   现金流量 → http://money.finance.sina.com.cn/corp/go.php/vFD_CashFlow/...
 *
 * 返回 HTML（GBK 编码），用表格列出 Q4/Q3/Q2/Q1 累计值（万元）。
 * 本模块负责：①GBK 解码 ②HTML 正则解析 ③YTD → 单期值 ④万元 → 亿元 ⑤映射到本地 schema。
 */

import type { CompanyFinancials, PeriodGranularity, PeriodKey } from '@/types/finance';

type StatementType = 'IS' | 'BS' | 'CF';

const SINA_PATH: Record<StatementType, string> = {
  IS: 'vFD_ProfitStatement',
  BS: 'vFD_BalanceSheet',
  CF: 'vFD_CashFlow',
};

interface SinaTable {
  dates: string[];                  // ["2024-12-31", "2024-09-30", "2024-06-30", "2024-03-31"]
  rows: Map<string, number[]>;      // key=中文科目名，value=4 个数（万元，对应 dates 顺序）
}

const stripTags = (s: string) =>
  s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

async function fetchSinaHTML(path: string): Promise<string> {
  const res = await fetch(`http://money.finance.sina.com.cn/corp/go.php/${path}`, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
    // Sina is slow occasionally; allow 12s
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`Sina ${path} → ${res.status}`);
  const buf = await res.arrayBuffer();
  return new TextDecoder('gbk').decode(buf);
}

function parseSinaPage(html: string): SinaTable {
  // 找到包含"报表日期"的那个 table（Sina 不同表 id 可能冲突，按内容定位最稳）
  const tables = html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g);
  let inner: string | null = null;
  for (const m of tables) {
    if (m[1].includes('报表日期')) { inner = m[1]; break; }
  }
  if (!inner) return { dates: [], rows: new Map() };

  const trs = inner.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g);
  let dates: string[] = [];
  const rows = new Map<string, number[]>();

  for (const tr of trs) {
    const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    if (tds.length < 2) continue;

    const firstText = stripTags(tds[0]);

    if (firstText === '报表日期' || firstText.startsWith('报表日期')) {
      dates = tds.slice(1).map((c) => stripTags(c));
      continue;
    }

    if (!firstText) continue;
    // 去掉 "一、" "二、" 这类章节前缀 和 "减:" "加:" "减：" "加："（半/全角冒号）报表方向标记
    const subject = firstText
      .replace(/^[一二三四五六七八九十]+、/, '')
      .replace(/^(减|加)\s*[:：]\s*/, '')
      .replace(/^其中\s*[:：]\s*/, '')
      .trim();
    if (!subject || subject === '每股收益' || subject === '基本每股收益(元/股)' || subject === '稀释每股收益(元/股)') continue;

    const vals = tds.slice(1).map((c) => {
      const t = stripTags(c).replace(/,/g, '');
      if (!t || t === '--') return NaN;
      const n = parseFloat(t);
      return Number.isFinite(n) ? n : NaN;
    });

    // 只保留至少一个有效值的行
    if (vals.some((v) => Number.isFinite(v))) rows.set(subject, vals);
  }

  return { dates, rows };
}

function getRow(rows: Map<string, number[]>, names: string[]): number[] {
  for (const n of names) if (rows.has(n)) return rows.get(n)!;
  return [];
}

// 万元 → 亿元
function w2y(v: number | undefined | null): number {
  if (v === undefined || v === null || !Number.isFinite(v)) return 0;
  return Math.round((v / 10000) * 100) / 100;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * 从 5 年（默认）Sina HTML 中抽取并映射到本地 schema 的所有期间。
 *
 * Sina 单页返回某年的 Q4/Q3/Q2/Q1 累计 YTD 值。
 * IS / CF 是流量，需要做 YTD 差分：Q3 单期 = Q3 累计 - Q2 累计。
 * BS 是时点快照，直接用即可。
 */
export async function fetchSinaCompany(
  stockId: string,
  years: number[] = [2021, 2022, 2023, 2024, 2025],
): Promise<CompanyFinancials & { _sourceName?: string }> {
  // 并行拉 15 个页面
  const tasks: Array<Promise<[StatementType, number, SinaTable]>> = [];
  for (const stmt of ['IS', 'BS', 'CF'] as const) {
    for (const year of years) {
      const url = `${SINA_PATH[stmt]}/stockid/${stockId}/ctrl/${year}/displaytype/4.phtml`;
      tasks.push(
        fetchSinaHTML(url).then((html) => [stmt, year, parseSinaPage(html)] as const),
      );
    }
  }
  const results = await Promise.all(tasks);

  // 整理：(stmt, year) → SinaTable
  const byStmtYear = new Map<string, SinaTable>();
  for (const [stmt, year, table] of results) byStmtYear.set(`${stmt}:${year}`, table);

  // 公司名（从任一 IS 页 title 抓）
  const probeHtml = await fetchSinaHTML(
    `${SINA_PATH.IS}/stockid/${stockId}/ctrl/${years[years.length - 1]}/displaytype/4.phtml`,
  );
  const nameMatch =
    probeHtml.match(/<th[^>]*>([^<(]+)\(\d+\)\s*利润表/) ??
    probeHtml.match(/<title>([^<(]+)\(\d+\)/);
  const companyName = nameMatch ? stripTags(nameMatch[1]) : `公司${stockId}`;

  // ──────── IS / CF YTD → 单期 ────────
  function periodValuesIS(year: number, granularity: PeriodGranularity, idx?: 1 | 2 | 3 | 4) {
    const t = byStmtYear.get(`IS:${year}`);
    if (!t || t.dates.length === 0) return null;

    // Sina dates 顺序：Q4, Q3, Q2, Q1（降序）
    // 我们按时间正序取值
    const ytdAtCol = (col: number) => col; // col 0=Q4_YTD, 1=Q3_YTD, 2=Q2_YTD, 3=Q1_YTD

    const findV = (...names: string[]) => getRow(t.rows, names);

    const rev = findV('营业收入', '一、营业收入');
    const revTotal = findV('营业总收入', '一、营业总收入');
    const cogs = findV('营业成本');
    const tax = findV('营业税金及附加', '税金及附加');
    const sellingExp = findV('销售费用');
    const adminExp = findV('管理费用');
    const rd = findV('研发费用');
    const finance = findV('财务费用');
    const investInc = findV('投资收益');
    const assetImp = findV('资产减值损失');
    const creditImp = findV('信用减值损失');
    const fairVal = findV('公允价值变动收益', '公允价值变动净收益');
    const otherInc = findV('其他收益');
    const nonOpInc = findV('营业外收入', '加：营业外收入');
    const nonOpExp = findV('营业外支出', '减：营业外支出');
    const ebit = findV('营业利润', '三、营业利润');
    const ebt = findV('利润总额', '四、利润总额');
    const incTax = findV('所得税费用');
    const netInc = findV('净利润', '五、净利润');
    const niParent = findV('归属于母公司所有者的净利润', '归属于母公司股东的净利润', '归母净利润');
    const niMinority = findV('少数股东损益');
    const oci = findV('其他综合收益', '七、其他综合收益');

    // 按粒度选列
    let col: number; // Q4_YTD=0, Q3_YTD=1, Q2_YTD=2, Q1_YTD=3
    let prevCol: number | null = null; // 减去这一列得到当期单独值

    if (granularity === 'Y') { col = 0; }
    else if (granularity === 'H') {
      if (idx === 1) col = 2;          // H1 = Q2 累计
      else { col = 0; prevCol = 2; }   // H2 = Q4 - Q2
    } else {
      // Q1=3, Q2=2-3, Q3=1-2, Q4=0-1
      if (idx === 1) col = 3;
      else if (idx === 2) { col = 2; prevCol = 3; }
      else if (idx === 3) { col = 1; prevCol = 2; }
      else { col = 0; prevCol = 1; }
    }

    const val = (arr: number[]) => {
      if (arr.length <= col) return 0;
      const a = w2y(arr[col]);
      if (prevCol === null) return a;
      const b = w2y(arr[prevCol]);
      return round2(a - b);
    };

    // 映射到本地 schema items（信任 Sina 发布的 subtotal）
    const rev_main = val(rev.length ? rev : revTotal);
    const rev_total_real = val(revTotal.length ? revTotal : rev);
    const rev_other = round2(rev_total_real - rev_main);
    const cogs_main = val(cogs);
    const cogs_other = val(tax);
    const selling_exp = val(sellingExp);
    const admin_exp = val(adminExp);
    const rd_exp = val(rd);
    const da_exp = 0;
    const asset_impairment = Math.abs(val(assetImp));
    const credit_impairment = Math.abs(val(creditImp));
    const fair_value_change = val(fairVal);
    const other_op_inc = val(otherInc);
    const non_op_net = round2(val(nonOpInc) - val(nonOpExp));
    const interest_exp = val(finance);
    const interest_inc = 0; // Sina 简表不单列
    const invest_inc = val(investInc);
    const fx_gain = 0;
    const tax_exp = val(incTax);
    const oci_v = val(oci);
    const ni_parent = val(niParent);
    const ni_minority = val(niMinority);

    // Subtotals
    const rev_t = round2(rev_main + rev_other);
    const gross_profit = round2(rev_t - cogs_main - cogs_other);
    // EBIT / EBT 用 Sina 发布值更准
    const ebit_v = val(ebit) || round2(gross_profit - selling_exp - admin_exp - rd_exp - da_exp + other_op_inc + invest_inc - asset_impairment - credit_impairment + fair_value_change - interest_exp);
    const ebt_v = val(ebt) || round2(ebit_v + non_op_net);
    const net_income = val(netInc) || round2(ebt_v - tax_exp);
    const compr_inc = round2(net_income + oci_v);

    return {
      rev_main, rev_other, rev_total: rev_t,
      cogs_main, cogs_other, gross_profit,
      selling_exp, admin_exp, rd_exp, da_exp,
      asset_impairment, credit_impairment, fair_value_change, other_op_inc,
      ebit: ebit_v,
      interest_exp, interest_inc, invest_inc, fx_gain, non_op_net,
      ebt: ebt_v,
      tax_exp, ni_parent, ni_minority, net_income,
      oci: oci_v, compr_inc,
    };
  }

  function periodValuesBS(year: number, granularity: PeriodGranularity, idx?: 1 | 2 | 3 | 4) {
    const t = byStmtYear.get(`BS:${year}`);
    if (!t || t.dates.length === 0) return null;

    // BS 是时点快照：Q4=年末 Q3=Q3末 Q2=H1末 Q1=Q1末
    let col: number;
    if (granularity === 'Y') col = 0;
    else if (granularity === 'H') col = idx === 1 ? 2 : 0;
    else col = idx === 1 ? 3 : idx === 2 ? 2 : idx === 3 ? 1 : 0;

    const findV = (...names: string[]) => getRow(t.rows, names);
    const val = (arr: number[]) => (arr.length > col ? w2y(arr[col]) : 0);

    // 流动资产
    const cash = val(findV('货币资金'));
    const pledged_deposits = val(findV('结算备付金', '已抵押银行存款'));
    const st_investments = val(findV('交易性金融资产', '短期投资'));
    const notes_receivable = val(findV('应收票据'));
    const ar = val(findV('应收账款'));
    const inventory = val(findV('存货'));
    const contract_assets_cur = val(findV('合同资产'));
    const prepayments = val(findV('预付款项'));
    const income_tax_recv = val(findV('应收税款', '可收回之税项'));
    const deriv_assets_cur = val(findV('衍生金融资产'));
    const total_ca = val(findV('流动资产合计', '一、流动资产合计'));

    // 非流动资产
    const ppe = val(findV('固定资产'));
    const rou_assets = val(findV('使用权资产'));
    const cip = val(findV('在建工程'));
    const investment_property = val(findV('投资性房地产'));
    const lt_equity_inv = val(findV('长期股权投资'));
    const goodwill = val(findV('商誉'));
    const intangibles_raw = val(findV('无形资产'));
    const intangibles = intangibles_raw; // 商誉单列
    const deferred_tax_assets = val(findV('递延所得税资产'));
    const total_nca = val(findV('非流动资产合计', '二、非流动资产合计'));
    const total_assets = val(findV('资产总计'));

    // 流动负债
    const st_debt = val(findV('短期借款'));
    const lt_debt_current = val(findV('一年内到期的非流动负债'));
    const notes_payable = val(findV('应付票据'));
    const ap = val(findV('应付账款'));
    const income_tax_payable = val(findV('应交税费'));
    const contract_liab_cur = val(findV('合同负债'));
    const lease_liab_cur = val(findV('租赁负债（流动）'));
    const deriv_liab_cur = val(findV('衍生金融负债'));
    const total_cl = val(findV('流动负债合计', '一、流动负债合计'));

    // 非流动负债
    const lt_debt = val(findV('长期借款'));
    const bonds_payable = val(findV('应付债券'));
    const lease_liab_noncur = val(findV('租赁负债'));
    const deferred_tax_liab = val(findV('递延所得税负债'));
    const lt_deferred_revenue = val(findV('长期递延收益', '递延收益(非流动)'));
    const total_ncl = val(findV('非流动负债合计', '二、非流动负债合计'));
    const total_liab = val(findV('负债合计'));

    // 权益
    const share_capital = val(findV('实收资本(或股本)', '股本'));
    const capital_reserve = val(findV('资本公积'));
    const treasury_stock = val(findV('库存股', '减：库存股'));
    const other_reserves = val(findV('盈余公积', '其他综合收益累计'));
    const retained_earnings = val(findV('未分配利润'));
    const parent_equity = val(findV('归属于母公司股东权益合计', '归属于母公司所有者权益合计'));
    const minority_equity = val(findV('少数股东权益'));
    const total_equity = val(findV('所有者权益(或股东权益)合计', '股东权益合计'));
    const total_liab_equity = val(findV('负债和所有者权益(或股东权益)总计', '负债和股东权益总计'));

    // 残差归到 other_*
    const known_ca = cash + pledged_deposits + st_investments + notes_receivable + ar + inventory + contract_assets_cur + prepayments + income_tax_recv + deriv_assets_cur;
    const other_ca = Math.max(0, round2(total_ca - known_ca));
    const known_nca = ppe + rou_assets + cip + investment_property + lt_equity_inv + goodwill + intangibles + deferred_tax_assets;
    const other_nca = Math.max(0, round2(total_nca - known_nca));
    const known_cl = st_debt + lt_debt_current + notes_payable + ap + income_tax_payable + contract_liab_cur + lease_liab_cur + deriv_liab_cur;
    const other_cl = Math.max(0, round2(total_cl - known_cl));
    const known_ncl = lt_debt + bonds_payable + lease_liab_noncur + deferred_tax_liab + lt_deferred_revenue;
    const other_ncl = Math.max(0, round2(total_ncl - known_ncl));

    return {
      cash, pledged_deposits, st_investments, notes_receivable, ar, inventory,
      contract_assets_cur, prepayments, income_tax_recv, deriv_assets_cur, other_ca, total_ca,
      ppe, rou_assets, cip, investment_property, lt_equity_inv, goodwill, intangibles,
      deferred_tax_assets, other_nca, total_nca, total_assets,
      st_debt, lt_debt_current, notes_payable, ap, income_tax_payable,
      contract_liab_cur, lease_liab_cur, deriv_liab_cur, other_cl, total_cl,
      lt_debt, bonds_payable, lease_liab_noncur, deferred_tax_liab, lt_deferred_revenue, other_ncl, total_ncl, total_liab,
      share_capital, capital_reserve, treasury_stock, other_reserves, retained_earnings, parent_equity,
      minority_equity, total_equity, total_liab_equity,
    };
  }

  function periodValuesCF(year: number, granularity: PeriodGranularity, idx?: 1 | 2 | 3 | 4) {
    const t = byStmtYear.get(`CF:${year}`);
    if (!t || t.dates.length === 0) return null;

    let col: number;
    let prevCol: number | null = null;
    if (granularity === 'Y') col = 0;
    else if (granularity === 'H') {
      if (idx === 1) col = 2;
      else { col = 0; prevCol = 2; }
    } else {
      if (idx === 1) col = 3;
      else if (idx === 2) { col = 2; prevCol = 3; }
      else if (idx === 3) { col = 1; prevCol = 2; }
      else { col = 0; prevCol = 1; }
    }

    const findV = (...names: string[]) => getRow(t.rows, names);
    const val = (arr: number[]) => {
      if (arr.length <= col) return 0;
      const a = w2y(arr[col]);
      if (prevCol === null) return a;
      const b = w2y(arr[prevCol]);
      return round2(a - b);
    };

    // ─ 经营（细分）─
    const cash_from_sales = val(findV('销售商品、提供劳务收到的现金'));
    const tax_refund = val(findV('收到的税费返还'));
    const other_op_cf_in = val(findV('收到其他与经营活动有关的现金'));
    const cash_to_suppliers = val(findV('购买商品、接受劳务支付的现金'));
    const cash_to_employees = val(findV('支付给职工以及为职工支付的现金', '支付给职工的现金'));
    const cash_for_taxes = val(findV('支付的各项税费'));
    const other_op_cf_out = val(findV('支付其他与经营活动有关的现金'));
    const op_cf_in = val(findV('经营活动现金流入小计', '经营活动现金流入'));
    const op_cf_out = val(findV('经营活动现金流出小计', '经营活动现金流出'));
    const fx_effect_on_cash = val(findV('汇率变动对现金及现金等价物的影响', '汇率变动对现金的影响'));

    // ─ 投资（拆：金融 vs 实业）─
    // 流入：金融 = 收回投资 + 取得投资收益；实业 = 处置 PPE / 处置子公司
    const inv_in_fin_raw = round2(
      val(findV('收回投资所收到的现金', '收回投资收到的现金', '收回投资')) +
      val(findV('取得投资收益所收到的现金', '取得投资收益收到的现金')),
    );
    const inv_in_real_raw = round2(
      val(findV('处置固定资产、无形资产和其他长期资产所收回的现金净额', '处置固定资产、无形资产和其他长期资产收回的现金净额', '处置固定资产')) +
      val(findV('处置子公司及其他营业单位收到的现金净额', '处置子公司收到的现金净额')),
    );
    // 流出：金融 = 投资支付 + 并购支付；实业 = 购建 PPE Capex
    const inv_out_fin_raw = round2(
      val(findV('投资所支付的现金', '投资支付的现金')) +
      val(findV('取得子公司及其他营业单位所支付的现金净额', '取得子公司支付的现金净额')),
    );
    const inv_out_real_raw = round2(
      val(findV('购建固定资产、无形资产和其他长期资产所支付的现金', '购建固定资产、无形资产和其他长期资产支付的现金', '购建固定资产支付的现金')),
    );
    // 兜底：若细项没找到全，用 Sina 的小计填到任一桶（这里放到金融桶）
    const inv_in_total_sina = val(findV('投资活动现金流入小计', '投资活动现金流入'));
    const inv_out_total_sina = val(findV('投资活动现金流出小计', '投资活动现金流出'));
    const inv_cf_in_fin = inv_in_fin_raw || (inv_in_total_sina - inv_in_real_raw);
    const inv_cf_in_real = inv_in_real_raw;
    const inv_cf_out_fin = inv_out_fin_raw || (inv_out_total_sina - inv_out_real_raw);
    const inv_cf_out_real = inv_out_real_raw;
    const inv_cf_in = round2(inv_cf_in_fin + inv_cf_in_real);
    const inv_cf_out = round2(inv_cf_out_fin + inv_cf_out_real);

    // ─ 筹资（拆：还债 vs 分红）─
    const fin_cf_in_equity = val(findV('吸收投资收到的现金', '吸收投资所收到的现金'));
    const fin_cf_in_debt = round2(
      val(findV('取得借款收到的现金', '取得借款所收到的现金')) +
      val(findV('发行债券收到的现金', '发行债券所收到的现金')),
    );
    const fin_cf_out_debt = val(findV('偿还债务支付的现金', '偿还债务所支付的现金'));
    const fin_cf_out_div = val(findV('分配股利、利润或偿付利息支付的现金', '分配股利、利润或偿付利息所支付的现金'));
    const fin_cf_in_total_sina = val(findV('筹资活动现金流入小计', '筹资活动现金流入'));
    const fin_cf_out_total_sina = val(findV('筹资活动现金流出小计', '筹资活动现金流出'));
    // 兜底用 Sina 小计补差额到债务桶
    const fin_in_other = round2(Math.max(0, fin_cf_in_total_sina - fin_cf_in_equity - fin_cf_in_debt));
    const fin_out_other = round2(Math.max(0, fin_cf_out_total_sina - fin_cf_out_debt - fin_cf_out_div));
    const fin_cf_in_debt_v = round2(fin_cf_in_debt + fin_in_other);
    const fin_cf_out_div_v = round2(fin_cf_out_div + fin_out_other);
    const fin_cf_in = round2(fin_cf_in_equity + fin_cf_in_debt_v);
    const fin_cf_out = round2(fin_cf_out_debt + fin_cf_out_div_v);

    const net_op_cf = round2(op_cf_in - op_cf_out);
    const net_inv_cf = round2(inv_cf_in - inv_cf_out);
    const net_fin_cf = round2(fin_cf_in - fin_cf_out);
    const net_change_cash = round2(net_op_cf + net_inv_cf + net_fin_cf);

    // A 股 sina HTML 主表是 direct method，跟项目 CFA indirect schema 不对齐：
    // - CFO 明细字段（销售收现 / 付供应商 / 付职工等 direct 项）→ schema 不要，全部丢弃，只保留净额
    // - tax_paid 是同语义（已付各项税费 ≈ income taxes paid，符号取负 outflow）
    // - CFI / CFF 主表净额对得上；细分桶语义跟 indirect 不完全等价，保守留 null
    // - 完整 indirect 明细需另抓"现金流量表补充资料"（净利润调节为 CFO 对账）
    const tax_paid = cash_for_taxes ? -Math.abs(cash_for_taxes) : null;
    const interest_paid = fin_cf_out_div ? null : null; // sina 把利息混在分红里，无法拆分
    const capex = inv_cf_out_real ? -Math.abs(inv_cf_out_real) : null;
    const disposal_ppe = inv_cf_in_real ? Math.abs(inv_cf_in_real) : null;
    const purchase_investments = inv_cf_out_fin ? -Math.abs(inv_cf_out_fin) : null;
    const sale_investments = inv_cf_in_fin ? Math.abs(inv_cf_in_fin) : null;
    const debt_issued_v = fin_cf_in_debt_v ? Math.abs(fin_cf_in_debt_v) : null;
    const debt_repaid_v = fin_cf_out_debt ? -Math.abs(fin_cf_out_debt) : null;
    const equity_issued_v = fin_cf_in_equity ? Math.abs(fin_cf_in_equity) : null;
    const dividends_total = fin_cf_out_div_v ? -Math.abs(fin_cf_out_div_v) : null;

    return {
      // CFO Indirect — A 股主表是 direct，indirect 明细全留 null（除 tax_paid）
      ebt_for_cf: null, da_cfo: null, impairment_cfo: null, sbc_cfo: null, other_non_cash: null,
      chg_receivables: null, chg_inventory: null, chg_payables: null, chg_other_wc: null,
      interest_paid, tax_paid,
      net_op_cf,
      // CFI
      capex, disposal_ppe,
      acquisitions: null, divestitures: null,
      purchase_investments, sale_investments,
      interest_dividends_received: null, other_investing: null,
      net_inv_cf,
      // CFF
      debt_issued: debt_issued_v, debt_repaid: debt_repaid_v,
      equity_issued: equity_issued_v, equity_repurchased: null,
      // sina "分配股利、利润或偿付利息支付的现金" 混合了股息和利息，无法拆——归到 dividends_to_shareholders 但标语义混合
      dividends_to_shareholders: dividends_total,
      dividends_to_nci: null, lease_principal_paid: null, other_financing: null,
      net_fin_cf,
      // 净增加 / 期末
      fx_effect_on_cash,
      net_change_cash,
      beg_cash: null as number | null,
      end_cash: null as number | null,
    };
  }

  // ──────── 组装 17 期 ────────
  const PERIODS: PeriodKey[] = [
    ...years.map((y) => ({ year: y, granularity: 'Y' as const })),
    { year: 2024, granularity: 'H', index: 1 as const },
    { year: 2024, granularity: 'H', index: 2 as const },
    { year: 2025, granularity: 'H', index: 1 as const },
    { year: 2025, granularity: 'H', index: 2 as const },
    ...([1, 2, 3, 4] as const).map((i) => ({ year: 2024, granularity: 'Q' as const, index: i })),
    ...([1, 2, 3, 4] as const).map((i) => ({ year: 2025, granularity: 'Q' as const, index: i })),
  ];

  const isPeriods = PERIODS.map((p) => ({
    period: p,
    values: (periodValuesIS(p.year, p.granularity, p.index) as Record<string, number | null>) ?? {},
  }));
  const bsPeriods = PERIODS.map((p) => ({
    period: p,
    values: (periodValuesBS(p.year, p.granularity, p.index) as Record<string, number | null>) ?? {},
  }));
  const cfPeriodsRaw = PERIODS.map((p) => ({
    period: p,
    values: (periodValuesCF(p.year, p.granularity, p.index) as Record<string, number | null>) ?? {},
  }));

  // 链 CF 期初 / 期末（按粒度分别链；用 BS 现金作起点）
  const periodSortVal = (p: PeriodKey) => {
    const off = p.granularity === 'H' ? (p.index ?? 0) * 2 : p.granularity === 'Q' ? (p.index ?? 0) : 4;
    return p.year * 10 + off;
  };

  const cfByGran: Record<string, typeof cfPeriodsRaw> = { Y: [], H: [], Q: [] };
  for (const p of cfPeriodsRaw) cfByGran[p.period.granularity].push(p);
  for (const g of ['Y', 'H', 'Q']) cfByGran[g].sort((a, b) => periodSortVal(a.period) - periodSortVal(b.period));

  const cfChained: typeof cfPeriodsRaw = [];
  for (const g of ['Y', 'H', 'Q']) {
    const list = cfByGran[g];
    if (!list.length) continue;
    // 起点：用最早期 BS 现金对应值
    const first = list[0].period;
    const bs = bsPeriods.find(
      (b) => b.period.year === first.year && b.period.granularity === first.granularity && b.period.index === first.index,
    );
    let prev = (bs?.values.cash as number) ?? 0;
    // 起点 = 期末 - 单期净变动 = 当期期初
    prev = round2(prev - ((list[0].values.net_change_cash as number) ?? 0));
    for (const p of list) {
      const v = { ...p.values } as Record<string, number>;
      v.beg_cash = round2(prev);
      v.end_cash = round2(v.beg_cash + (v.net_change_cash ?? 0));
      prev = v.end_cash;
      cfChained.push({ period: p.period, values: v });
    }
  }

  isPeriods.sort((a, b) => periodSortVal(a.period) - periodSortVal(b.period));
  bsPeriods.sort((a, b) => periodSortVal(a.period) - periodSortVal(b.period));
  cfChained.sort((a, b) => periodSortVal(a.period) - periodSortVal(b.period));

  return {
    ticker: stockId,
    name: companyName,
    industry: '—',
    market: 'A',
    currency: 'CNY',
    unit: 'yi',
    accountingStandard: 'CAS',
    statements: {
      IS: { periods: isPeriods },
      BS: { periods: bsPeriods },
      CF: { periods: cfChained },
    },
    _sourceName: 'Sina · money.finance.sina.com.cn',
  } as CompanyFinancials & { _sourceName?: string };
}
