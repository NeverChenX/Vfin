import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionEdge } from '@/lib/session-edge';

// H6: middleware previously only checked that the cookie was 3 |-separated
// segments. Now it actually verifies the HMAC signature so unauthenticated
// callers cannot reach protected pages by writing `aaa|0|bbb` into their
// cookie jar. We use an edge-safe verifier (Web Crypto) because Edge runtime
// forbids node:crypto / node:fs.

const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/api/auth/login',
  '/api/auth/register',
  '/api/hq',   // gateway 反代，本身受 Next.js rewrites 处理
  '/hqchart',  // HQChart 静态资源
  '/hq-classic', // 经典版 HQChart 单页（保留全部原功能）
];

function unauthorized(req: NextRequest): NextResponse {
  if (req.nextUrl.pathname.startsWith('/api/')) {
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

export async function middleware(req: NextRequest) {
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
  if (!session) return unauthorized(req);
  const email = await verifySessionEdge(session);
  if (!email) return unauthorized(req);

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon).*)'],
};
