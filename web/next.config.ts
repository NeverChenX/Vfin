import type { NextConfig } from 'next';

/**
 * 注意：`/api/hq/*` 不再走 rewrite——统一交给 web/server.mjs 自定义 server，
 * 在同一进程里转给内置的 Express gateway（B1：单端口、单进程）。
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 抑制多 lockfile 引起的 workspace root 推断警告
  outputFileTracingRoot: process.cwd(),
  async rewrites() {
    return [
      // 经典版 HQChart 单页 — 把 /hq-classic 映射到 public/hq-classic/index.html
      {
        source: '/hq-classic',
        destination: '/hq-classic/index.html',
      },
    ];
  },
  async redirects() {
    return [
      // 旧 React 版行情页废弃 — 统一走 /hq-classic
      {
        source: '/trade/:ticker',
        destination: '/company/:ticker?tab=kline',
        permanent: true,
      },
      {
        source: '/research/:ticker',
        destination: '/company/:ticker?tab=financials',
        permanent: false,
      },
      {
        source: '/valuation/:ticker',
        destination: '/company/:ticker?tab=valuation',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
