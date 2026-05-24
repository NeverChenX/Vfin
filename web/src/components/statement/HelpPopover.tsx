'use client';

import { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

interface HelpPopoverProps {
  explain?: string;
  subjectZh: string;
  subjectCfa?: string;
}

/**
 * "?" 按钮 + popover。
 *
 * - 点击 → toggle；点外部/Esc → 关闭
 * - popover 通过 React Portal 渲染到 document.body，避开表格 overflow / transform / sticky z-index 限制
 * - 用 inline style 设 z-index，避免 Tailwind 任意值未编译
 */
export function HelpPopover({ explain, subjectZh, subjectCfa }: HelpPopoverProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // Portal 只能在 client mount 之后用（document 不存在于 SSR）
  useEffect(() => setMounted(true), []);

  // 计算位置（button 下方，必要时往左挪以避免出右边界）
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const popW = 300;
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
    let left = r.left;
    if (left + popW > vw - 8) left = vw - popW - 8;
    if (left < 8) left = 8;
    let top = r.bottom + 6;
    // 如果按钮在视窗下半截，popover 改放上方
    if (top + 140 > vh && r.top > 140) top = r.top - 140 - 6;
    setPos({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  if (!explain) return null;

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setOpen((o) => !o);
  };

  const popover = open && pos ? (
    <div
      ref={popRef}
      role="dialog"
      aria-label={`${subjectZh} 解释`}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        width: 300,
        zIndex: 9999,
        background: '#ffffff',
        border: '1px solid #cbd5e1',
        borderRadius: 8,
        padding: '10px 14px',
        fontSize: 12,
        lineHeight: 1.65,
        color: '#334155',
        boxShadow: '0 10px 30px -8px rgba(15,23,42,0.25), 0 4px 12px -4px rgba(15,23,42,0.15)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, paddingBottom: 6, marginBottom: 6, borderBottom: '1px solid #f1f5f9' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{subjectZh}</span>
        {subjectCfa && (
          <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10.5, color: '#94a3b8' }}>{subjectCfa}</span>
        )}
      </div>
      <p style={{ margin: 0 }}>{explain}</p>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-label={`查看 ${subjectZh} 的解释`}
        aria-expanded={open}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 16,
          height: 16,
          marginLeft: 4,
          padding: 0,
          borderRadius: '50%',
          border: '1px solid #cbd5e1',
          background: open ? '#dbeafe' : '#f8fafc',
          color: open ? '#1d4ed8' : '#64748b',
          fontSize: 10,
          fontWeight: 700,
          lineHeight: 1,
          cursor: 'pointer',
          transition: 'all 120ms',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#0ea5e9'; (e.currentTarget as HTMLButtonElement).style.background = '#e0f2fe'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#cbd5e1'; (e.currentTarget as HTMLButtonElement).style.background = open ? '#dbeafe' : '#f8fafc'; }}
      >
        ?
      </button>
      {mounted && popover ? createPortal(popover, document.body) : null}
    </>
  );
}
