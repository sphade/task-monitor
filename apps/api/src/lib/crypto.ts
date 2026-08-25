/**
 * Password hashing and random tokens built on Web Crypto, so the exact same
 * code runs in Workers and in the Node-based test harness.
 *
 * Format: `pbkdf2$<iterations>$<salt_b64url>$<hash_b64url>`
 */

const ITERATIONS = 100_000;
const HASH_BYTES = 32;

const encoder = new TextEncoder();

function toB64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function derive(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: ITERATIONS },
    key,
    HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

/** Constant-time comparison that also works outside Workers runtimes. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt);
  return `pbkdf2$${ITERATIONS}$${toB64Url(salt)}$${toB64Url(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const salt = fromB64Url(parts[2]!);
  const expected = fromB64Url(parts[3]!);
  const actual = await derive(password, salt);
  return timingSafeEqual(actual, expected);
}

/** Cryptographically strong 6-digit OTP. */
export function generateOtp(): string {
  const buf = crypto.getRandomValues(new Uint32Array(1));
  return String(buf[0]! % 1_000_000).padStart(6, '0');
}

export function randomToken(): string {
  return crypto.randomUUID();
}

/** SHA-256 hex digest — used to store OTP codes without keeping them plaintext. */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
