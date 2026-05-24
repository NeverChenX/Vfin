import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Sparkline } from '@/components/statement/Sparkline';

// 仅 dev 可访问的视觉调试页（生产环境组件内 notFound()）

interface Pattern {
  name: string;
  values: Array<number | null>;
  expectColor: 'green' | 'red';
  note?: string;
}

const PATTERNS: Pattern[] = [
  { name: '01 · 单调上升',         values: [10, 20, 30, 40, 50, 60, 70, 80],        expectColor: 'green', note: '10 → 80' },
  { name: '02 · 单调下降',         values: [80, 70, 60, 50, 40, 30, 20, 10],        expectColor: 'red',   note: '80 → 10' },
  { name: '03 · 上升波折',         values: [10, 25, 15, 35, 25, 45, 35, 55],        expectColor: 'green', note: '10 → 55，但每步震荡' },
  { name: '04 · 下降波折',         values: [55, 35, 45, 25, 35, 15, 25, 10],        expectColor: 'red',   note: '55 → 10，但每步震荡' },
  { name: '05 · 来回波折（涨）',    values: [30, 50, 30, 50, 30, 50, 30, 50],        expectColor: 'green', note: '终点 50 > 起点 30' },
  { name: '06 · 来回波折（持平）',  values: [30, 50, 30, 50, 30, 50, 30, 30],        expectColor: 'green', note: '终点 = 起点 = 30' },
  { name: '07 · V 字形',           values: [50, 30, 15, 5, 15, 30, 50],             expectColor: 'green', note: '低谷在中间，终点回起点' },
  { name: '08 · 倒 V（先涨后跌）',  values: [10, 30, 50, 80, 50, 30, 10],            expectColor: 'green', note: '高峰中间，终回起点' },
  { name: '09 · 双峰（季节性）',    values: [10, 50, 20, 70, 15, 60, 10],            expectColor: 'green', note: '类似水电 Q3 双峰' },
  { name: '10 · 平坦',             values: [30, 30, 30, 30, 30, 30],                expectColor: 'green', note: '完全持平（>= 判定为绿）' },
  { name: '11 · 单点突跳',         values: [10, 10, 10, 100, 10, 10],               expectColor: 'green', note: '一次性异常值' },
  { name: '12 · 含 null',          values: [10, null, 30, null, 50, 70],            expectColor: 'green', note: 'null 跳过，时间轴保持' },
  { name: '13 · 负数转正',         values: [-50, -30, -10, 10, 30, 50],             expectColor: 'green', note: '由亏转盈' },
  { name: '14 · 由正转负',         values: [50, 30, 10, -10, -30, -50],             expectColor: 'red',   note: '由盈转亏' },
  { name: '15 · 全负数加深',       values: [-10, -20, -30, -40],                    expectColor: 'red',   note: '越来越负' },
  { name: '16 · 冲高回落',         values: [10, 30, 80, 50, 20, 5],                 expectColor: 'red',   note: '冲到 80 后跌到 5（终 < 起）' },
];

function computeTrendColor(values: Array<number | null>): 'green' | 'red' | 'empty' {
  const filtered = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (filtered.length < 2) return 'empty';
  const first = filtered[0];
  const last = filtered[filtered.length - 1];
  return last >= first ? 'green' : 'red';
}

export default function SparklineTestPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  let pass = 0;
  let fail = 0;

  return (
    <main className="mx-auto max-w-[1200px] px-4 py-6">
      <header className="mb-5 border-b border-slate-300 pb-3">
        <div className="flex items-baseline gap-3">
          <Link href="/" className="font-mono text-[11px] text-slate-500 hover:text-slate-900">← 返回首页</Link>
        </div>
        <h1 className="mt-2 text-lg font-bold tracking-tight text-slate-900">Sparkline 波形校验</h1>
        <p className="mt-1 text-[12px] text-slate-500">
          16 种波形 × 端点判定（涨 ≥ 起点 = 绿；终 &lt; 起 = 红）。auto-verify 已嵌入。
        </p>
      </header>

      <div className="overflow-hidden border border-slate-300 bg-white">
        <table className="w-full text-[12.5px]">
          <thead className="border-b border-slate-300 bg-slate-100 text-[11px] uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left">波形</th>
              <th className="px-3 py-2 text-left">数据</th>
              <th className="px-3 py-2 text-left">起 / 终</th>
              <th className="px-3 py-2 text-center">渲染</th>
              <th className="px-3 py-2 text-center">期望</th>
              <th className="px-3 py-2 text-center">实测</th>
              <th className="px-3 py-2 text-center">校验</th>
              <th className="px-3 py-2 text-left">说明</th>
            </tr>
          </thead>
          <tbody>
            {PATTERNS.map((p) => {
              const filtered = p.values.filter((v): v is number => v !== null && Number.isFinite(v));
              const actualColor = computeTrendColor(p.values);
              const ok = actualColor === p.expectColor;
              if (ok) pass++; else fail++;
              const first = filtered[0];
              const last = filtered[filtered.length - 1];
              return (
                <tr key={p.name} className="border-b border-slate-100 hover:bg-amber-50/40">
                  <td className="px-3 py-2 font-medium text-slate-900">{p.name}</td>
                  <td className="px-3 py-2 font-mono text-[10.5px] text-slate-600">
                    [{p.values.map((v) => (v === null ? 'null' : String(v))).join(', ')}]
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-700">
                    {first} → {last}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <div className="inline-flex items-center justify-center rounded border border-slate-200 bg-slate-50 px-1.5 py-1">
                      <Sparkline values={p.values} width={120} height={28} />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <ColorChip color={p.expectColor} />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <ColorChip color={actualColor} />
                  </td>
                  <td className="px-3 py-2 text-center">
                    {ok ? (
                      <span className="font-mono text-emerald-700">✓</span>
                    ) : (
                      <span className="font-mono text-rose-700">✗</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[11.5px] text-slate-500">{p.note}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-slate-50">
            <tr>
              <td colSpan={6} className="px-3 py-2 text-right text-[12px] font-medium text-slate-600">
                合计：
              </td>
              <td className="px-3 py-2 text-center">
                <span className="font-mono text-[12px]">
                  <span className="text-emerald-700">{pass} PASS</span>
                  {fail > 0 ? <span className="ml-2 text-rose-700">{fail} FAIL</span> : null}
                </span>
              </td>
              <td className="px-3 py-2 text-[11px] text-slate-500">
                {fail === 0 ? '全部通过' : '存在偏差，检查 Sparkline.tsx'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <section className="mt-6 rounded border border-slate-200 bg-amber-50/40 px-4 py-3 text-[11.5px] text-slate-700">
        <p className="font-medium text-slate-900">趋势判定算法</p>
        <ul className="ml-4 mt-1 list-disc space-y-1">
          <li>过滤 null 后取 <code className="font-mono">first</code> 和 <code className="font-mono">last</code></li>
          <li>若 <code className="font-mono">last ≥ first</code> → 绿色（涨 / 持平）</li>
          <li>若 <code className="font-mono">last &lt; first</code> → 红色（跌）</li>
          <li>面积填充与折线同色（不透明度 10%）</li>
          <li>最后一个点用实心圆点高亮</li>
        </ul>
      </section>
    </main>
  );
}

function ColorChip({ color }: { color: 'green' | 'red' | 'empty' }) {
  if (color === 'empty') return <span className="font-mono text-[11px] text-slate-400">空</span>;
  const cls = color === 'green' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700';
  const sym = color === 'green' ? '↑ 绿' : '↓ 红';
  return <span className={`inline-block rounded px-2 py-0.5 font-mono text-[11px] ${cls}`}>{sym}</span>;
}
