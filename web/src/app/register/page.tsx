import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { AuthForm } from '@/components/auth/AuthForm';

// await getCurrentUser() → 自动 dynamic

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect('/');
  return <AuthForm mode="register" />;
}
