import { generateOtp, randomToken, sha256Hex } from '@/lib/crypto';
import type { KvStore } from '@/types';

/**
 * OTP handles, stored in KV.
 *
 * Login flow (mirrors the Django API the mobile app was built against):
 *   1. POST /auth/login/            → creates a pending login under a fresh
 *      handle (`otp_key`), plus an `email → handle` index so resend keeps the
 *      same key (the client only ever posts `{ email }` when resending but
 *      keeps using the original handle).
 *   2. POST /auth/verify-login/     → consumes `{ otp, temp_id: handle }`.
 *
 * Password reset uses the same machinery with its own prefix; verify returns a
 * `token_hash` handle that reset-password then exchanges for the change.
 */

const LOGIN_TTL_SECONDS = 600;
const RESET_TTL_SECONDS = 900;

interface PendingCode {
  userId: number;
  codeHash: string;
}

const loginKey = (handle: string) => `otp:login:${handle}`;
const loginEmailIndex = (email: string) => `otp:login:email:${email.toLowerCase()}`;
const resetKey = (handle: string) => `otp:reset:${handle}`;
const resetEmailIndex = (email: string) => `otp:reset:email:${email.toLowerCase()}`;

async function storePending(
  kv: KvStore,
  kind: 'login' | 'reset',
  handle: string,
  userId: number,
  code: string,
): Promise<void> {
  const payload: PendingCode = { userId, codeHash: await sha256Hex(code) };
  const ttl = kind === 'login' ? LOGIN_TTL_SECONDS : RESET_TTL_SECONDS;
  const key = kind === 'login' ? loginKey(handle) : resetKey(handle);
  await kv.put(key, JSON.stringify(payload), { expirationTtl: ttl });
}

function readPending(
  kv: KvStore,
  kind: 'login' | 'reset',
  handle: string,
): Promise<string | null> {
  return kv.get(kind === 'login' ? loginKey(handle) : resetKey(handle));
}

export interface CreatedOtp {
  handle: string;
  /** Present so dev environments can test without an inbox; stripped in prod. */
  code: string;
}

/** Step one of login: create (or refresh) the OTP challenge for this user. */
export async function createLoginOtp(
  kv: KvStore,
  email: string,
  userId: number,
): Promise<CreatedOtp> {
  const handle = (await kv.get(loginEmailIndex(email))) ?? randomToken();
  const code = generateOtp();
  await storePending(kv, 'login', handle, userId, code);
  await kv.put(loginEmailIndex(email), handle, { expirationTtl: LOGIN_TTL_SECONDS });
  return { handle, code };
}

/** Step two of login: check and consume. */
export async function consumeLoginOtp(
  kv: KvStore,
  handle: string,
  code: string,
  email?: string,
): Promise<{ userId: number } | null> {
  const raw = await readPending(kv, 'login', handle);
  if (!raw) return null;
  let pending: PendingCode;
  try {
    pending = JSON.parse(raw) as PendingCode;
  } catch {
    return null;
  }
  if (pending.codeHash !== (await sha256Hex(code))) return null;
  await kv.delete(loginKey(handle));
  if (email) await kv.delete(loginEmailIndex(email));
  return { userId: pending.userId };
}

/** Clears the email → handle index after a successful verification. */
export async function clearLoginEmailIndex(kv: KvStore, email: string): Promise<void> {
  await kv.delete(loginEmailIndex(email));
}

/** Resend: refreshes the code under the SAME handle for this email. */
export async function resendLoginOtp(  kv: KvStore,
  email: string,
  userId: number,
): Promise<CreatedOtp> {
  const handle = (await kv.get(loginEmailIndex(email))) ?? randomToken();
  const code = generateOtp();
  await storePending(kv, 'login', handle, userId, code);
  await kv.put(loginEmailIndex(email), handle, { expirationTtl: LOGIN_TTL_SECONDS });
  return { handle, code };
}

export async function createResetOtp(
  kv: KvStore,
  email: string,
  userId: number,
): Promise<CreatedOtp> {
  const handle = (await kv.get(resetEmailIndex(email))) ?? randomToken();
  const code = generateOtp();
  await storePending(kv, 'reset', handle, userId, code);
  await kv.put(resetEmailIndex(email), handle, { expirationTtl: RESET_TTL_SECONDS });
  return { handle, code };
}

/** Verify a reset code; returns the `token_hash` handle for reset-password. */
export async function consumeResetOtp(
  kv: KvStore,
  handle: string,
  code: string,
): Promise<string | null> {
  const raw = await readPending(kv, 'reset', handle);
  if (!raw) return null;
  let pending: PendingCode;
  try {
    pending = JSON.parse(raw) as PendingCode;
  } catch {
    return null;
  }
  if (pending.codeHash !== (await sha256Hex(code))) return null;

  // The verified handle becomes the short-lived bearer credential for the
  // actual password change.
  const tokenHash = randomToken();
  await kv.put(`otp:reset-verified:${tokenHash}`, JSON.stringify({ userId: pending.userId }), {
    expirationTtl: RESET_TTL_SECONDS,
  });
  await kv.delete(resetKey(handle));
  return tokenHash;
}

/** Exchanges a verified reset handle for the user whose password may change. */
export async function consumeResetToken(
  kv: KvStore,
  tokenHash: string,
): Promise<{ userId: number } | null> {
  const raw = await kv.get(`otp:reset-verified:${tokenHash}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { userId: number };
    await kv.delete(`otp:reset-verified:${tokenHash}`);
    return parsed;
  } catch {
    return null;
  }
}
