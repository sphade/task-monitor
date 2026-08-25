import type { Context, Next } from 'hono';

import { ApiError } from '@/lib/http';
import { verifyToken } from '@/lib/jwt';
import { permissionsForUser } from '@/lib/rbac';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import type { AppEnv } from '@/types';

function bearerToken(c: Context<AppEnv>): string | null {
  const header = c.req.header('Authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

/** Loads the user row and their permission names for a verified access token. */
export async function authenticate(c: Context<AppEnv>, token: string): Promise<void> {
  const { services } = c.var;
  const claims = await verifyToken(services.jwtSecret, token, 'access');
  if (!claims) throw ApiError.unauthorized('Given token not valid for any user');

  const [user] = await services.db
    .select()
    .from(users)
    .where(eq(users.id, Number(claims.sub)))
    .limit(1);
  if (!user || !user.isActive) {
    throw ApiError.unauthorized('User inactive or deleted');
  }

  c.set('auth', {
    userId: user.id,
    username: user.username,
    name: user.name,
    roleId: user.roleId,
    isSuperuser: user.isSuperuser,
    permissions: await permissionsForUser(services.db, user),
  });
}

/** Strict middleware: 401 unless a valid Bearer token is presented. */
export async function requireAuth(c: Context<AppEnv>, next: Next): Promise<Response | void> {
  const token = bearerToken(c);
  if (!token) throw ApiError.unauthorized();
  await authenticate(c, token);
  await next();
}

/**
 * Guard factory — the handler only proceeds when the caller holds the
 * permission. Superusers bypass.
 */
export function requirePermission(permissionName: string) {
  return async (c: Context<AppEnv>, next: Next): Promise<Response | void> => {
    const auth = c.get('auth');
    if (!auth) throw ApiError.unauthorized();
    if (!auth.isSuperuser && !auth.permissions.has(permissionName)) {
      throw ApiError.forbidden();
    }
    await next();
  };
}
