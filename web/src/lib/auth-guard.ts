import { NextResponse } from 'next/server';
import { getCurrentUser } from './auth';

/**
 * API route 守卫 — 二次校验 session token（middleware 只校验 cookie 格式 `x|y|z`）。
 *
 * 用法：
 *   const guard = await requireAuth();
 *   if (guard instanceof NextResponse) return guard;
 *   const userEmail = guard;
 */
export async function requireAuth(): Promise<NextResponse | string> {
  const email = await getCurrentUser();
  if (!email) {
    return NextResponse.json({ error: '未登录，请先登录' }, { status: 401 });
  }
  return email;
}
