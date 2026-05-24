import { TopBar } from './TopBar';
import { getCurrentUser } from '@/lib/auth';

interface AppShellProps {
  ticker?: string;
  children: React.ReactNode;
}

export async function AppShell({ ticker, children }: AppShellProps) {
  const email = await getCurrentUser();
  const displayName = email ? email.split('@')[0] : undefined;

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar username={displayName} ticker={ticker} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
