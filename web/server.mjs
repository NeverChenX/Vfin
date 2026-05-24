/**
 * VFin 统一入口 — Next.js + Express gateway 跑在同一个 HTTP server / 同一个进程 / 同一个端口。
 *
 *   /api/hq/*  → 内部转给 Express gateway（剥掉 /hq 前缀）
 *   其他       → Next.js (含 /api/auth、/api/companies、页面、静态资源、HMR)
 *
 * 路径解析：
 *   - DB 路径锁死到 ../gateway/data/vfin-gateway.sqlite（不依赖 cwd）
 *   - Next.js app dir = 本文件所在目录（web/）
 */
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Turbopack 必须在 import next 之前通过 env 开启（Next 15 自定义 server 用法）
if (process.env.NODE_ENV !== 'production' && process.env.NEXT_DISABLE_TURBOPACK !== '1') {
  process.env.TURBOPACK = '1';
}

const next = (await import('next')).default;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- 锁定 gateway SQLite 路径（必须在 import gateway 之前设置）----
const gatewayDbPath = path.resolve(__dirname, '../gateway/data/vfin-gateway.sqlite');
if (!process.env.VFIN_GATEWAY_DB_PATH) {
  process.env.VFIN_GATEWAY_DB_PATH = gatewayDbPath;
}

const { createApp: createGatewayApp } = await import('../gateway/src/server.js');
const { loadConfig: loadGatewayConfig } = await import('../gateway/src/config.js');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOST || '0.0.0.0';
const port = Number.parseInt(process.env.PORT || '3816', 10);

const gatewayCfg = loadGatewayConfig();
const gatewayApp = createGatewayApp({
  providerOrder: gatewayCfg.providerOrder,
  providerMode: gatewayCfg.providerMode,
});

const nextApp = next({ dev, hostname, port, dir: __dirname });
const handleNext = nextApp.getRequestHandler();

await nextApp.prepare();

const HQ_PREFIX = '/api/hq';

const server = createServer((req, res) => {
  const url = req.url || '/';

  // /api/hq → /api  ;  /api/hq/foo → /api/foo  ;  /api/hq?x=1 → /api?x=1
  // 等价于原 next.config.ts 的 rewrite: /api/hq/:path* → /api/:path*
  if (
    url === HQ_PREFIX ||
    url.startsWith(`${HQ_PREFIX}/`) ||
    url.startsWith(`${HQ_PREFIX}?`)
  ) {
    req.url = '/api' + url.slice(HQ_PREFIX.length);
    return gatewayApp(req, res);
  }

  return handleNext(req, res);
});

server.listen(port, hostname, () => {
  // eslint-disable-next-line no-console
  console.log(`▲ VFin (next+gateway) ready on http://${hostname}:${port}  [${dev ? 'dev' : 'prod'}]`);
  // eslint-disable-next-line no-console
  console.log(`   gateway DB: ${process.env.VFIN_GATEWAY_DB_PATH}`);
});
