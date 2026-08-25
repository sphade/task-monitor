import { relations } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/**
 * D1 schema — a faithful port of the Django models in task_monitor/src,
 * adjusted for SQLite. Timestamps are ISO-8601 UTC strings so the wire format
 * matches what the Django API produced (`new Date().toISOString()`).
 */

const timestamps = {
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
};

// ── RBAC ─────────────────────────────────────────────────────────────────────

export const departments = sqliteTable('departments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  description: text('description'),
  headId: integer('head_id'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  ...timestamps,
});

export const roles = sqliteTable('roles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  code: text('code').notNull().unique(),
  description: text('description'),
  /** If true only one user may hold this role (mirrors Django's create_once). */
  createOnce: integer('create_once', { mode: 'boolean' }).notNull().default(false),
  parentId: integer('parent_id'),
  ...timestamps,
});

export const permissions = sqliteTable('permissions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  description: text('description'),
  module: text('module').notNull(),
  ...timestamps,
});

export const rolePermissions = sqliteTable(
  'role_permissions',
  {
    roleId: integer('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: integer('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

// ── Users ────────────────────────────────────────────────────────────────────

export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    username: text('username').notNull().unique(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    phone: text('phone').unique(),
    /** `pbkdf2$iterations$salt_b64$hash_b64`. */
    passwordHash: text('password_hash').notNull(),
    roleId: integer('role_id').references(() => roles.id, { onDelete: 'set null' }),
    departmentId: integer('department_id').references(() => departments.id, {
      onDelete: 'set null',
    }),
    employeeId: text('employee_id').unique(),
    /** headquarters | branch_office | regional_office | remote */
    location: text('location').notNull().default('headquarters'),
    profilePhoto: text('profile_photo'),
    bio: text('bio'),
    officePhone: text('office_phone'),
    dateOfBirth: text('date_of_birth'),
    dateJoinedOrg: text('date_joined_org'),
    performanceScore: real('performance_score').notNull().default(0),
    performancePoints: integer('performance_points').notNull().default(0),
    isVerified: integer('is_verified', { mode: 'boolean' }).notNull().default(false),
    isAdmin: integer('is_admin', { mode: 'boolean' }).notNull().default(false),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    isSuperuser: integer('is_superuser', { mode: 'boolean' }).notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index('users_role_idx').on(t.roleId),
    index('users_department_idx').on(t.departmentId),
  ],
);

// ── Work ─────────────────────────────────────────────────────────────────────

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  /** active | completed | archived */
  status: text('status').notNull().default('active'),
  startDate: text('start_date'),
  deadline: text('deadline'),
  ...timestamps,
});

export const tasks = sqliteTable(
  'tasks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    assignedTo: integer('assigned_to')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    assignedBy: integer('assigned_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** low | medium | high */
    priority: text('priority').notNull().default('medium'),
    /** pending | in_progress | completed | overdue */
    status: text('status').notNull().default('pending'),
    startedAt: text('started_at'),
    completedAt: text('completed_at'),
    deadline: text('deadline'),
    ...timestamps,
  },
  (t) => [
    index('tasks_project_idx').on(t.projectId),
    index('tasks_assigned_to_idx').on(t.assignedTo),
    index('tasks_status_idx').on(t.status),
  ],
);

export const reports = sqliteTable(
  'reports',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    senderId: integer('sender_id').references(() => users.id, { onDelete: 'set null' }),
    title: text('title').notNull().default(''),
    /** pending | in-progress | done */
    status: text('status').notNull().default('pending'),
    description: text('description').notNull().default(''),
    note: text('note').notNull().default(''),
    parentTaskId: integer('parent_task_id').references(() => tasks.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (t) => [index('reports_parent_task_idx').on(t.parentTaskId)],
);

// ── Chat ─────────────────────────────────────────────────────────────────────

export const conversations = sqliteTable(
  'conversations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** direct | group */
    kind: text('kind').notNull().default('direct'),
    /** Group display name; null for direct threads. */
    name: text('name'),
    /** The auto-provisioned whole-team room. */
    isTeam: integer('is_team', { mode: 'boolean' }).notNull().default(false),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    firstUserId: integer('first_user_id').references(() => users.id, {
      onDelete: 'cascade',
    }),
    secondUserId: integer('second_user_id').references(() => users.id, {
      onDelete: 'cascade',
    }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('conversations_pair_unique').on(t.firstUserId, t.secondUserId),
    index('conversations_kind_idx').on(t.kind),
  ],
);

/** Group membership + per-member read state. Direct chats don't use this. */
export const conversationMembers = sqliteTable(
  'conversation_members',
  {
    conversationId: integer('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Marks the member's read position for group unread counts. */
    lastReadAt: text('last_read_at'),
    joinedAt: text('joined_at').notNull(),
  },
  (t) => [index('conversation_members_user_idx').on(t.userId)],
);

export const messages = sqliteTable(
  'messages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    conversationId: integer('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderId: integer('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Null for group messages — they broadcast to every member. */
    recipientId: integer('recipient_id').references(() => users.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    /** sent | delivered | read */
    status: text('status').notNull().default('sent'),
    isRead: integer('is_read', { mode: 'boolean' }).notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index('messages_conversation_idx').on(t.conversationId),
    index('messages_recipient_idx').on(t.recipientId),
  ],
);

// ── Documents (PRD/SDD repository) ───────────────────────────────────────────

export const documents = sqliteTable(
  'documents',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    documentName: text('document_name').notNull(),
    /** PRD | SDD */
    documentType: text('document_type').notNull().default(''),
    content: text('content'),
    url: text('url'),
    version: integer('version').notNull().default(1),
    senderId: integer('sender_id').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    index('documents_project_idx').on(t.projectId),
    // One PRD and one SDD slot per project — mirrors how the app consumes docs.
    uniqueIndex('documents_project_type_unique').on(t.projectId, t.documentType),
  ],
);

export const documentRevisions = sqliteTable(
  'document_revisions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    documentId: integer('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    content: text('content'),
    url: text('url'),
    note: text('note'),
    editorId: integer('editor_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('document_revisions_document_idx').on(t.documentId)],
);

export const documentComments = sqliteTable(
  'document_comments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    documentId: integer('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    commenterId: integer('commenter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    ...timestamps,
  },
  (t) => [index('document_comments_document_idx').on(t.documentId)],
);

// ── Audit trail ──────────────────────────────────────────────────────────────

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    actorName: text('actor_name').notNull().default('system'),
    module: text('module').notNull(),
    action: text('action').notNull(),
    description: text('description').notNull().default(''),
    ipAddress: text('ip_address'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('audit_logs_created_idx').on(t.createdAt)],
);

// ── Relations (for typed joins) ──────────────────────────────────────────────

export const usersRelations = relations(users, ({ one }) => ({
  role: one(roles, { fields: [users.roleId], references: [roles.id] }),
  department: one(departments, { fields: [users.departmentId], references: [departments.id] }),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),
  reports: many(reports),
}));
