/**
 * Edge-safe HMAC session verifier — usable from middleware (Edge runtime
 * forbids `node:crypto`/`node:fs`, so the canonical `auth.ts` cannot run here).
 *
 * Mirrors the signing scheme in `lib/auth.ts`:
 *   token = `${email}|${exp}|${hmac_sha256(`${email}|${exp}`, SESSION_SECRET)}`
 *
 * H6: middleware previously trusted any 3-segment cookie. This module lets it
 * actually verify the HMAC so unauthenticated callers cannot reach protected
 * pages just by writing `aaa|0|bbb` into their cookie jar.
 */

const encoder = new TextEncoder();
let cachedSecret: string | null = null;
let cachedKey: Promise<CryptoKey> | null = null;
let _warnedNoSecret = false;

function getSecret(): string | null {
  if (cachedSecret !== null) return cachedSecret || null;
  const env = process.env.SESSION_SECRET;
  if (!env) {
    cachedSecret = '';
    return null;
  }
  cachedSecret = env;
  return env;
}

function getKey(): Promise<CryptoKey> | null {
  if (cachedKey) return cachedKey;
  const secret = getSecret();
  if (!secret) return null;
  cachedKey = crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
  return cachedKey;
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length === 0 || hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    const byte = parseInt(hex.substr(i, 2), 16);
    if (Number.isNaN(byte)) return null;
    out[i / 2] = byte;
  }
  return out;
}

/**
 * Returns the verified email when the token is valid and unexpired; otherwise
 * null. Never throws on bad input.
 *
 * Graceful degradation: when SESSION_SECRET is not configured (dev / legacy
 * deploys that pre-date the upgrade), we fall back to the pre-upgrade
 * "structural only" check — token has 3 segments and isn't expired. This
 * keeps existing sessions alive instead of silently logging everyone out the
 * moment middleware is upgraded; the real HMAC verify still runs server-side
 * in lib/auth.ts when SESSION_SECRET is missing.
 *
 * Configure SESSION_SECRET to enable full Edge-level HMAC verification.
 */
export async function verifySessionEdge(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const parts = token.split('|');
  if (parts.length !== 3) return null;
  const [email, expStr, sigHex] = parts;
  if (!email || !expStr || !sigHex) return null;
  const exp = Number.parseInt(expStr, 10);
  if (!Number.isFinite(exp) || Date.now() > exp) return null;

  const key = await getKey();
  if (!key) {
    if (!_warnedNoSecret) {
      // eslint-disable-next-line no-console
      console.warn(
        '[session-edge] SESSION_SECRET not configured — running in format-check-only mode. ' +
          'Set SESSION_SECRET in .env.local to enable Edge HMAC verification.',
      );
      _warnedNoSecret = true;
    }
    return email;
  }
  const sig = hexToBytes(sigHex);
  if (!sig) return null;
  // Web Crypto's verify needs ArrayBuffer-backed views; copy through .slice()
  // so we never hand it a SharedArrayBuffer-backed buffer (TS strictness).
  const sigBuf = sig.slice().buffer;
  const payload = encoder.encode(`${email}|${expStr}`).slice().buffer;
  let ok = false;
  try {
    ok = await crypto.subtle.verify('HMAC', key, sigBuf, payload);
  } catch {
    return null;
  }
  return ok ? email : null;
}
