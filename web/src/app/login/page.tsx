import { redirect } from 'next/navigation';
import { ensureDefaultAccount, getCurrentUser } from '@/lib/auth';
import { AuthForm } from '@/components/auth/AuthForm';

// await getCurrentUser() → 自动 dynamic，不需要 force-dynamic

export default async function LoginPage() {
  ensureDefaultAccount();
  const user = await getCurrentUser();
  if (user) redirect('/');
  return <AuthForm mode="login" />;
}
