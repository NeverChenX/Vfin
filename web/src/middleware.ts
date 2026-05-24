import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// 注意：middleware 跑在 Edge runtime，不能直接 import 用 fs 的 lib/auth.ts。
// 这里仅做 cookie 存在性 + 签名格式简单校验，深度校验在页面/路由处理。
// 默认拦截：除登录/注册/静态资源/auth API 外都需要 session cookie。

const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/api/auth/login',
  '/api/auth/register',
  '/api/hq',   // gateway 反代，本身受 Next.js rewrites 处理
  '/hqchart',  // HQChart 静态资源
  '/hq-classic', // 经典版 HQChart 单页（保留全部原功能）
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname === '/robots.txt' ||
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
  ) {
    return NextResponse.next();
  }

  const session = req.cookies.get('vfin_session')?.value;
  // 简单校验：必须是 3 段 | 分隔
  if (!session || session.split('|').length !== 3) {
    if (pathname.startsWith('/api/')) {
      return new NextResponse(JSON.stringify({ error: '未登录，请先登录' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon).*)'],
};
