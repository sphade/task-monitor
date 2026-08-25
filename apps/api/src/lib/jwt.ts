import { SignJWT, jwtVerify } from 'jose';

const ISSUER = 'task-monitor-api';
const ALG = 'HS256';

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days

export interface TokenClaims {
  sub: string;
  typ: 'access' | 'refresh';
  jti: string;
  name: string;
  role_id?: number | null;
}

export async function signToken(
  secret: Uint8Array,
  opts: {
    userId: number;
    typ: 'access' | 'refresh';
    name: string;
    roleId?: number | null;
    ttlSeconds: number;
  },
): Promise<string> {
  return new SignJWT({ typ: opts.typ, name: opts.name, role_id: opts.roleId ?? null })
    .setProtectedHeader({ alg: ALG })
    .setIssuer(ISSUER)
    .setSubject(String(opts.userId))
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${opts.ttlSeconds}s`)
    .sign(secret);
}

/** Returns the verified claims or null when invalid/expired. */
export async function verifyToken(
  secret: Uint8Array,
  token: string,
  expectedTyp: 'access' | 'refresh',
): Promise<TokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: ISSUER, algorithms: [ALG] });
    if (payload.typ !== expectedTyp || typeof payload.sub !== 'string') return null;
    return {
      sub: payload.sub,
      typ: payload.typ as TokenClaims['typ'],
      jti: typeof payload.jti === 'string' ? payload.jti : '',
      name: typeof payload.name === 'string' ? payload.name : '',
      role_id: typeof payload.role_id === 'number' ? payload.role_id : null,
    };
  } catch {
    return null;
  }
}
