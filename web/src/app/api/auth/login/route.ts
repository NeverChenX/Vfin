import { NextResponse } from 'next/server';
import { checkCredentials, setSessionCookie } from '@/lib/auth';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

export async function POST(req: Request) {
  // 防暴力：每 IP 60s 最多 10 次登录尝试
  if (checkRateLimit(`login:${clientIp(req)}`, { max: 10, windowMs: 60_000 })) {
    return NextResponse.json({ error: '尝试过于频繁，请稍后再试' }, { status: 429 });
  }
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求体非法' }, { status: 400 });
  }
  const { email, password } = body;
  if (!email || !password) {
    return NextResponse.json({ error: '请填写邮箱和密码' }, { status: 400 });
  }
  if (!checkCredentials(email, password)) {
    return NextResponse.json({ error: '邮箱或密码错误' }, { status: 401 });
  }
  await setSessionCookie(email.trim().toLowerCase());
  return NextResponse.json({ ok: true, email: email.trim().toLowerCase() });
}
