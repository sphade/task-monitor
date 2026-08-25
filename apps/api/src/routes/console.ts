import { and, asc, desc, eq, like, or, sql, type SQL } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';

import {
  auditLogs,
  departments,
  permissions,
  projects,
  rolePermissions,
  roles,
  tasks,
  users,
} from '@/db/schema';
import type { Db } from '@/db/client';
import { sweepOverdueTasks } from '@/routes/work';
import { writeAudit } from '@/lib/audit';
import { ApiError, firstOf, ok, pageOf, paging, zodFieldErrors, nowIso, likePattern } from '@/lib/http';
import { serializeStaff, type StaffDto } from '@/lib/serialize';
import { requireAuth, requirePermission } from '@/middleware/auth';
import { PERMISSION_MODULES, type AppEnv } from '@/types';

async function staffDtos(db: Db, where: SQL | undefined): Promise<StaffDto[]> {
  const rows = await db
    .select({ user: users, roleName: roles.name, departmentName: departments.name })
    .from(users)
    .leftJoin(roles, eq(roles.id, users.roleId))
    .leftJoin(departments, eq(departments.id, users.departmentId))
    .where(where)
    .orderBy(asc(users.name));
  return rows.map((r) =>
    serializeStaff(r.user, { roleName: r.roleName, departmentName: r.departmentName }),
  );
}

export function consoleRoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use('*', requireAuth);

  // ── Dashboard overview ──────────────────────────────────────────────────
  app.get('/dashboard/overview/', async (c) => {
    const { services } = c.var;
    // Keep the aggregates consistent with task reads (which also sweep).
    await sweepOverdueTasks(services.db);

    const [taskCounts] = await services.db
      .select({
        total: sql<number>`COUNT(*)`,
        completed: sql<number>`SUM(CASE WHEN ${tasks.status} = 'completed' THEN 1 ELSE 0 END)`,
        inProgress: sql<number>`SUM(CASE WHEN ${tasks.status} = 'in_progress' THEN 1 ELSE 0 END)`,
        overdue: sql<number>`SUM(CASE WHEN ${tasks.status} = 'overdue' THEN 1 ELSE 0 END)`,
        pending: sql<number>`SUM(CASE WHEN ${tasks.status} = 'pending' THEN 1 ELSE 0 END)`,
      })
      .from(tasks);

    const { activeProjects } = firstOf(await services.db
      .select({ activeProjects: sql<number>`COUNT(*)` })
      .from(projects)
      .where(eq(projects.status, 'active')));

    const { staffCount } = firstOf(await services.db
      .select({ staffCount: sql<number>`COUNT(*)` })
      .from(users)
      .where(eq(users.isActive, true)));

    const recentRows = await services.db
      .select({ task: tasks, assigneeName: users.name })
      .from(tasks)
      .innerJoin(users, eq(users.id, tasks.assignedTo))
      .orderBy(desc(tasks.createdAt))
      .limit(5);

    return ok(
      c,
      {
        total_tasks: taskCounts?.total ?? 0,
        completed_tasks: taskCounts?.completed ?? 0,
        in_progress_tasks: taskCounts?.inProgress ?? 0,
        overdue_tasks: taskCounts?.overdue ?? 0,
        pending_tasks: taskCounts?.pending ?? 0,
        active_projects: activeProjects,
        staff_count: staffCount,
        recent_tasks: recentRows.map((r) => ({
          id: r.task.id,
          title: r.task.title,
          status: r.task.status,
          priority: r.task.priority,
          assigned_to: r.assigneeName,
          deadline: r.task.deadline,
        })),
      },
      'Dashboard overview',
    );
  });

  // ── Staff ───────────────────────────────────────────────────────────────
  app.get('/staff/', async (c) => {
    const { services } = c.var;
    const q = c.req.query();

    const conditions = [];
    if (q['department']) conditions.push(eq(users.departmentId, Number(q['department'])));
    if (q['role']) conditions.push(eq(users.roleId, Number(q['role'])));
    if (q['is_active'] !== undefined && q['is_active'] !== '') {
      conditions.push(eq(users.isActive, q['is_active'] === 'true'));
    }
    const search = likePattern(q['search']);
    if (search) {
      conditions.push(
        or(
          like(sql`LOWER(${users.name})`, sql`LOWER(${search})`),
          like(sql`LOWER(${users.email})`, sql`LOWER(${search})`),
        )!,
      );
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // The mobile client renders whatever comes back; pagination is honoured.
    const all = await staffDtos(services.db, where);
    const { size, offset } = paging(c);
    const results = all.slice(offset, offset + size);
    return c.json(pageOf(results, all.length));
  });

  app.get('/staff/:id/', async (c) => {
    const id = Number(c.req.param('id'));
    const dtos = await staffDtos(c.var.services.db, eq(users.id, id));
    if (dtos.length === 0 || !dtos[0]) throw ApiError.notFound();
    return ok(c, dtos[0], 'Staff member retrieved');
  });

  app.patch('/staff/:id/', requirePermission('CAN_MANAGE_STAFF'), async (c) => {
    const id = Number(c.req.param('id'));
    const schema = z.object({
      name: z.string().trim().min(2).max(255).optional(),
      email: z.string().trim().toLowerCase().email().optional(),
      employee_id: z.string().trim().max(20).nullish(),
      is_active: z.boolean().optional(),
      role: z.number().int().positive().nullish(),
      department: z.number().int().positive().nullish(),
      location: z.enum(['headquarters', 'branch_office', 'regional_office', 'remote']).optional(),
    });
    const parsed = schema.safeParse(await c.req.json());
    if (!parsed.success) throw ApiError.fieldErrors(zodFieldErrors(parsed.error));
    const d = parsed.data;

    const { services, auth } = c.var;
    if (d.role) {
      const [role] = await services.db.select().from(roles).where(eq(roles.id, d.role)).limit(1);
      if (!role) throw ApiError.fieldErrors({ role: ['Invalid role.'] });
    }

    const [updated] = await services.db
      .update(users)
      .set({
        ...(d.name !== undefined && { name: d.name }),
        ...(d.email !== undefined && { email: d.email }),
        ...(d.employee_id !== undefined && { employeeId: d.employee_id ?? null }),
        ...(d.is_active !== undefined && { isActive: d.is_active }),
        ...(d.role !== undefined && { roleId: d.role ?? null }),
        ...(d.department !== undefined && { departmentId: d.department ?? null }),
        ...(d.location !== undefined && { location: d.location }),
        updatedAt: nowIso(),
      })
      .where(eq(users.id, id))
      .returning();
    if (!updated) throw ApiError.notFound();

    await writeAudit(services.db, {
      userId: auth.userId,
      actorName: auth.name,
      module: 'HR_SETTINGS',
      action: 'STAFF_UPDATED',
      description: `Updated profile for ${updated.email}`,
    });
    return ok(c, {}, 'Member updated successfully');
  });

  /** Deactivate rather than hard-delete — history must survive. */
  app.delete('/staff/:id/', requirePermission('CAN_MANAGE_STAFF'), async (c) => {
    const id = Number(c.req.param('id'));
    if (id === c.var.auth.userId) {
      throw ApiError.badRequest('You cannot deactivate your own account.');
    }
    const { services, auth } = c.var;
    const [updated] = await services.db
      .update(users)
      .set({ isActive: false, updatedAt: nowIso() })
      .where(eq(users.id, id))
      .returning();
    if (!updated) throw ApiError.notFound();

    await writeAudit(services.db, {
      userId: auth.userId,
      actorName: auth.name,
      module: 'HR_SETTINGS',
      action: 'STAFF_DEACTIVATED',
      description: `Deactivated ${updated.email}`,
    });
    return ok(c, {}, 'Member deactivated');
  });

  // ── Departments ─────────────────────────────────────────────────────────
  app.get('/departments/', async (c) => {
    const rows = await c.var.services.db.select().from(departments).orderBy(asc(departments.name));
    return c.json(rows);
  });

  app.post('/departments/', requirePermission('CAN_MANAGE_DEPARTMENTS'), async (c) => {
    const schema = z.object({
      name: z.string().trim().min(1).max(255),
      description: z.string().nullish(),
    });
    const parsed = schema.safeParse(await c.req.json());
    if (!parsed.success) throw ApiError.fieldErrors(zodFieldErrors(parsed.error));

    const { services, auth } = c.var;
    const now = nowIso();
    try {
      const [created] = await services.db
        .insert(departments)
        .values({
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      await writeAudit(services.db, {
        userId: auth.userId,
        actorName: auth.name,
        module: 'DEPARTMENTS',
        action: 'DEPARTMENT_CREATED',
        description: `Created department ${created!.name}`,
      });
      return ok(c, created, 'Department created successfully');
    } catch {
      throw ApiError.fieldErrors({ name: ['A department with this name already exists.'] });
    }
  });

  app.patch('/departments/:id/', requirePermission('CAN_MANAGE_DEPARTMENTS'), async (c) => {
    const id = Number(c.req.param('id'));
    const schema = z.object({
      name: z.string().trim().min(1).max(255).optional(),
      description: z.string().nullish(),
      is_active: z.boolean().optional(),
    });
    const parsed = schema.safeParse(await c.req.json());
    if (!parsed.success) throw ApiError.fieldErrors(zodFieldErrors(parsed.error));

    const [updated] = await c.var.services.db
      .update(departments)
      .set({
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        ...(parsed.data.description !== undefined && {
          description: parsed.data.description ?? null,
        }),
        ...(parsed.data.is_active !== undefined && { isActive: parsed.data.is_active }),
        updatedAt: nowIso(),
      })
      .where(eq(departments.id, id))
      .returning();
    if (!updated) throw ApiError.notFound();
    return ok(c, updated, 'Department updated successfully');
  });

  app.delete('/departments/:id/', requirePermission('CAN_MANAGE_DEPARTMENTS'), async (c) => {
    const id = Number(c.req.param('id'));
    const { services, auth } = c.var;
    const { staffCount } = firstOf(await services.db
      .select({ staffCount: sql<number>`COUNT(*)` })
      .from(users)
      .where(eq(users.departmentId, id)));
    if ((staffCount ?? 0) > 0) {
      throw ApiError.badRequest('Cannot delete a department that still has staff.');
    }
    const [deleted] = await services.db.delete(departments).where(eq(departments.id, id)).returning();
    if (!deleted) throw ApiError.notFound();

    await writeAudit(services.db, {
      userId: auth.userId,
      actorName: auth.name,
      module: 'DEPARTMENTS',
      action: 'DEPARTMENT_DELETED',
      description: `Deleted department ${deleted.name}`,
    });
    return ok(c, {}, 'Department deleted successfully');
  });

  // ── Roles & permissions ─────────────────────────────────────────────────
  app.get('/roles/', async (c) => {
    const { services } = c.var;
    const roleRows = await services.db.select().from(roles).orderBy(asc(roles.name));

    const results = [];
    for (const role of roleRows) {
      const perms = await services.db
        .select({
          id: permissions.id,
          name: permissions.name,
          module: permissions.module,
        })
        .from(rolePermissions)
        .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
        .where(eq(rolePermissions.roleId, role.id))
        .orderBy(asc(permissions.module), asc(permissions.name));

      const parentName = role.parentId
        ? (
            await services.db
              .select({ name: roles.name })
              .from(roles)
              .where(eq(roles.id, role.parentId))
              .limit(1)
          )[0]?.name ?? ''
        : '';
      const modules = [...new Set(perms.map((p) => p.module))];

      results.push({
        id: role.id,
        name: role.name,
        code: role.code,
        description: role.description ?? '',
        allowed_modules: modules,
        sidebar_modules: modules,
        permission_details: perms,
        parent: role.parentId,
        parent_name: parentName,
        create_once: role.createOnce,
        created_at: role.createdAt,
        updated_at: role.updatedAt,
      });
    }
    return c.json(pageOf(results, results.length));
  });

  app.post('/roles/', requirePermission('CAN_MANAGE_ROLES'), async (c) => {
    const schema = z.object({
      name: z.string().trim().min(1).max(255),
      code: z
        .string()
        .trim()
        .min(1)
        .max(64)
        .regex(/^[A-Z0-9_]+$/, 'Uppercase letters, digits and underscores only.'),
      description: z.string().nullish(),
      permissions: z.array(z.string()).default([]),
      parent: z.number().int().positive().nullish(),
    });
    const parsed = schema.safeParse(await c.req.json());
    if (!parsed.success) throw ApiError.fieldErrors(zodFieldErrors(parsed.error));

    const { services, auth } = c.var;
    const now = nowIso();
    let createdId: number | undefined;
    try {
      const [created] = await services.db
        .insert(roles)
        .values({
          name: parsed.data.name,
          code: parsed.data.code,
          description: parsed.data.description ?? '',
          parentId: parsed.data.parent ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      createdId = created!.id;
    } catch {
      throw ApiError.fieldErrors({
        name: ['A role with this name or code already exists.'],
      });
    }

    for (const permName of parsed.data.permissions) {
      const [perm] = await services.db
        .select()
        .from(permissions)
        .where(eq(permissions.name, permName))
        .limit(1);
      if (perm) {
        await services.db.insert(rolePermissions).values({ roleId: createdId!, permissionId: perm.id });
      }
    }

    await writeAudit(services.db, {
      userId: auth.userId,
      actorName: auth.name,
      module: 'ROLES',
      action: 'ROLE_CREATED',
      description: `Created role ${parsed.data.name}`,
    });
    return ok(c, { id: createdId }, 'Role created successfully');
  });

  app.patch('/roles/:id/', requirePermission('CAN_MANAGE_ROLES'), async (c) => {
    const id = Number(c.req.param('id'));
    const schema = z.object({
      name: z.string().trim().min(1).max(255).optional(),
      description: z.string().nullish(),
      add_permissions: z.array(z.string()).optional(),
      remove_permissions: z.array(z.string()).optional(),
    });
    const parsed = schema.safeParse(await c.req.json());
    if (!parsed.success) throw ApiError.fieldErrors(zodFieldErrors(parsed.error));

    const { services, auth } = c.var;
    const [existing] = await services.db.select().from(roles).where(eq(roles.id, id)).limit(1);
    if (!existing) throw ApiError.notFound();

    await services.db
      .update(roles)
      .set({
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        ...(parsed.data.description !== undefined && {
          description: parsed.data.description ?? '',
        }),
        updatedAt: nowIso(),
      })
      .where(eq(roles.id, id));

    const applyPerms = async (names: string[], grant: boolean) => {
      for (const name of names) {
        const [perm] = await services.db
          .select()
          .from(permissions)
          .where(eq(permissions.name, name))
          .limit(1);
        if (!perm) continue;
        if (grant) {
          await services.db
            .insert(rolePermissions)
            .values({ roleId: id, permissionId: perm.id })
            .onConflictDoNothing();
        } else {
          await services.db
            .delete(rolePermissions)
            .where(and(eq(rolePermissions.roleId, id), eq(rolePermissions.permissionId, perm.id)));
        }
      }
    };
    if (parsed.data.add_permissions) await applyPerms(parsed.data.add_permissions, true);
    if (parsed.data.remove_permissions) await applyPerms(parsed.data.remove_permissions, false);

    await writeAudit(services.db, {
      userId: auth.userId,
      actorName: auth.name,
      module: 'ROLES',
      action: 'ROLE_UPDATED',
      description: `Updated role ${existing.name}`,
    });
    return ok(c, {}, 'Role updated successfully');
  });

  app.delete('/roles/:id/', requirePermission('CAN_MANAGE_ROLES'), async (c) => {
    const id = Number(c.req.param('id'));
    const { services, auth } = c.var;
    const { holders } = firstOf(await services.db
      .select({ holders: sql<number>`COUNT(*)` })
      .from(users)
      .where(eq(users.roleId, id)));
    if ((holders ?? 0) > 0) {
      throw ApiError.badRequest('Cannot delete a role that still has members.');
    }
    const [deleted] = await services.db.delete(roles).where(eq(roles.id, id)).returning();
    if (!deleted) throw ApiError.notFound();

    await writeAudit(services.db, {
      userId: auth.userId,
      actorName: auth.name,
      module: 'ROLES',
      action: 'ROLE_DELETED',
      description: `Deleted role ${deleted.name}`,
    });
    return ok(c, {}, 'Role deleted successfully');
  });

  /** POST /roles/{id}/add-permissions/ — DRF-style action route kept for parity. */
  app.post('/roles/:id/add-permissions/', requirePermission('CAN_MANAGE_ROLES'), async (c) => {
    const id = Number(c.req.param('id'));
    const schema = z.object({ permissions: z.array(z.string()).min(1) });
    const parsed = schema.safeParse(await c.req.json());
    if (!parsed.success) throw ApiError.fieldErrors(zodFieldErrors(parsed.error));

    const { services } = c.var;
    for (const name of parsed.data.permissions) {
      const [perm] = await services.db
        .select()
        .from(permissions)
        .where(eq(permissions.name, name))
        .limit(1);
      if (perm) {
        await services.db
          .insert(rolePermissions)
          .values({ roleId: id, permissionId: perm.id })
          .onConflictDoNothing();
      }
    }
    return ok(c, {}, 'Permissions added');
  });

  app.post('/roles/:id/remove-permissions/', requirePermission('CAN_MANAGE_ROLES'), async (c) => {
    const id = Number(c.req.param('id'));
    const schema = z.object({ permissions: z.array(z.string()).min(1) });
    const parsed = schema.safeParse(await c.req.json());
    if (!parsed.success) throw ApiError.fieldErrors(zodFieldErrors(parsed.error));

    const { services } = c.var;
    for (const name of parsed.data.permissions) {
      const [perm] = await services.db
        .select()
        .from(permissions)
        .where(eq(permissions.name, name))
        .limit(1);
      if (perm) {
        await services.db
          .delete(rolePermissions)
          .where(and(eq(rolePermissions.roleId, id), eq(rolePermissions.permissionId, perm.id)));
      }
    }
    return ok(c, {}, 'Permissions removed');
  });

  app.get('/permissions/', async (c) => {
    const moduleFilter = c.req.query('module')?.toUpperCase();
    const where =
      moduleFilter && (PERMISSION_MODULES as readonly string[]).includes(moduleFilter)
        ? eq(permissions.module, moduleFilter)
        : undefined;
    const rows = await c.var.services.db
      .select()
      .from(permissions)
      .where(where)
      .orderBy(asc(permissions.module), asc(permissions.name));
    return c.json(pageOf(rows, rows.length));
  });

  /** Lightweight assignee picker feed. */
  app.get('/user-dropdown/', async (c) => {
    const rows = await c.var.services.db
      .select({ id: users.id, label: users.name, email: users.email })
      .from(users)
      .where(eq(users.isActive, true))
      .orderBy(asc(users.name));
    return c.json(rows);
  });

  return app;
}

export function auditRoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use('*', requireAuth);

  app.get('/', listAuditLogs);

  return app;
}

/** GET /v1/audit/ — filterable, newest first. Also mounted at parent level. */
export async function listAuditLogs(c: Context<AppEnv>): Promise<Response> {
  const { services } = c.var;
  const { size, offset } = paging(c);
  const q = c.req.query();

  const conditions = [];
  if (q['module']) conditions.push(eq(auditLogs.module, q['module'].toUpperCase()));
  if (q['user']) conditions.push(eq(auditLogs.userId, Number(q['user'])));
  const search = likePattern(q['search']);
  if (search) conditions.push(like(sql`LOWER(${auditLogs.description})`, sql`LOWER(${search})`));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await services.db
    .select()
    .from(auditLogs)
    .where(where)
    .orderBy(desc(auditLogs.createdAt))
    .limit(size)
    .offset(offset);
  const { total } = firstOf(
    await services.db.select({ total: sql<number>`COUNT(*)` }).from(auditLogs).where(where),
  );

  const results = rows.map((r) => ({
    id: r.id,
    user: r.userId,
    actor_name: r.actorName,
    audit_module: r.module,
    audit_type: r.action,
    description: r.description,
    ip_address: r.ipAddress,
    created_at: r.createdAt,
  }));
  return c.json(pageOf(results, total));
}
