/**
 * 申万一级行业指数 31 个。
 * 代码格式：8010xx 等，归 sh 市场。
 * 命名按申万 2021 版（最新版有 31 类）。
 *
 * 用于 SectorHeatmap。Phase 1 客户端用 /api/hq/stock 并发拉这些 symbol，
 * 客户端聚合涨跌幅。如有效返回率 <80%，按 spec 第 4.3 节切换 Phase 2 服务端聚合。
 */

export interface ShenwanIndustry {
  code: string;  // 完整 symbol，如 '801010.sh'
  name: string;
}

export const SHENWAN_INDUSTRIES: ReadonlyArray<ShenwanIndustry> = [
  { code: '801010.sh', name: '农林牧渔' },
  { code: '801030.sh', name: '基础化工' },
  { code: '801040.sh', name: '钢铁' },
  { code: '801050.sh', name: '有色金属' },
  { code: '801080.sh', name: '电子' },
  { code: '801110.sh', name: '家用电器' },
  { code: '801120.sh', name: '食品饮料' },
  { code: '801130.sh', name: '纺织服饰' },
  { code: '801140.sh', name: '轻工制造' },
  { code: '801150.sh', name: '医药生物' },
  { code: '801160.sh', name: '公用事业' },
  { code: '801170.sh', name: '交通运输' },
  { code: '801180.sh', name: '房地产' },
  { code: '801200.sh', name: '商贸零售' },
  { code: '801210.sh', name: '社会服务' },
  { code: '801230.sh', name: '综合' },
  { code: '801710.sh', name: '建筑材料' },
  { code: '801720.sh', name: '建筑装饰' },
  { code: '801730.sh', name: '电力设备' },
  { code: '801740.sh', name: '国防军工' },
  { code: '801750.sh', name: '计算机' },
  { code: '801760.sh', name: '传媒' },
  { code: '801770.sh', name: '通信' },
  { code: '801780.sh', name: '银行' },
  { code: '801790.sh', name: '非银金融' },
  { code: '801880.sh', name: '汽车' },
  { code: '801890.sh', name: '机械设备' },
  { code: '801950.sh', name: '煤炭' },
  { code: '801960.sh', name: '石油石化' },
  { code: '801970.sh', name: '环保' },
  { code: '801980.sh', name: '美容护理' },
];
