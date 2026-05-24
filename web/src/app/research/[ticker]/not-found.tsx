import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="text-6xl text-[var(--color-border-strong)]">404</div>
      <h1 className="mt-4 text-xl font-semibold text-[var(--color-text-primary)]">公司未找到</h1>
      <p className="mt-2 text-sm text-[var(--color-text-tertiary)]">该 ticker 没有对应的财报数据。</p>
      <Link
        href="/"
        className="mt-6 rounded-md bg-[var(--color-brand)] px-4 py-2 text-sm font-semibold text-[var(--color-bg-base)] transition hover:bg-[var(--color-brand-hover)]"
      >
        返回首页
      </Link>
    </main>
  );
}
