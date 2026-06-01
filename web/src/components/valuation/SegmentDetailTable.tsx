'use client';

import { Fragment, useState } from 'react';
import type { SotpResult } from '@/types/valuation';
import { formatMoney, formatMultiple } from '@/lib/valuation/format';

interface Props {
  result: SotpResult;
}

export function SegmentDetailTable({ result }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-gray-900">分部明细</h2>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-2 text-left font-medium">业务</th>
            <th className="px-3 py-2 text-left font-medium">方法</th>
            <th className="px-3 py-2 text-right font-medium">指标值</th>
            <th className="px-3 py-2 text-right font-medium">Peer 中位 (n)</th>
            <th className="px-3 py-2 text-right font-medium">隐含估值</th>
            <th className="px-3 py-2 text-left font-medium">备注</th>
            <th className="w-6" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {result.segments.map((s) => {
            const isOpen = expanded === s.segment.id;
            return (
              <Fragment key={s.segment.id}>
                <tr
                  className={`cursor-pointer hover:bg-gray-50 ${
                    s.excluded ? 'text-gray-400' : 'text-gray-900'
                  }`}
                  onClick={() => setExpanded(isOpen ? null : s.segment.id)}
                >
                  <td className="px-4 py-2.5 font-medium">{s.segment.name}</td>
                  <td className="px-3 py-2.5">{s.segment.method}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatMoney(s.segment.metricValue, result.currency)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatMultiple(s.peerMedian)} ({s.peerCount})
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {s.excluded ? '--' : formatMoney(s.impliedValue, result.currency)}
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    {s.excluded && (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">
                        已剔除 · {s.excludeReason}
                      </span>
                    )}
                  </td>
                  <td className="px-2 text-xs text-gray-400">{isOpen ? '▾' : '▸'}</td>
                </tr>
                {isOpen && (
                  <tr className="bg-gray-50">
                    <td colSpan={7} className="px-6 py-3 text-xs text-gray-700">
                      <div className="mb-2 italic text-gray-600">{s.segment.rationale}</div>
                      <div className="text-[11px] text-gray-500">
                        指标时点 <span className="font-mono">{s.segment.metricAsOf}</span> · 标签：
                        {s.segment.metricLabel}
                      </div>
                      {s.segment.peers.length > 0 && (
                        <ul className="mt-2 divide-y divide-gray-200">
                          {s.segment.peers.map((p) => (
                            <li
                              key={p.ticker}
                              className="flex items-center justify-between py-1.5"
                            >
                              <span className="text-gray-700">
                                {p.name}{' '}
                                <span className="ml-1 text-gray-400">({p.ticker})</span>
                              </span>
                              <span className="flex items-center gap-3 text-gray-500">
                                <span className="tabular-nums">{formatMultiple(p.multiple)}</span>
                                <span className="text-[11px]">{p.asOf}</span>
                                <span className="text-[11px] text-gray-400">{p.source}</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {result.excludedCount > 0 && (
        <div className="border-t border-gray-200 bg-amber-50 px-5 py-2 text-xs text-amber-800">
          ⚠ 已剔除 {result.excludedCount} 个业务（数据不全），SOTP 合计仅基于已计算业务。
        </div>
      )}
    </div>
  );
}
