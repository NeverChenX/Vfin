import 'server-only';
import { cookies } from 'next/headers';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import crypto from 'node:crypto';

const USERS_FILE = join(process.cwd(), 'src', 'data', 'users.json');
const SESSION_COOKIE = 'vfin_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

/**
 * SESSION_SECRET 处理：
 * - prod 模式必须设置环境变量；缺失直接 throw（启动期失败比静默用弱密钥安全）
 * - dev 模式生成一次进程级随机串，仅本进程内有效；console.warn 提醒
 * 之前的写死 fallback `dev-only-secret...` 任何看代码的人都能伪造 token。
 */
const SESSION_SECRET = (() => {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET environment variable is required in production');
  }
  // dev only — 每次进程启动新生成；可保留 dev cookie 失效是预期行为
  // eslint-disable-next-line no-console
  console.warn('[auth] SESSION_SECRET not set; using ephemeral random key for this dev process');
  return crypto.randomBytes(32).toString('hex');
})();

export interface UserRecord {
  email: string;
  passwordHash: string;
  createdAt: string;
}

function loadUsers(): UserRecord[] {
  if (!existsSync(USERS_FILE)) return [];
  try {
    return JSON.parse(readFileSync(USERS_FILE, 'utf-8')) as UserRecord[];
  } catch {
    return [];
  }
}

function saveUsers(users: UserRecord[]): void {
  mkdirSync(dirname(USERS_FILE), { recursive: true });
  writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 32).toString('hex');
}

function makeHash(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);
  return `${salt}$${hash}`;
}

function verifyHash(password: string, stored: string): boolean {
  const [salt, hash] = stored.split('$');
  if (!salt || !hash) return false;
  const test = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(test, 'hex'), Buffer.from(hash, 'hex'));
}

export function registerUser(
  email: string,
  password: string,
): { ok: boolean; error?: string } {
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { ok: false, error: '邮箱格式不正确' };
  if (password.length < 6) return { ok: false, error: '密码至少 6 位' };
  const users = loadUsers();
  if (users.some((u) => u.email === e)) return { ok: false, error: '邮箱已注册' };
  users.push({ email: e, passwordHash: makeHash(password), createdAt: new Date().toISOString() });
  saveUsers(users);
  return { ok: true };
}

export function checkCredentials(email: string, password: string): boolean {
  const e = email.trim().toLowerCase();
  const users = loadUsers();
  const user = users.find((u) => u.email === e);
  if (!user) return false;
  return verifyHash(password, user.passwordHash);
}

// ─── Session via signed cookie ───
function sign(payload: string): string {
  return crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
}

function makeSessionToken(email: string): string {
  const exp = Date.now() + SESSION_TTL_MS;
  const payload = `${email}|${exp}`;
  return `${payload}|${sign(payload)}`;
}

function verifySessionToken(token: string): string | null {
  const parts = token.split('|');
  if (parts.length !== 3) return null;
  const [email, expStr, sig] = parts;
  if (sign(`${email}|${expStr}`) !== sig) return null;
  const exp = parseInt(expStr, 10);
  if (!Number.isFinite(exp) || Date.now() > exp) return null;
  return email;
}

export async function setSessionCookie(email: string): Promise<void> {
  const token = makeSessionToken(email);
  const c = await cookies();
  c.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
    // 生产环境强制 HTTPS-only；本地 dev http 仍可用
    secure: process.env.NODE_ENV === 'production',
  });
}

export async function clearSessionCookie(): Promise<void> {
  const c = await cookies();
  c.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
}

export async function getCurrentUser(): Promise<string | null> {
  const c = await cookies();
  const token = c.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/**
 * 确保系统至少存在一个默认账号；首次访问 / 启动时调用。
 * 默认账号：demo@analysis.local / demo123456
 */
export function ensureDefaultAccount(): { email: string; password: string } | null {
  // 仅 dev 环境创建默认账号；prod 必须用户主动 register
  if (process.env.NODE_ENV === 'production') return null;
  const users = loadUsers();
  const DEFAULT_EMAIL = 'demo@vfin.local';
  const DEFAULT_PWD = 'demo123456';
  if (!users.some((u) => u.email === DEFAULT_EMAIL)) {
    users.push({
      email: DEFAULT_EMAIL,
      passwordHash: makeHash(DEFAULT_PWD),
      createdAt: new Date().toISOString(),
    });
    saveUsers(users);
  }
  return { email: DEFAULT_EMAIL, password: DEFAULT_PWD };
}
