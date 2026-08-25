import { and, eq, inArray } from 'drizzle-orm';

import { permissions, rolePermissions, roles, users } from '@/db/schema';
import type { Db } from '@/db/client';
import type { PermissionModule } from '@/types';

/**
 * RBAC helpers.
 *
 * Permissions are identified by name (e.g. `CAN_ASSIGN_TASKS`) exactly as the
 * Django API did — the mobile client gates UI on these names.
 */

/** Distinct permission modules granted to the role → allowed_modules/sidebar_modules. */
export async function roleModuleNames(
  db: Db,
  roleId: number | null,
): Promise<{ allowed: string[]; sidebar: string[] }> {
  if (!roleId) return { allowed: [], sidebar: [] };
  const rows = await db
    .select({ module: permissions.module })
    .from(rolePermissions)
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(rolePermissions.roleId, roleId));
  const allowed = [...new Set(rows.map((r) => r.module))];
  return { allowed, sidebar: allowed };
}

export async function permissionsForUser(db: Db, user: typeof users.$inferSelect): Promise<Set<string>> {
  if (!user.roleId) return new Set();
  const rows = await db
    .select({ name: permissions.name })
    .from(rolePermissions)
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(rolePermissions.roleId, user.roleId));
  return new Set(rows.map((r) => r.name));
}

export interface RoleDetailRow {
  id: number;
  name: string;
  code: string;
}

/** Replaces a role's permission set from a list of permission names. */
export async function setRolePermissionsByName(
  db: Db,
  roleId: number,
  names: string[],
): Promise<void> {
  await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
  if (names.length === 0) return;
  const found = await db
    .select({ id: permissions.id })
    .from(permissions)
    .where(inArray(permissions.name, names));
  if (found.length > 0) {
    await db
      .insert(rolePermissions)
      .values(found.map((p) => ({ roleId, permissionId: p.id })));
  }
}

export async function findRoleByName(db: Db, name: string) {
  const [role] = await db.select().from(roles).where(eq(roles.name, name)).limit(1);
  return role ?? null;
}

export async function userHasPermission(
  db: Db,
  userId: number,
  permissionName: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: permissions.id })
    .from(permissions)
    .innerJoin(rolePermissions, eq(rolePermissions.permissionId, permissions.id))
    .innerJoin(users, eq(users.roleId, rolePermissions.roleId))
    .where(and(eq(users.id, userId), eq(permissions.name, permissionName)))
    .limit(1);
  return rows.length > 0;
}

export type { PermissionModule };
