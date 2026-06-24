'use client';

import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { SearchBox } from './SearchBox';

interface TopBarProps {
  username?: string;
  ticker?: string;
}

export function TopBar({ username, ticker }: TopBarProps) {
  const router = useRouter();
  const pathname = usePathname() ?? '';

  const navItems: Array<{ href: string; label: string }> = [
    { href: '/', label: '市场总览' },
    { href: '/assets', label: '资产列表' },
  ];

  const onLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    router.push('/login');
  };

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-border-base)] bg-[var(--color-bg-elev1)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-bg-elev1)]/85">
      <div className="flex h-[48px] items-center gap-2 px-3 sm:gap-4 sm:px-4">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-1.5 text-[15px] font-bold tracking-tight text-[var(--color-brand)] hover:text-[var(--color-brand-hover)] sm:gap-2"
          aria-label="VFin"
        >
          <span className="inline-block h-5 w-5 rounded-sm bg-[var(--color-brand)]/90 text-center font-mono text-[12px] leading-5 text-[var(--color-bg-base)]">
            V
          </span>
          <span className="hidden sm:inline">VFin</span>
        </Link>

        {navItems.length > 0 && (
          <nav className="flex items-center gap-0.5 text-[12.5px] sm:gap-1">
            {navItems.map((it) => (
              <NavLink
                key={it.href}
                href={it.href}
                current={pathname === it.href}
              >
                {it.label}
              </NavLink>
            ))}
          </nav>
        )}

        <div className="ml-1 flex-1 sm:ml-4">
          <SearchBox />
        </div>

        <div className="flex shrink-0 items-center gap-2 text-[12px]">
          {username && (
            <span className="hidden text-[var(--color-text-secondary)] md:inline">
              {username}
            </span>
          )}
          <button
            type="button"
            onClick={onLogout}
            className="rounded border border-[var(--color-border-base)] px-2 py-1 text-[11.5px] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)] sm:px-2.5"
          >
            退出
          </button>
        </div>
      </div>
    </header>
  );
}

function NavLink({
  href,
  current,
  children,
}: {
  href: string;
  current: boolean;
  children: React.ReactNode;
}) {
  const cls = `rounded px-3 py-1.5 transition-colors ${
    current
      ? 'bg-[var(--color-bg-elev3)] text-[var(--color-text-primary)]'
      : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elev2)] hover:text-[var(--color-text-primary)]'
  }`;
  return <Link href={href} className={cls}>{children}</Link>;
}
