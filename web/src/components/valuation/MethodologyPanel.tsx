interface Method {
  name: string;
  formula: string;
  bestFor: string;
  pitfalls: string;
  fitForThisCompany: 'primary' | 'secondary' | 'avoid' | 'neutral';
  fitNote?: string;
}

interface MethodologyPanelProps {
  /** 公司特征标签，决定推荐 */
  companyTraits: {
    isMultiSegment: boolean;     // 多元化 → SOTP
    isStableProfit: boolean;     // 利润稳定 → PE 适用
    isGrowthStage: boolean;      // 成长型 → PS/PEG/DCF
    isCyclical: boolean;         // 周期股 → PB
    isCashFlowReliable: boolean; // 现金流稳定 → DCF 可靠
  };
}

const TAG_STYLES: Record<Method['fitForThisCompany'], string> = {
  primary: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  secondary: 'bg-blue-50 text-blue-700 ring-blue-200',
  avoid: 'bg-red-50 text-red-700 ring-red-200',
  neutral: 'bg-gray-50 text-gray-600 ring-gray-200',
};

const TAG_LABEL: Record<Method['fitForThisCompany'], string> = {
  primary: '★ 推荐主用',
  secondary: '辅助参考',
  avoid: '⚠ 不建议',
  neutral: '可用',
};

function buildMethods(t: MethodologyPanelProps['companyTraits']): Method[] {
  return [
    {
      name: 'DCF (现金流贴现)',
      formula: 'Σ FCF_t / (1+r)^t + TV / (1+r)^N',
      bestFor: '现金流可预测的成熟/成长公司',
      pitfalls: '对假设极敏感（增长率、WACC、永续 g）',
      fitForThisCompany: t.isCashFlowReliable ? 'primary' : t.isCyclical ? 'avoid' : 'secondary',
      fitNote: t.isCashFlowReliable
        ? '本公司经营现金流可预测，DCF 是最直接的内在价值估算工具'
        : '本公司现金流波动较大，DCF 结果对假设敏感，需配合多档敏感性分析',
    },
    {
      name: 'PE (市盈率)',
      formula: '市值 / TTM 归母净利润',
      bestFor: '盈利稳定的成熟公司',
      pitfalls: '盈利亏损/剧烈波动时无意义；忽略资本结构差异',
      fitForThisCompany: t.isStableProfit ? 'primary' : 'avoid',
      fitNote: t.isStableProfit
        ? '本公司净利润相对稳定，PE 倍数对比同业有意义'
        : '本公司近年利润波动剧烈（如 2022 同比 -87%），单点 PE 易误导，可用 3 年均值',
    },
    {
      name: 'PS (市销率)',
      formula: '市值 / TTM 营收',
      bestFor: '高增长但利润尚未稳定的公司',
      pitfalls: '忽略利润率差异；销售大不等于值钱',
      fitForThisCompany: t.isGrowthStage ? 'primary' : 'neutral',
      fitNote: t.isGrowthStage
        ? '本公司处于成长扩张期且部分业务利润率波动，PS 比 PE 更可比'
        : undefined,
    },
    {
      name: 'PB (市净率)',
      formula: '市值 / 归母权益',
      bestFor: '资产密集型 / 金融 / 周期股',
      pitfalls: '科技公司主要价值是无形资产，PB 失效',
      fitForThisCompany: t.isCyclical ? 'primary' : 'avoid',
      fitNote: t.isCyclical
        ? '本公司业务周期性强，PB 反映资产质量底部更稳定'
        : '本公司核心价值是品牌/生态/用户，PB 大幅低估真实价值',
    },
    {
      name: 'EV/EBITDA',
      formula: '(市值 + 净负债) / EBITDA',
      bestFor: '跨资本结构同业对比；并购定价',
      pitfalls: '忽略 CapEx 真实负担（重资产公司易高估）',
      fitForThisCompany: 'secondary',
      fitNote: '跨地区/不同税率/不同杠杆同业对比有用',
    },
    {
      name: 'SOTP (分部加总)',
      formula: 'Σ (每段业务 × 对应同业倍数) + 净现金',
      bestFor: '多元化公司（业务差异大、估值口径不同）',
      pitfalls: '依赖分部数据披露质量 + 同业 peer 真实倍数',
      fitForThisCompany: t.isMultiSegment ? 'primary' : 'avoid',
      fitNote: t.isMultiSegment
        ? '本公司业务多元（手机/IoT/互联网/汽车），整体估值无意义，需分部 SOTP'
        : '本公司业务集中，无需分拆',
    },
  ];
}

export function MethodologyPanel({ companyTraits }: MethodologyPanelProps) {
  const methods = buildMethods(companyTraits);

  const summary: string[] = [];
  if (companyTraits.isMultiSegment) summary.push('多业务多元化');
  if (companyTraits.isGrowthStage) summary.push('成长扩张期');
  if (companyTraits.isStableProfit) summary.push('利润稳定');
  if (companyTraits.isCyclical) summary.push('周期股');
  if (companyTraits.isCashFlowReliable) summary.push('现金流可预测');

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-gray-900">估值方法论框架</h2>
        <p className="mt-0.5 text-[11px] text-gray-500">
          本公司特征：
          {summary.length > 0
            ? summary.map((s, i) => (
                <span
                  key={s}
                  className="ml-1 rounded bg-blue-50 px-1.5 py-0.5 text-blue-700 ring-1 ring-blue-200"
                >
                  {s}
                </span>
              ))
            : ' 待识别'}
        </p>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-2 text-left font-medium">方法</th>
            <th className="px-3 py-2 text-left font-medium">公式</th>
            <th className="px-3 py-2 text-left font-medium">适用</th>
            <th className="px-3 py-2 text-left font-medium">陷阱</th>
            <th className="px-3 py-2 text-left font-medium">本公司适用度</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {methods.map((m) => (
            <tr key={m.name}>
              <td className="px-4 py-2.5 font-medium text-gray-900">{m.name}</td>
              <td className="px-3 py-2.5 font-mono text-[11px] text-gray-700">{m.formula}</td>
              <td className="px-3 py-2.5 text-xs text-gray-600">{m.bestFor}</td>
              <td className="px-3 py-2.5 text-xs text-gray-500">{m.pitfalls}</td>
              <td className="px-3 py-2.5">
                <div
                  className={`inline-block rounded px-2 py-0.5 text-[11px] font-medium ring-1 ${
                    TAG_STYLES[m.fitForThisCompany]
                  }`}
                >
                  {TAG_LABEL[m.fitForThisCompany]}
                </div>
                {m.fitNote && (
                  <div className="mt-1 text-[11px] text-gray-500">{m.fitNote}</div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
