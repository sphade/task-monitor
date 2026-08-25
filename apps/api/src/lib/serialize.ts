import { eq } from 'drizzle-orm';

import {
  departments,
  messages,
  permissions,
  reports,
  rolePermissions,
  roles,
  tasks,
  users,
} from '@/db/schema';
import type { Db } from '@/db/client';
import type { PermissionModule } from '@/types';

/**
 * Row → wire-format (DTO) mappers. Field names and value shapes replicate the
 * Django API exactly — the mobile client's DTOs depend on them.
 */

export function initialsOf(name: string | null | undefined, email: string): string {
  const trimmed = (name ?? '').trim();
  if (trimmed.length > 0) {
    return trimmed
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join('');
  }
  return email ? email[0]!.toUpperCase() : 'U';
}

export const LOCATION_DISPLAY: Record<string, string> = {
  headquarters: 'Headquarters',
  branch_office: 'Branch Office',
  regional_office: 'Regional Office',
  remote: 'Remote',
};

export type UserRow = typeof users.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
export type ReportRow = typeof reports.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;

// ── Auth user ────────────────────────────────────────────────────────────────

export interface PermissionDto {
  id: number;
  name: string;
  module: PermissionModule | string;
  description?: string;
}

export interface AuthUserDto {
  id?: number;
  name?: string;
  email?: string;
  username?: string;
  role?: string;
  department?: string;
  permissions?: PermissionDto[];
  allowed_modules?: string[];
  sidebar_modules?: string[];
}

/** The authenticated-user payload embedded in verify-login / profile responses. */
export async function serializeAuthUser(db: Db, user: UserRow): Promise<AuthUserDto> {
  let roleName = 'No Role Assigned';
  let departmentName: string | undefined;

  if (user.roleId) {
    const [role] = await db.select().from(roles).where(eq(roles.id, user.roleId)).limit(1);
    if (role) roleName = role.name;
  }
  if (user.departmentId) {
    const [dept] = await db
      .select()
      .from(departments)
      .where(eq(departments.id, user.departmentId))
      .limit(1);
    if (dept) departmentName = dept.name;
  }

  const permissionRows =
    user.roleId === null
      ? []
      : await db
          .select({
            id: permissions.id,
            name: permissions.name,
            module: permissions.module,
            description: permissions.description,
          })
          .from(rolePermissions)
          .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
          .where(eq(rolePermissions.roleId, user.roleId));

  const modules = [...new Set(permissionRows.map((p) => p.module))];

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    role: roleName,
    department: departmentName,
    permissions: permissionRows.map((p) => ({
      id: p.id,
      name: p.name,
      module: p.module as PermissionModule,
      description: p.description ?? undefined,
    })),
    allowed_modules: modules,
    sidebar_modules: modules,
  };
}

// ── Staff / HR ───────────────────────────────────────────────────────────────

export interface StaffDto {
  id: number;
  name: string;
  email: string;
  employee_id: string | null;
  department_name: string;
  location: string;
  location_display: string;
  role: number | null;
  role_display: string;
  initials: string;
  profile_photo_url: string;
  is_active?: boolean;
}

export function serializeStaff(
  user: UserRow,
  extra: { roleName?: string | null; departmentName?: string | null },
): StaffDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    employee_id: user.employeeId ?? null,
    department_name: extra.departmentName ?? '',
    location: user.location,
    location_display: LOCATION_DISPLAY[user.location] ?? user.location,
    role: user.roleId,
    role_display:
      extra.roleName === undefined || extra.roleName === null || extra.roleName === ''
        ? 'No Role Assigned'
        : extra.roleName,
    initials: initialsOf(user.name, user.email),
    profile_photo_url: user.profilePhoto ?? '',
    is_active: user.isActive,
  };
}

// ── Tasks ────────────────────────────────────────────────────────────────────

export interface TaskDto {
  id: number;
  title: string;
  description: string | null;
  /** Assignee display name on read; numeric user id on write. */
  assigned_to: string;
  assigned_by: string;
  user_role: string;
  project: string | null;
  priority: string;
  status: string;
  deadline: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export function serializeTask(
  task: TaskRow,
  people: { assigneeName: string; assignerName: string; assigneeRole: string },
): TaskDto {
  return {
    id: task.id,
    title: task.title,
    description: task.description ?? null,
    assigned_to: people.assigneeName,
    assigned_by: people.assignerName,
    user_role: people.assigneeRole,
    project: task.projectId,
    priority: task.priority,
    status: task.status,
    deadline: task.deadline ?? null,
    started_at: task.startedAt ?? null,
    completed_at: task.completedAt ?? null,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
  };
}

// ── Reports ──────────────────────────────────────────────────────────────────

/** Report statuses use hyphens on the wire (`in-progress`), unlike tasks. */
export interface ReportDto {
  id: number;
  username: string;
  email: string;
  status: string;
  user_role: string;
  note: string;
  title: string;
  parent_task: number | null;
  created_at: string;
}

export function serializeReport(
  report: ReportRow,
  sender: UserRow | null,
  senderRoleName: string | null,
): ReportDto {
  return {
    id: report.id,
    username: sender?.name ?? '',
    email: sender?.email ?? '',
    status: report.status,
    user_role: senderRoleName ?? 'No Role Assigned',
    note: report.note,
    title: report.title,
    parent_task: report.parentTaskId,
    created_at: report.createdAt,
  };
}

// ── Chat ─────────────────────────────────────────────────────────────────────

export interface MessageDto {
  id: number;
  content: string;
  conversation: number;
  sender: number;
  /** Null for group messages — they broadcast to every member. */
  recipient: number | null;
  status: string;
  is_read: boolean;
  created_at: string;
  updated_at: string;
}

export function serializeMessage(m: MessageRow): MessageDto {
  return {
    id: m.id,
    content: m.content,
    conversation: m.conversationId,
    sender: m.senderId,
    recipient: m.recipientId,
    status: m.status,
    is_read: m.isRead,
    created_at: m.createdAt,
    updated_at: m.updatedAt,
  };
}
