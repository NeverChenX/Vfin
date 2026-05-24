import type { StatementSchema } from '@/types/finance';

// ════════════════════════════════════════════════════════════════
// IS · 利润表（流水从上到下：收入 → 成本 → 利润）
// ════════════════════════════════════════════════════════════════
export const IS_SCHEMA: StatementSchema = {
  id: 'IS',
  zhName: '利润表',
  cfaName: 'Income Statement',
  subjects: [
    // ─── ① 收入 ───
    { id: 'rev_total',          zh: '一、总营收合计',         cfa: 'Total Revenue',    cfaFull: 'Total Revenue',                          level: 0, kind: 'subtotal', sign: 'neutral', formula: 'rev_main + rev_other' },
    { id: 'rev_main',           zh: '主营业务营收',           cfa: 'Revenue',          cfaFull: 'Main Business Revenue',                  level: 2, kind: 'item',     sign: 'add' },
    { id: 'rev_other',          zh: '其他业务收益',           cfa: 'Other Op. Inc.',   cfaFull: 'Other Operating Income',                 level: 2, kind: 'item',     sign: 'add' },

    // ─── ② 毛利 ───
    { id: 'gross_profit',       zh: '二、毛利润',             cfa: 'Gross Profit',     cfaFull: 'Gross Profit',                           level: 0, kind: 'subtotal', sign: 'neutral', formula: 'rev_total - cogs_main - cogs_other' },
    { id: 'cogs_main',          zh: '主营业务成本',           cfa: 'COGS',             cfaFull: 'Main Business Cost of Goods Sold',       level: 2, kind: 'item',     sign: 'sub' },
    { id: 'cogs_other',         zh: '其他业务成本',           cfa: 'Other COGS',       cfaFull: 'Other Operating Costs',                  level: 2, kind: 'item',     sign: 'sub' },

    // ─── ③ 营业利润 (EBIT) ───
    // 反算法：EBIT = EBT + 净利息费用 - 投资收益 - 汇兑 - 营业外（最稳，因 EBT 总有）
    { id: 'ebit',               zh: '三、营业利润',           cfa: 'EBIT',             cfaFull: 'Earnings Before Interest & Tax',         level: 0, kind: 'subtotal', sign: 'neutral', formula: 'ebt + interest_exp - interest_inc - invest_inc - fx_gain - non_op_net' },
    { id: 'selling_exp',        zh: '销售费用',               cfa: 'Selling Exp.',     cfaFull: 'Selling & Marketing Expenses',           level: 2, kind: 'item',     sign: 'sub' },
    { id: 'admin_exp',          zh: '管理费用',               cfa: 'Admin Exp.',       cfaFull: 'General & Administrative Expenses',      level: 2, kind: 'item',     sign: 'sub' },
    { id: 'rd_exp',             zh: '研发费用',               cfa: 'R&D',              cfaFull: 'Research & Development',                  level: 2, kind: 'item',     sign: 'sub' },
    { id: 'da_exp',             zh: '折旧摊销',               cfa: 'D&A',              cfaFull: 'Depreciation & Amortization',            level: 2, kind: 'item',     sign: 'sub' },
    { id: 'asset_impairment',   zh: '资产减值损失',           cfa: 'Asset Imp.',       cfaFull: 'Asset Impairment Loss',                  level: 2, kind: 'item',     sign: 'sub' },
    { id: 'credit_impairment',  zh: '信用减值损失',           cfa: 'Credit Imp.',      cfaFull: 'Credit Impairment Loss',                 level: 2, kind: 'item',     sign: 'sub' },
    { id: 'fair_value_change',  zh: '公允价值变动收益',       cfa: 'Fair Value Δ',     cfaFull: 'Fair Value Change Gain / (Loss)',        level: 2, kind: 'item',     sign: 'add' },
    { id: 'other_op_inc',       zh: '其他收益',               cfa: 'Other Op. Gains',  cfaFull: 'Other Operating Gains',                  level: 2, kind: 'item',     sign: 'add' },

    // ─── ④ 税前利润 (EBT) ───
    { id: 'ebt',                zh: '四、利润总额',           cfa: 'EBT',              cfaFull: 'Earnings Before Tax',                    level: 0, kind: 'subtotal', sign: 'neutral', formula: 'net_income + tax_exp' },
    { id: 'interest_exp',       zh: '利息费用',               cfa: 'Interest Exp.',    cfaFull: 'Interest Expense',                       level: 2, kind: 'item',     sign: 'sub' },
    { id: 'interest_inc',       zh: '利息收入',               cfa: 'Interest Inc.',    cfaFull: 'Interest Income',                        level: 2, kind: 'item',     sign: 'add' },
    { id: 'invest_inc',         zh: '投资收益',               cfa: 'Investment Inc.',  cfaFull: 'Investment Income (Associates / JV)',    level: 2, kind: 'item',     sign: 'add' },
    { id: 'fx_gain',            zh: '汇兑收益',               cfa: 'FX Gain',          cfaFull: 'Foreign Exchange Gain / (Loss)',         level: 2, kind: 'item',     sign: 'add' },
    { id: 'non_op_net',         zh: '营业外收支净额',         cfa: 'Non-Op. Net',      cfaFull: 'Non-Operating Net Income',               level: 2, kind: 'item',     sign: 'add' },

    // ─── ⑤ 净利润 ───
    { id: 'net_income',         zh: '五、净利润',             cfa: 'Net Income',       cfaFull: 'Net Income',                             level: 0, kind: 'subtotal', sign: 'neutral', formula: 'ebt - tax_exp' },
    { id: 'tax_exp',            zh: '所得税',                 cfa: 'Income Tax',       cfaFull: 'Income Tax Expense',                     level: 2, kind: 'item',     sign: 'sub' },
    { id: 'ni_parent',          zh: '归母净利润',             cfa: 'NI to Parent',     cfaFull: 'Net Income Attributable to Parent',      level: 2, kind: 'item',     sign: 'neutral' },
    { id: 'ni_minority',        zh: '少数股东损益',           cfa: 'NCI',              cfaFull: 'Non-Controlling Interest',               level: 2, kind: 'item',     sign: 'neutral' },

    // ─── ⑥ 综合收益 ───
    { id: 'compr_inc',          zh: '六、综合收益总额',       cfa: 'Compr. Income',    cfaFull: 'Total Comprehensive Income',             level: 0, kind: 'total',    sign: 'neutral', formula: 'net_income + oci' },
    { id: 'oci',                zh: '其他综合收益',           cfa: 'OCI',              cfaFull: 'Other Comprehensive Income',             level: 2, kind: 'item',     sign: 'add' },
  ],
};

// ════════════════════════════════════════════════════════════════
// BS · 资产负债表（总→分→明细 三层：一资产 → 二负债 → 三所有者权益）
// ════════════════════════════════════════════════════════════════
export const BS_SCHEMA: StatementSchema = {
  id: 'BS',
  zhName: '资产负债表',
  cfaName: 'Balance Sheet',
  subjects: [
    // ═══ 一、资产 ═══
    { id: 'total_assets',           zh: '一、资产总计',                  cfa: 'Total Assets',           cfaFull: 'Total Assets',                              level: 0, kind: 'total',    sign: 'neutral', formula: 'total_ca + total_nca' },

    // ─── 流动资产 ───
    { id: 'total_ca',               zh: '流动资产合计',                  cfa: 'Total CA',               cfaFull: 'Total Current Assets',                      level: 1, kind: 'subtotal', sign: 'neutral' },
    { id: 'cash',                   zh: '货币资金',                      cfa: 'Cash',                   cfaFull: 'Cash & Equivalents',                        level: 2, kind: 'item',     sign: 'add' },
    { id: 'pledged_deposits',       zh: '已抵押银行存款（流动）',        cfa: 'Pledged Deposits',       cfaFull: 'Pledged Bank Deposits (Current)',           level: 2, kind: 'item',     sign: 'add' },
    { id: 'st_investments',         zh: '短期投资',                      cfa: 'ST Investments',         cfaFull: 'Short-term Investments',                    level: 2, kind: 'item',     sign: 'add' },
    { id: 'notes_receivable',       zh: '应收票据',                      cfa: 'Notes Receivable',       cfaFull: 'Notes Receivable',                          level: 2, kind: 'item',     sign: 'add' },
    { id: 'ar',                     zh: '应收账款',                      cfa: 'AR',                     cfaFull: 'Accounts Receivable',                       level: 2, kind: 'item',     sign: 'add' },
    { id: 'inventory',              zh: '存货',                          cfa: 'Inventory',              cfaFull: 'Inventory',                                 level: 2, kind: 'item',     sign: 'add' },
    { id: 'contract_assets_cur',    zh: '合同资产（流动）',              cfa: 'Contract Assets',        cfaFull: 'Contract Assets (Current)',                 level: 2, kind: 'item',     sign: 'add' },
    { id: 'prepayments',            zh: '预付款项及其他应收款',          cfa: 'Prepayments',            cfaFull: 'Prepayments, Deposits & Other Receivables', level: 2, kind: 'item',     sign: 'add' },
    { id: 'income_tax_recv',        zh: '可收回之税项',                  cfa: 'Income Tax Recv.',       cfaFull: 'Income Tax Receivable',                     level: 2, kind: 'item',     sign: 'add' },
    { id: 'deriv_assets_cur',       zh: '衍生金融资产（流动）',          cfa: 'Deriv. Assets',          cfaFull: 'Derivative Financial Assets (Current)',     level: 2, kind: 'item',     sign: 'add' },
    { id: 'other_ca',               zh: '其他流动资产',                  cfa: 'Other CA',               cfaFull: 'Other Current Assets',                      level: 2, kind: 'item',     sign: 'add' },

    // ─── 非流动资产 ───
    { id: 'total_nca',              zh: '非流动资产合计',                cfa: 'Total NCA',              cfaFull: 'Total Non-Current Assets',                  level: 1, kind: 'subtotal', sign: 'neutral' },
    { id: 'ppe',                    zh: '固定资产',                      cfa: 'PP&E',                   cfaFull: 'Property, Plant & Equipment',               level: 2, kind: 'item',     sign: 'add' },
    { id: 'rou_assets',             zh: '使用权资产',                    cfa: 'ROU',                    cfaFull: 'Right-of-Use Assets',                       level: 2, kind: 'item',     sign: 'add' },
    { id: 'cip',                    zh: '在建工程',                      cfa: 'CIP',                    cfaFull: 'Construction in Progress',                  level: 2, kind: 'item',     sign: 'add' },
    { id: 'investment_property',    zh: '投资性房地产',                  cfa: 'Inv. Property',          cfaFull: 'Investment Property',                       level: 2, kind: 'item',     sign: 'add' },
    { id: 'lt_equity_inv',          zh: '长期股权投资',                  cfa: 'LT Equity Inv.',         cfaFull: 'Long-term Equity Investments',              level: 2, kind: 'item',     sign: 'add' },
    { id: 'goodwill',               zh: '商誉',                          cfa: 'Goodwill',               cfaFull: 'Goodwill',                                  level: 2, kind: 'item',     sign: 'add' },
    { id: 'intangibles',            zh: '无形资产',                      cfa: 'Intangibles',            cfaFull: 'Intangible Assets',                         level: 2, kind: 'item',     sign: 'add' },
    { id: 'deferred_tax_assets',    zh: '递延所得税资产',                cfa: 'DTA',                    cfaFull: 'Deferred Tax Assets',                       level: 2, kind: 'item',     sign: 'add' },
    { id: 'other_nca',              zh: '其他非流动资产',                cfa: 'Other NCA',              cfaFull: 'Other Non-Current Assets',                  level: 2, kind: 'item',     sign: 'add' },

    // ═══ 二、负债 ═══
    { id: 'total_liab',             zh: '二、负债合计',                  cfa: 'Total Liab.',            cfaFull: 'Total Liabilities',                         level: 0, kind: 'subtotal', sign: 'neutral', formula: 'total_cl + total_ncl' },

    // ─── 流动负债 ───
    { id: 'total_cl',               zh: '流动负债合计',                  cfa: 'Total CL',               cfaFull: 'Total Current Liabilities',                 level: 1, kind: 'subtotal', sign: 'neutral' },
    { id: 'st_debt',                zh: '短期借款',                      cfa: 'ST Debt',                cfaFull: 'Short-term Borrowings',                     level: 2, kind: 'item',     sign: 'sub' },
    { id: 'lt_debt_current',        zh: '一年内到期的非流动负债',        cfa: 'LT Debt (Current)',      cfaFull: 'Current Portion of Long-term Debt',         level: 2, kind: 'item',     sign: 'sub' },
    { id: 'notes_payable',          zh: '应付票据',                      cfa: 'Notes Payable',          cfaFull: 'Notes Payable',                             level: 2, kind: 'item',     sign: 'sub' },
    { id: 'ap',                     zh: '应付账款',                      cfa: 'AP',                     cfaFull: 'Accounts Payable',                          level: 2, kind: 'item',     sign: 'sub' },
    { id: 'income_tax_payable',     zh: '应交税费',                      cfa: 'Income Tax Payable',     cfaFull: 'Income Tax Payable',                        level: 2, kind: 'item',     sign: 'sub' },
    { id: 'contract_liab_cur',      zh: '合同负债（流动）',              cfa: 'Contract Liab.',         cfaFull: 'Contract Liabilities (Current)',            level: 2, kind: 'item',     sign: 'sub' },
    { id: 'lease_liab_cur',         zh: '租赁负债（流动）',              cfa: 'Lease Liab. Cur.',       cfaFull: 'Lease Liabilities (Current)',               level: 2, kind: 'item',     sign: 'sub' },
    { id: 'deriv_liab_cur',         zh: '衍生金融负债（流动）',          cfa: 'Deriv. Liab.',           cfaFull: 'Derivative Financial Liabilities (Current)', level: 2, kind: 'item',     sign: 'sub' },
    { id: 'other_cl',               zh: '其他流动负债',                  cfa: 'Other CL',               cfaFull: 'Other Current Liabilities',                 level: 2, kind: 'item',     sign: 'sub' },

    // ─── 非流动负债 ───
    { id: 'total_ncl',              zh: '非流动负债合计',                cfa: 'Total NCL',              cfaFull: 'Total Non-Current Liabilities',             level: 1, kind: 'subtotal', sign: 'neutral' },
    { id: 'lt_debt',                zh: '长期借款',                      cfa: 'LT Debt',                cfaFull: 'Long-term Borrowings',                      level: 2, kind: 'item',     sign: 'sub' },
    { id: 'bonds_payable',          zh: '应付债券',                      cfa: 'Bonds Payable',          cfaFull: 'Bonds Payable',                             level: 2, kind: 'item',     sign: 'sub' },
    { id: 'lease_liab_noncur',      zh: '租赁负债（非流动）',            cfa: 'Lease Liab. NC',         cfaFull: 'Lease Liabilities (Non-Current)',           level: 2, kind: 'item',     sign: 'sub' },
    { id: 'deferred_tax_liab',      zh: '递延所得税负债',                cfa: 'DTL',                    cfaFull: 'Deferred Tax Liabilities',                  level: 2, kind: 'item',     sign: 'sub' },
    { id: 'lt_deferred_revenue',    zh: '长期递延收益',                  cfa: 'LT Deferred Rev.',       cfaFull: 'Long-term Deferred Revenue',                level: 2, kind: 'item',     sign: 'sub' },
    { id: 'other_ncl',              zh: '其他非流动负债',                cfa: 'Other NCL',              cfaFull: 'Other Non-Current Liabilities',             level: 2, kind: 'item',     sign: 'sub' },

    // ═══ 三、所有者权益 ═══
    { id: 'total_equity',           zh: '三、所有者权益合计',            cfa: 'Total Equity',           cfaFull: 'Total Equity',                              level: 0, kind: 'subtotal', sign: 'neutral', formula: 'parent_equity + minority_equity' },

    { id: 'parent_equity',          zh: '归母股东权益',                  cfa: 'Parent Equity',          cfaFull: 'Equity Attributable to Parent',             level: 1, kind: 'subtotal', sign: 'neutral' },
    { id: 'share_capital',          zh: '股本',                          cfa: 'Share Capital',          cfaFull: 'Share Capital',                             level: 2, kind: 'item',     sign: 'add' },
    { id: 'capital_reserve',        zh: '资本公积',                      cfa: 'Capital Reserve',        cfaFull: 'Capital Reserve / Share Premium',           level: 2, kind: 'item',     sign: 'add' },
    { id: 'treasury_stock',         zh: '减：库存股',                    cfa: 'Treasury Stock',         cfaFull: 'Treasury Stock',                            level: 2, kind: 'item',     sign: 'sub' },
    { id: 'other_reserves',         zh: '其他储备',                      cfa: 'Other Reserves',         cfaFull: 'Other Reserves (FX / OCI)',                 level: 2, kind: 'item',     sign: 'add' },
    { id: 'retained_earnings',      zh: '未分配利润',                    cfa: 'Retained Earnings',      cfaFull: 'Retained Earnings',                         level: 2, kind: 'item',     sign: 'add' },

    { id: 'minority_equity',        zh: '少数股东权益',                  cfa: 'Minority Equity',        cfaFull: 'Non-Controlling Interest',                  level: 1, kind: 'item',     sign: 'add' },

    // ═══ 校验 ═══
    { id: 'total_liab_equity',      zh: '负债和所有者权益总计',          cfa: 'Total L&E',              cfaFull: 'Total Liabilities & Equity',                level: 0, kind: 'total',    sign: 'neutral', formula: 'total_liab + total_equity' },
  ],
};

// ════════════════════════════════════════════════════════════════
// CF · 现金流量表（经营 → 投资 → 筹资 → 期初/期末）
// ════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════
// CF · 现金流量表（CFA / IFRS Indirect Method）
//   CFO 从 EBT/Profit before tax 出发，逐项调整非现金项与营运资金变动
//   CFI 列 Capex / Disposals / Acquisitions / Investments / 收息收股
//   CFF 列 Debt / Equity / Dividends / Lease principal (IFRS 16)
//   适用：IFRS 口径（港股、欧股）、US GAAP（美股）。A 股原 direct method 在此口径下相关字段留空。
// ════════════════════════════════════════════════════════════════
export const CF_SCHEMA: StatementSchema = {
  id: 'CF',
  zhName: '现金流量表',
  cfaName: 'Cash Flow Statement (Indirect Method)',
  subjects: [
    // ═══ 一、经营活动现金流量（CFO，Indirect Method）═══
    { id: 'net_op_cf',                   zh: '一、经营活动现金流量净额',   cfa: 'Net CFO',                  cfaFull: 'Net Cash from Operating Activities',                level: 0, kind: 'subtotal', sign: 'neutral' },

    // ─── 非现金调整 ───
    { id: 'ebt_for_cf',                  zh: '税前利润（起算）',           cfa: 'Profit before tax',        cfaFull: 'Profit before Tax (CFO Starting Point)',            level: 2, kind: 'item',     sign: 'add' },
    { id: 'da_cfo',                      zh: '折旧与摊销（D&A）',          cfa: 'D&A',                      cfaFull: 'Depreciation & Amortization',                       level: 2, kind: 'item',     sign: 'add' },
    { id: 'impairment_cfo',              zh: '资产/信用减值损失',          cfa: 'Impairment',               cfaFull: 'Asset & Credit Impairment Charges',                 level: 2, kind: 'item',     sign: 'add' },
    { id: 'sbc_cfo',                     zh: '股份支付费用',               cfa: 'SBC',                      cfaFull: 'Share-Based Compensation',                          level: 2, kind: 'item',     sign: 'add' },
    { id: 'other_non_cash',              zh: '其他非现金调整',             cfa: 'Other Non-Cash',           cfaFull: 'Other Non-Cash Adjustments (FV / FX / disposal G&L)',level: 2, kind: 'item',     sign: 'add' },

    // ─── 营运资金变动 ───
    { id: 'chg_receivables',             zh: '应收款项变动',               cfa: 'Δ Receivables',            cfaFull: 'Change in Trade Receivables',                       level: 2, kind: 'item',     sign: 'add' },
    { id: 'chg_inventory',               zh: '存货变动',                   cfa: 'Δ Inventory',              cfaFull: 'Change in Inventory',                               level: 2, kind: 'item',     sign: 'add' },
    { id: 'chg_payables',                zh: '应付款项变动',               cfa: 'Δ Payables',               cfaFull: 'Change in Trade Payables',                          level: 2, kind: 'item',     sign: 'add' },
    { id: 'chg_other_wc',                zh: '其他营运资金变动',           cfa: 'Δ Other WC',               cfaFull: 'Change in Other Working Capital',                   level: 2, kind: 'item',     sign: 'add' },

    // ─── 现金利息与税 ───
    { id: 'interest_paid',               zh: '已付利息',                   cfa: 'Interest Paid',            cfaFull: 'Interest Paid (CFO; IFRS option)',                  level: 2, kind: 'item',     sign: 'sub' },
    { id: 'tax_paid',                    zh: '已付所得税',                 cfa: 'Tax Paid',                 cfaFull: 'Income Tax Paid',                                   level: 2, kind: 'item',     sign: 'sub' },

    // ═══ 二、投资活动现金流量（CFI）═══
    { id: 'net_inv_cf',                  zh: '二、投资活动现金流量净额',   cfa: 'Net CFI',                  cfaFull: 'Net Cash from Investing Activities',                level: 0, kind: 'subtotal', sign: 'neutral' },
    { id: 'capex',                       zh: '资本性支出（Capex）',        cfa: 'Capex',                    cfaFull: 'Capital Expenditure (PP&E + Intangibles)',          level: 2, kind: 'item',     sign: 'sub' },
    { id: 'disposal_ppe',                zh: '处置固定资产所得',           cfa: 'Disposal PP&E',            cfaFull: 'Proceeds from Disposal of PP&E',                    level: 2, kind: 'item',     sign: 'add' },
    { id: 'acquisitions',                zh: '收购子公司净流出',           cfa: 'Acquisitions',             cfaFull: 'Acquisition of Subsidiaries / Businesses (net)',    level: 2, kind: 'item',     sign: 'sub' },
    { id: 'divestitures',                zh: '出售子公司净流入',           cfa: 'Divestitures',             cfaFull: 'Disposal of Subsidiaries / Businesses (net)',       level: 2, kind: 'item',     sign: 'add' },
    { id: 'purchase_investments',        zh: '购买投资品',                 cfa: 'Buy Investments',          cfaFull: 'Purchase of Investments / Securities',              level: 2, kind: 'item',     sign: 'sub' },
    { id: 'sale_investments',            zh: '处置投资品',                 cfa: 'Sell Investments',         cfaFull: 'Sale / Maturity of Investments',                    level: 2, kind: 'item',     sign: 'add' },
    { id: 'interest_dividends_received', zh: '已收利息及股息',             cfa: 'Int. & Div. Recv.',        cfaFull: 'Interest & Dividends Received (CFI)',               level: 2, kind: 'item',     sign: 'add' },
    { id: 'other_investing',             zh: '其他投资活动',               cfa: 'Other Investing',          cfaFull: 'Other Investing Activities',                        level: 2, kind: 'item',     sign: 'add' },

    // ═══ 三、筹资活动现金流量（CFF）═══
    { id: 'net_fin_cf',                  zh: '三、筹资活动现金流量净额',   cfa: 'Net CFF',                  cfaFull: 'Net Cash from Financing Activities',                level: 0, kind: 'subtotal', sign: 'neutral' },
    { id: 'debt_issued',                 zh: '债务融资所得',               cfa: 'Debt Issued',              cfaFull: 'Proceeds from Borrowings / Bond Issuance',          level: 2, kind: 'item',     sign: 'add' },
    { id: 'debt_repaid',                 zh: '偿还债务',                   cfa: 'Debt Repaid',              cfaFull: 'Repayment of Borrowings / Bonds',                   level: 2, kind: 'item',     sign: 'sub' },
    { id: 'equity_issued',               zh: '股权融资所得',               cfa: 'Equity Issued',            cfaFull: 'Proceeds from Equity Issuance',                     level: 2, kind: 'item',     sign: 'add' },
    { id: 'equity_repurchased',          zh: '回购股权',                   cfa: 'Buyback',                  cfaFull: 'Share Repurchase',                                  level: 2, kind: 'item',     sign: 'sub' },
    { id: 'dividends_to_shareholders',   zh: '已付股东股息',               cfa: 'Dividends',                cfaFull: 'Dividends Paid to Shareholders',                    level: 2, kind: 'item',     sign: 'sub' },
    { id: 'dividends_to_nci',            zh: '已付少数股东股息',           cfa: 'Dividends NCI',            cfaFull: 'Dividends Paid to Non-Controlling Interests',       level: 2, kind: 'item',     sign: 'sub' },
    { id: 'lease_principal_paid',        zh: '租赁负债本金偿还',           cfa: 'Lease Principal',          cfaFull: 'Lease Principal Payments (IFRS 16)',                level: 2, kind: 'item',     sign: 'sub' },
    { id: 'other_financing',             zh: '其他筹资活动',               cfa: 'Other Financing',          cfaFull: 'Other Financing Activities',                        level: 2, kind: 'item',     sign: 'add' },

    // ═══ 四、净增加 ═══
    { id: 'net_change_cash',             zh: '四、现金及现金等价物净增加', cfa: 'Net Δ Cash',               cfaFull: 'Net Change in Cash (excl. FX)',                     level: 0, kind: 'subtotal', sign: 'neutral', formula: 'net_op_cf + net_inv_cf + net_fin_cf' },
    { id: 'fx_effect_on_cash',           zh: '汇率变动对现金的影响',       cfa: 'FX Effect',                cfaFull: 'Effect of FX Changes on Cash',                      level: 2, kind: 'item',     sign: 'add' },

    // ═══ 五、期末余额 ═══
    { id: 'end_cash',                    zh: '五、期末现金及等价物余额',   cfa: 'End Cash',                 cfaFull: 'Ending Cash Balance',                               level: 0, kind: 'total',    sign: 'neutral', formula: 'beg_cash + net_change_cash + fx_effect_on_cash' },
    { id: 'beg_cash',                    zh: '期初现金及等价物余额',       cfa: 'Beg. Cash',                cfaFull: 'Beginning Cash Balance',                            level: 2, kind: 'item',     sign: 'neutral' },
  ],
};

export const STATEMENT_SCHEMAS = {
  IS: IS_SCHEMA,
  BS: BS_SCHEMA,
  CF: CF_SCHEMA,
} as const;
