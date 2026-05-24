'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

interface Props {
  mode: 'login' | 'register';
}

export function AuthForm({ mode }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mode === 'login' ? { email, password } : { email, password, password2 },
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? '失败');
        return;
      }
      startTransition(() => {
        router.refresh();
        router.push('/');
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const title = mode === 'login' ? '登录' : '注册';
  const altTitle = mode === 'login' ? '注册新账号' : '已有账号？登录';
  const altPath = mode === 'login' ? '/register' : '/login';

  return (
    <div className="mx-auto mt-20 max-w-sm rounded-lg border border-[var(--color-border-base)] bg-[var(--color-bg-elev1)] px-6 py-8 shadow-2xl">
      <div className="mb-6 flex items-center gap-2">
        <span className="inline-block h-7 w-7 rounded bg-[var(--color-brand)] text-center font-mono text-[16px] leading-7 text-[var(--color-bg-base)]">
          V
        </span>
        <div>
          <h1 className="text-[16px] font-bold tracking-tight text-[var(--color-text-primary)]">{title}</h1>
          <p className="text-[11px] text-[var(--color-text-tertiary)]">VFin</p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="邮箱">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete={mode === 'login' ? 'username' : 'email'}
            required
            className="w-full rounded border border-[var(--color-border-base)] bg-[var(--color-bg-elev2)] px-3 py-2 text-[13px] text-[var(--color-text-primary)] focus:border-[var(--color-brand)] focus:outline-none"
          />
        </Field>

        <Field label="密码">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
            minLength={6}
            className="w-full rounded border border-[var(--color-border-base)] bg-[var(--color-bg-elev2)] px-3 py-2 text-[13px] text-[var(--color-text-primary)] focus:border-[var(--color-brand)] focus:outline-none"
          />
        </Field>

        {mode === 'register' && (
          <Field label="再次输入密码">
            <input
              type="password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              autoComplete="new-password"
              required
              minLength={6}
              className="w-full rounded border border-[var(--color-border-base)] bg-[var(--color-bg-elev2)] px-3 py-2 text-[13px] text-[var(--color-text-primary)] focus:border-[var(--color-brand)] focus:outline-none"
            />
          </Field>
        )}

        {error && (
          <div className="rounded border border-[var(--color-down)]/40 bg-[var(--color-down)]/10 px-3 py-2 text-[12px] text-[var(--color-down)]">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || pending}
          className="w-full rounded bg-[var(--color-brand)] px-4 py-2 text-[13px] font-semibold text-[var(--color-bg-base)] transition-colors hover:bg-[var(--color-brand-hover)] disabled:opacity-50"
        >
          {submitting ? '处理中…' : pending ? '跳转中…' : title}
        </button>
      </form>

      <div className="mt-6 flex items-center justify-between text-[12px]">
        <a href={altPath} className="text-[var(--color-text-secondary)] hover:text-[var(--color-brand)]">
          {altTitle} →
        </a>
        {mode === 'login' && (
          <span className="font-mono text-[10.5px] text-[var(--color-text-tertiary)]" title="默认账号">
            demo@vfin.local / demo123456
          </span>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-tertiary)]">{label}</span>
      {children}
    </label>
  );
}
