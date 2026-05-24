import { NextResponse } from 'next/server';
import { registerUser, setSessionCookie } from '@/lib/auth';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

export async function POST(req: Request) {
  // 防滥用：每 IP 60s 最多 5 次注册尝试
  if (checkRateLimit(`register:${clientIp(req)}`, { max: 5, windowMs: 60_000 })) {
    return NextResponse.json({ error: '尝试过于频繁，请稍后再试' }, { status: 429 });
  }
  let body: { email?: string; password?: string; password2?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求体非法' }, { status: 400 });
  }
  const { email, password, password2 } = body;
  if (!email || !password || !password2) {
    return NextResponse.json({ error: '请填写完整邮箱和两次密码' }, { status: 400 });
  }
  if (password !== password2) {
    return NextResponse.json({ error: '两次密码不一致' }, { status: 400 });
  }
  const result = registerUser(email, password);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  await setSessionCookie(email.trim().toLowerCase());
  return NextResponse.json({ ok: true, email: email.trim().toLowerCase() });
}
