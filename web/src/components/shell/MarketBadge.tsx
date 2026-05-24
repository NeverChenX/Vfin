interface Props {
  market?: 'A' | 'HK' | 'US' | 'other';
  size?: 'sm' | 'md';
}

const LABEL: Record<string, string> = {
  A: 'A股',
  HK: '港股',
  US: '美股',
  other: '其他',
};

// 三大市场统一金色徽标（避免颜色混入涨跌色系，保留品牌色一致性）
const GOLD = 'border-[#F0B90B]/40 text-[#F0B90B] bg-[#F0B90B]/10';
const STYLE: Record<string, string> = {
  A:     GOLD,
  HK:    GOLD,
  US:    GOLD,
  other: 'border-[var(--color-border-base)] text-[var(--color-text-tertiary)] bg-[var(--color-bg-elev2)]',
};

export function MarketBadge({ market = 'other', size = 'sm' }: Props) {
  const cls = STYLE[market];
  const sz = size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-[11px] px-2 py-0.5';
  return (
    <span className={`inline-block rounded-sm border font-mono leading-none ${sz} ${cls}`}>
      {LABEL[market]}
    </span>
  );
}
