import type { SotpResult } from '@/types/valuation';
import { formatMoney, formatMultiple } from '@/lib/valuation/format';

interface Props {
  result: SotpResult;
}

export function SegmentDetailTable({ result }: Props) {
  const methodLabel = (method: string) => {
    if (method === 'EV_SALES') return 'EV/S';
    if (method === 'EV_EBITDA') return 'EV/EBITDA';
    return method;
  };

  const peerMetricLabel = (method: string) => {
    if (method === 'PE') return '净利润';
    if (method === 'PS' || method === 'EV_SALES') return '收入';
    if (method === 'EV_EBITDA') return 'EBITDA';
    return '指标';
  };

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-border-base)] bg-[var(--color-bg-elev1)] shadow-sm">
      <div className="border-b border-[var(--color-border-base)] px-5 py-4">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">业务板块与推算</h2>
        <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
          板块估值 = 板块指标 × 对标公司估值倍数
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[1120px] w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="bg-[var(--color-bg-elev2)] text-left text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-tertiary)]">
              <th className="w-[210px] border-b border-[var(--color-border-base)] px-5 py-3">业务板块</th>
              <th className="w-[180px] border-b border-[var(--color-border-base)] px-4 py-3 text-right">板块指标</th>
              <th className="border-b border-[var(--color-border-base)] px-4 py-3">对标公司</th>
              <th className="w-[190px] border-b border-[var(--color-border-base)] px-4 py-3 text-right">对标公司指标</th>
              <th className="w-[150px] border-b border-[var(--color-border-base)] px-4 py-3 text-right">对标估值</th>
              <th className="w-[100px] border-b border-[var(--color-border-base)] px-4 py-3 text-right">倍数</th>
              <th className="w-[170px] border-b border-[var(--color-border-base)] px-5 py-3 text-right">推算估值</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border-base)]">
            {result.segments.map((s) => {
              const primaryPeer = s.segment.peers[0] ?? null;
              const multiple = primaryPeer ? s.peerImpliedMultiples[primaryPeer.ticker] ?? null : null;

              return (
                <tr
                  key={s.segment.id}
                  className={`transition-colors hover:bg-[var(--color-bg-elev2)] ${
                    s.excluded ? 'text-[var(--color-text-disabled)]' : 'text-[var(--color-text-primary)]'
                  }`}
                >
                  <th className="px-5 py-4 text-left align-middle">
                    <div className="font-semibold">{s.segment.name}</div>
                    <div className="mt-1 text-xs font-normal text-[var(--color-brand)]">{methodLabel(s.segment.method)}</div>
                    {s.excluded && (
                      <div className="mt-2 rounded bg-[rgba(240,185,11,0.12)] px-2 py-1 text-xs font-normal text-[var(--color-brand)]">
                        已剔除 · {s.excludeReason}
                      </div>
                    )}
                  </th>
                  <td className="px-4 py-4 text-right align-middle tabular-nums">
                    <div className="font-medium">{formatMoney(s.segment.metricValue, result.currency)}</div>
                    <div className="mt-1 text-xs text-[var(--color-text-tertiary)]">{s.segment.metricLabel}</div>
                  </td>
                  <td className="px-4 py-4 align-middle">
                    {primaryPeer ? (
                      <div>
                        <div className="font-medium text-[var(--color-text-primary)]">{primaryPeer.name}</div>
                        <div className="mt-1 font-mono text-xs text-[var(--color-text-tertiary)]">{primaryPeer.ticker}</div>
                      </div>
                    ) : (
                      <span className="rounded border border-[rgba(240,185,11,0.35)] bg-[rgba(240,185,11,0.12)] px-2 py-1 text-xs text-[var(--color-brand)]">
                        暂无真实 peer 数据
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-right align-middle tabular-nums text-[var(--color-text-secondary)]">
                    <div>{formatMoney(primaryPeer?.netIncome ?? null, result.currency)}</div>
                    <div className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                      {primaryPeer?.valuationMultiple
                        ? (primaryPeer.valuationMultipleLabel ?? '已验证倍数')
                        : peerMetricLabel(s.segment.method)}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right align-middle tabular-nums text-[var(--color-text-secondary)]">
                    {formatMoney(primaryPeer?.marketValue ?? null, result.currency)}
                  </td>
                  <td className="px-4 py-4 text-right align-middle tabular-nums font-medium text-[var(--color-brand)]">
                    {formatMultiple(multiple)}
                    {primaryPeer?.valuationMultipleLabel && (
                      <div className="mt-1 text-xs font-normal text-[var(--color-text-tertiary)]">
                        {primaryPeer.valuationMultipleLabel}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right align-middle">
                    <div className="font-semibold tabular-nums text-[var(--color-text-primary)]">
                      {s.excluded ? '--' : formatMoney(s.impliedValue, result.currency)}
                    </div>
                    <div className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                      中位 {formatMultiple(s.peerMedian)} · n={s.peerCount}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {result.excludedCount > 0 && (
        <div className="border-t border-[var(--color-border-base)] bg-[rgba(240,185,11,0.12)] px-5 py-2 text-xs text-[var(--color-brand)]">
          {result.excludedCount === result.segments.length
            ? '当前仅展示年报分部事实；尚未接入真实 peer 数据，因此不计算估值。单源 peer 数据取得后会降级显示。'
            : `已剔除 ${result.excludedCount} 个业务（数据不全），合计仅基于已计算业务。`}
        </div>
      )}
    </div>
  );
}
