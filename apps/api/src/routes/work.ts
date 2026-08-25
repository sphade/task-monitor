import { and, asc, desc, eq, inArray, like, or, sql, type SQL } from 'drizzle-orm';
import { alias, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { Hono } from 'hono';
import { z } from 'zod';

import { projects, reports, roles, tasks, users } from '@/db/schema';
import type { Db } from '@/db/client';
import { writeAudit } from '@/lib/audit';
import { ApiError, firstOf, ok, pageOf, paging, zodFieldErrors, nowIso, likePattern } from '@/lib/http';
import { serializeReport, serializeTask, type ReportDto, type TaskDto } from '@/lib/serialize';
import { requireAuth, requirePermission } from '@/middleware/auth';
import type { AppEnv } from '@/types';

const TASK_STATUSES = ['pending', 'in_progress', 'completed', 'overdue'] as const;
const PRIORITIES = ['low', 'medium', 'high'] as const;
const REPORT_STATUSES = ['pending', 'in-progress', 'done'] as const;

const assignee = alias(users, 'assignee');
const assigner = alias(users, 'assigner');

/**
 * Flips lapsed tasks to `overdue` so boards stay accurate without waiting for
 * the hourly cron. Cheap single UPDATE, run alongside task reads.
 */
export async function sweepOverdueTasks(db: Db): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await db
    .update(tasks)
    .set({ status: 'overdue', updatedAt: nowIso() })
    .where(
      and(
        sql`${tasks.deadline} IS NOT NULL AND ${tasks.deadline} < ${today}`,
        or(eq(tasks.status, 'pending'), eq(tasks.status, 'in_progress')),
      ),
    );
}

async function loadTaskDtos(
  db: Db,
  where: SQL | undefined,
  orderBy: SQL,
  limit?: number,
  offset?: number,
): Promise<TaskDto[]> {
  const rows = await db
    .select({
      task: tasks,
      assigneeName: assignee.name,
      assigneeRoleName: roles.name,
      assignerName: assigner.name,
    })
    .from(tasks)
    .innerJoin(assignee, eq(assignee.id, tasks.assignedTo))
    .leftJoin(roles, eq(roles.id, assignee.roleId))
    .innerJoin(assigner, eq(assigner.id, tasks.assignedBy))
    .where(where)
    .orderBy(orderBy)
    .limit(limit ?? -1)
    .offset(offset ?? 0);

  return rows.map((r) =>
    serializeTask(r.task, {
      assigneeName: r.assigneeName,
      assignerName: r.assignerName,
      assigneeRole: r.assigneeRoleName ?? 'No Role Assigned',
    }),
  );
}

export function workRoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // Scoped (not '*') so this mounted sub-app never intercepts sibling
  // /v1/* routes like /health-check.
  app.use('/tasks/*', requireAuth);
  app.use('/tasks', requireAuth);
  app.use('/reports/*', requireAuth);
  app.use('/reports', requireAuth);

  // ── Projects ────────────────────────────────────────────────────────────
  app.get('/tasks/projects/', async (c) => {
    const { services } = c.var;
    const { size, offset } = paging(c);
    const search = likePattern(c.req.query('search'));

    const where = search
      ? or(like(projects.name, search), like(sql`COALESCE(${projects.description}, '')`, search))
      : undefined;

    const rows = await services.db
      .select()
      .from(projects)
      .where(where)
      .orderBy(desc(projects.createdAt))
      .limit(size)
      .offset(offset);
    const { total } = firstOf(await services.db
      .select({ total: sql<number>`COUNT(*)` })
      .from(projects)
      .where(where));

    return c.json(pageOf(rows, total));
  });

  app.post('/tasks/projects/', async (c) => {
    const schema = z.object({
      name: z.string().trim().min(1).max(255),
      description: z.string().nullish(),
      start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
      deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
    });
    const parsed = schema.safeParse(await c.req.json());
    if (!parsed.success) throw ApiError.fieldErrors(zodFieldErrors(parsed.error));

    const { services, auth } = c.var;
    const now = nowIso();
    const [created] = await services.db
      .insert(projects)
      .values({
        id: crypto.randomUUID(),
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        startDate: parsed.data.start_date ?? null,
        deadline: parsed.data.deadline ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await writeAudit(services.db, {
      userId: auth.userId,
      actorName: auth.name,
      module: 'TASKS',
      action: 'PROJECT_CREATED',
      description: `Created project ${created!.name}`,
    });
    return ok(c, created, 'Project created successfully');
  });

  app.get('/tasks/projects/:id/', async (c) => {
    const projectId = c.req.param('id');
    const [project] = await c.var.services.db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) throw ApiError.notFound();
    return ok(c, project, 'Project retrieved');
  });

  app.patch('/tasks/projects/:id/', async (c) => {
    const projectId = c.req.param('id');
    const schema = z.object({
      name: z.string().trim().min(1).max(255).optional(),
      description: z.string().nullish(),
      start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
      deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
      status: z.enum(['active', 'completed', 'archived']).optional(),
    });
    const parsed = schema.safeParse(await c.req.json());
    if (!parsed.success) throw ApiError.fieldErrors(zodFieldErrors(parsed.error));
    const d = parsed.data;

    const { services, auth } = c.var;
    const [updated] = await services.db
      .update(projects)
      .set({
        ...(d.name !== undefined && { name: d.name }),
        ...(d.description !== undefined && { description: d.description ?? null }),
        ...(d.start_date !== undefined && { startDate: d.start_date ?? null }),
        ...(d.deadline !== undefined && { deadline: d.deadline ?? null }),
        ...(d.status !== undefined && { status: d.status }),
        updatedAt: nowIso(),
      })
      .where(eq(projects.id, projectId))
      .returning();
    if (!updated) throw ApiError.notFound();

    await writeAudit(services.db, {
      userId: auth.userId,
      actorName: auth.name,
      module: 'TASKS',
      action: 'PROJECT_UPDATED',
      description: `Updated project ${updated.name}`,
    });
    return ok(c, updated, 'Project updated successfully');
  });

  app.delete('/tasks/projects/:id/', requirePermission('CAN_ASSIGN_TASKS'), async (c) => {
    const projectId = c.req.param('id');
    if (!projectId) throw ApiError.notFound();
    const { services, auth } = c.var;
    const [deleted] = await services.db
      .delete(projects)
      .where(eq(projects.id, projectId))
      .returning();
    if (!deleted) throw ApiError.notFound();

    await writeAudit(services.db, {
      userId: auth.userId,
      actorName: auth.name,
      module: 'TASKS',
      action: 'PROJECT_DELETED',
      description: `Deleted project ${deleted.name}`,
    });
    return ok(c, {}, 'Project deleted successfully');
  });

  // ── Tasks ───────────────────────────────────────────────────────────────
  app.get('/tasks/', async (c) => {
    const { services } = c.var;
    await sweepOverdueTasks(services.db);

    const { size, offset } = paging(c);
    const q = c.req.query();

    const conditions = [];
    if (q['status']) conditions.push(inList(tasks.status, q['status'], TASK_STATUSES, 'status'));
    if (q['priority']) conditions.push(inList(tasks.priority, q['priority'], PRIORITIES, 'priority'));
    if (q['project_id']) conditions.push(eq(tasks.projectId, q['project_id']));
    if (q['assignee']) {
      const id = Number(q['assignee']);
      if (!Number.isInteger(id)) throw ApiError.fieldErrors({ assignee: ['Invalid user id.'] });
      conditions.push(eq(tasks.assignedTo, id));
    }
    const search = likePattern(q['search']);
    if (search) {
      conditions.push(or(like(tasks.title, search), like(sql`COALESCE(${tasks.description}, '')`, search))!);
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const ordering = ORDERINGS.get(q['ordering'] ?? '') ?? desc(tasks.createdAt);

    const results = await loadTaskDtos(services.db, where, ordering, size, offset);
    const { total } = firstOf(await services.db
      .select({ total: sql<number>`COUNT(*)` })
      .from(tasks)
      .where(where));

    return c.json(pageOf(results, total));
  });

  app.post('/tasks/', requirePermission('CAN_ASSIGN_TASKS'), async (c) => {
    const schema = z.object({
      project: z.string().min(1),
      title: z.string().trim().min(1).max(255),
      description: z.string().nullish(),
      assigned_to: z.number().int().positive(),
      assigned_by: z.number().int().positive().optional(),
      priority: z.enum(PRIORITIES).optional(),
      status: z.enum(TASK_STATUSES).optional(),
      deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
    });
    const parsed = schema.safeParse(await c.req.json());
    if (!parsed.success) throw ApiError.fieldErrors(zodFieldErrors(parsed.error));
    const input = parsed.data;

    const { services, auth } = c.var;
    const [project] = await services.db
      .select()
      .from(projects)
      .where(eq(projects.id, input.project))
      .limit(1);
    if (!project) throw ApiError.fieldErrors({ project: ['Invalid project.'] });

    const [target] = await services.db
      .select()
      .from(users)
      .where(eq(users.id, input.assigned_to))
      .limit(1);
    if (!target) throw ApiError.fieldErrors({ assigned_to: ['Invalid user.'] });

    // Only the superuser may create on behalf of someone else.
    const assignedBy =
      input.assigned_by && auth.isSuperuser ? input.assigned_by : auth.userId;

    const now = nowIso();
    const status = input.status ?? 'pending';
    const [created] = await services.db
      .insert(tasks)
      .values({
        projectId: input.project,
        title: input.title,
        description: input.description ?? null,
        assignedTo: target.id,
        assignedBy,
        priority: input.priority ?? 'medium',
        status,
        startedAt: status === 'in_progress' ? now : null,
        completedAt: status === 'completed' ? now : null,
        deadline: input.deadline ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await writeAudit(services.db, {
      userId: auth.userId,
      actorName: auth.name,
      module: 'TASKS',
      action: 'TASK_CREATED',
      description: `Assigned "${created!.title}" to ${target.name}`,
    });
    return ok(c, { id: created!.id }, 'Task created successfully');
  });

  app.get('/tasks/:id/', async (c) => {
    const id = parseId(c.req.param('id'));
    const { services } = c.var;
    await sweepOverdueTasks(services.db);

    const dtos = await loadTaskDtos(services.db, eq(tasks.id, id), desc(tasks.createdAt), 1);
    if (dtos.length === 0) throw ApiError.notFound();
    return ok(c, dtos[0], 'Task retrieved');
  });

  app.patch('/tasks/:id/', async (c) => {
    const id = parseId(c.req.param('id'));
    const schema = z.object({
      title: z.string().trim().min(1).max(255).optional(),
      description: z.string().nullish(),
      assigned_to: z.number().int().positive().optional(),
      priority: z.enum(PRIORITIES).optional(),
      status: z.enum(TASK_STATUSES).optional(),
      deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
      project: z.string().optional(),
    });
    const parsed = schema.safeParse(await c.req.json());
    if (!parsed.success) throw ApiError.fieldErrors(zodFieldErrors(parsed.error));
    const d = parsed.data;

    const { services, auth } = c.var;
    const [existing] = await services.db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    if (!existing) throw ApiError.notFound();

    // Assignees can move their own cards; only CAN_UPDATE_TASKS can edit more.
    const isAssignee = existing.assignedTo === auth.userId;
    if (!isAssignee && !auth.isSuperuser && !auth.permissions.has('CAN_UPDATE_TASKS')) {
      throw ApiError.forbidden();
    }
    if (isAssignee && d.assigned_to && d.assigned_to !== existing.assignedTo) {
      if (!auth.isSuperuser && !auth.permissions.has('CAN_ASSIGN_TASKS')) {
        throw ApiError.forbidden('You cannot reassign this task.');
      }
    }

    if (d.assigned_to) {
      const [target] = await services.db
        .select()
        .from(users)
        .where(eq(users.id, d.assigned_to))
        .limit(1);
      if (!target) throw ApiError.fieldErrors({ assigned_to: ['Invalid user.'] });
    }

    const now = nowIso();
    const nextStatus = d.status ?? existing.status;
    await services.db
      .update(tasks)
      .set({
        ...(d.title !== undefined && { title: d.title }),
        ...(d.description !== undefined && { description: d.description ?? null }),
        ...(d.assigned_to !== undefined && { assignedTo: d.assigned_to }),
        ...(d.priority !== undefined && { priority: d.priority }),
        ...(d.status !== undefined && { status: d.status }),
        ...(d.deadline !== undefined && { deadline: d.deadline ?? null }),
        ...(d.project !== undefined && { projectId: d.project }),
        // Mirrors the Django model's save(): stamp lifecycle timestamps once.
        startedAt:
          nextStatus === 'in_progress' && existing.startedAt === null ? now : existing.startedAt,
        completedAt:
          nextStatus === 'completed' && existing.completedAt === null ? now : existing.completedAt,
        updatedAt: now,
      })
      .where(eq(tasks.id, id));

    await writeAudit(services.db, {
      userId: auth.userId,
      actorName: auth.name,
      module: 'TASKS',
      action: 'TASK_UPDATED',
      description: `Updated task "${existing.title}"${d.status ? ` → ${d.status}` : ''}`,
    });
    return ok(c, {}, 'Task updated successfully');
  });

  app.delete('/tasks/:id/', requirePermission('CAN_DELETE_TASKS'), async (c) => {
    const id = parseId(c.req.param('id'));
    const { services, auth } = c.var;
    const [deleted] = await services.db.delete(tasks).where(eq(tasks.id, id)).returning();
    if (!deleted) throw ApiError.notFound();

    await writeAudit(services.db, {
      userId: auth.userId,
      actorName: auth.name,
      module: 'TASKS',
      action: 'TASK_DELETED',
      description: `Deleted task "${deleted.title}"`,
    });
    return ok(c, {}, 'Task deleted successfully');
  });

  // ── Reports ─────────────────────────────────────────────────────────────
  app.get('/reports/', async (c) => {
    const { services } = c.var;
    const { size, offset } = paging(c);
    const q = c.req.query();

    const conditions = [];
    if (q['status']) conditions.push(inList(reports.status, q['status'], REPORT_STATUSES, 'status'));
    if (q['parent_task']) conditions.push(eq(reports.parentTaskId, Number(q['parent_task'])));
    if (q['mine'] === 'true') conditions.push(eq(reports.senderId, c.var.auth.userId));
    const search = likePattern(q['search']);
    if (search) {
      conditions.push(
        or(like(sql`NULLIF(${reports.note}, '')`, search), like(sql`NULLIF(${reports.title}, '')`, search))!,
      );
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await services.db
      .select({
        report: reports,
        sender: users,
        roleName: roles.name,
      })
      .from(reports)
      .leftJoin(users, eq(users.id, reports.senderId))
      .leftJoin(roles, eq(roles.id, users.roleId))
      .where(where)
      .orderBy(desc(reports.createdAt))
      .limit(size)
      .offset(offset);

    const { total } = firstOf(await services.db
      .select({ total: sql<number>`COUNT(*)` })
      .from(reports)
      .where(where));

    const results: ReportDto[] = rows.map((r) =>
      serializeReport(r.report, r.sender ?? null, r.roleName ?? null),
    );
    return c.json(pageOf(results, total));
  });

  app.post('/reports/', requirePermission('CAN_CREATE_REPORTS'), async (c) => {
    const schema = z.object({
      parent_task: z.number().int().positive(),
      note: z.string().trim().min(1),
      title: z.string().trim().max(255).optional(),
      status: z.enum(REPORT_STATUSES).optional(),
    });
    const parsed = schema.safeParse(await c.req.json());
    if (!parsed.success) throw ApiError.fieldErrors(zodFieldErrors(parsed.error));

    const { services, auth } = c.var;
    const [parent] = await services.db
      .select()
      .from(tasks)
      .where(eq(tasks.id, parsed.data.parent_task))
      .limit(1);
    if (!parent) throw ApiError.fieldErrors({ parent_task: ['Invalid parent task.'] });

    const now = nowIso();
    const [created] = await services.db
      .insert(reports)
      .values({
        senderId: auth.userId,
        title: parsed.data.title ?? parent.title,
        status: parsed.data.status ?? 'pending',
        note: parsed.data.note,
        parentTaskId: parent.id,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await writeAudit(services.db, {
      userId: auth.userId,
      actorName: auth.name,
      module: 'REPORTS',
      action: 'REPORT_CREATED',
      description: `Submitted a report on "${parent.title}"`,
    });
    return ok(c, { id: created!.id }, 'Report submitted successfully');
  });

  app.get('/reports/:id/', async (c) => {
    const id = parseId(c.req.param('id'));
    const { services } = c.var;
    const rows = await services.db
      .select({ report: reports, sender: users, roleName: roles.name })
      .from(reports)
      .leftJoin(users, eq(users.id, reports.senderId))
      .leftJoin(roles, eq(roles.id, users.roleId))
      .where(eq(reports.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) throw ApiError.notFound();
    return ok(c, serializeReport(row.report, row.sender ?? null, row.roleName ?? null), 'Report retrieved');
  });

  app.patch('/reports/:id/', async (c) => {
    const id = parseId(c.req.param('id'));
    const schema = z.object({
      note: z.string().trim().min(1).optional(),
      status: z.enum(REPORT_STATUSES).optional(),
      title: z.string().trim().max(255).optional(),
    });
    const parsed = schema.safeParse(await c.req.json());
    if (!parsed.success) throw ApiError.fieldErrors(zodFieldErrors(parsed.error));

    const { services, auth } = c.var;
    const [existing] = await services.db.select().from(reports).where(eq(reports.id, id)).limit(1);
    if (!existing) throw ApiError.notFound();

    const isOwner = existing.senderId === auth.userId;
    if (
      !isOwner &&
      !auth.isSuperuser &&
      !auth.permissions.has('CAN_UPDATE_REPORTS')
    ) {
      throw ApiError.forbidden();
    }

    await services.db
      .update(reports)
      .set({
        ...(parsed.data.note !== undefined && { note: parsed.data.note }),
        ...(parsed.data.status !== undefined && { status: parsed.data.status }),
        ...(parsed.data.title !== undefined && { title: parsed.data.title }),
        updatedAt: nowIso(),
      })
      .where(eq(reports.id, id));

    await writeAudit(services.db, {
      userId: auth.userId,
      actorName: auth.name,
      module: 'REPORTS',
      action: 'REPORT_UPDATED',
      description: `Updated report #${id}`,
    });
    return ok(c, {}, 'Report updated successfully');
  });

  app.delete('/reports/:id/', async (c) => {
    const id = parseId(c.req.param('id'));
    const { services, auth } = c.var;
    const [existing] = await services.db.select().from(reports).where(eq(reports.id, id)).limit(1);
    if (!existing) throw ApiError.notFound();

    const isOwner = existing.senderId === auth.userId;
    if (!isOwner && !auth.isSuperuser && !auth.permissions.has('CAN_DELETE_REPORTS')) {
      throw ApiError.forbidden();
    }

    await services.db.delete(reports).where(eq(reports.id, id));
    await writeAudit(services.db, {
      userId: auth.userId,
      actorName: auth.name,
      module: 'REPORTS',
      action: 'REPORT_DELETED',
      description: `Deleted report #${id}`,
    });
    return ok(c, {}, 'Report deleted successfully');
  });

  return app;
}

// ── helpers ──────────────────────────────────────────────────────────────────

export function parseId(raw: string | undefined): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw ApiError.notFound();
  return id;
}

/** Filters on a comma-separated list, validated against the allowed values. */
function inList<T extends string>(
  column: AnySQLiteColumn,
  raw: string,
  allowed: readonly T[],
  field: string,
): SQL {
  const values = raw
    .split(',')
    .map((v) => v.trim())
    .filter((v): v is T => (allowed as readonly string[]).includes(v));
  if (values.length === 0) {
    throw ApiError.fieldErrors({ [field]: [`Must be one of: ${allowed.join(', ')}.`] });
  }
  return values.length === 1 ? eq(column, values[0]!) : inArray(column, values);
}

const ORDERINGS = new Map<string, SQL>([
  ['-created_at', desc(tasks.createdAt)],
  ['created_at', asc(tasks.createdAt)],
  ['-updated_at', desc(tasks.updatedAt)],
  ['deadline', asc(tasks.deadline)],
  ['-deadline', desc(tasks.deadline)],
  ['title', asc(tasks.title)],
  ['-title', desc(tasks.title)],
]);
