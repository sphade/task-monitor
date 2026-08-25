/**
 * Domain types for the Orange Invent House Task & Reporting Platform.
 *
 * These are the shapes screens consume. They deliberately mirror the backend's
 * vocabulary (see `src/types/api.ts`) so mapping stays thin, but use camelCase.
 */

export type ID = string;

// ---------------------------------------------------------------------------
// RBAC
// ---------------------------------------------------------------------------

/**
 * Modules exactly as the API reports them in `allowed_modules` /
 * `sidebar_modules`. Do not invent values — the server drives navigation.
 */
export type ModuleKey =
  | 'DASHBOARD'
  | 'HR_SETTINGS'
  | 'TASKS'
  | 'REPORTS'
  | 'APPROVALS'
  | 'PERFORMANCE_OVERVIEW'
  | 'ROLES'
  | 'SYSTEM_CONFIG'
  | 'DEPARTMENTS';

/**
 * A granular permission. The API identifies these by *name* (for example
 * `CAN_VIEW_DASHBOARD`, `CAN_ASSIGN_TASKS`), so this is an open string type
 * rather than a closed union — the server can add permissions without a
 * client release.
 */
export type Permission = string;

/**
 * Well-known permission names used in the UI.
 *
 * `Permission` is an open string so the server can add permissions without a
 * client release, but UI gating must go through these constants — see
 * `KnownPermission`. Passing a raw string to a guard is how you silently hide a
 * button forever.
 */
export const PERMISSIONS = {
  VIEW_DASHBOARD: 'CAN_VIEW_DASHBOARD',
  ASSIGN_TASKS: 'CAN_ASSIGN_TASKS',
  VIEW_TASKS: 'CAN_VIEW_TASKS',
  UPDATE_TASKS: 'CAN_UPDATE_TASKS',
  DELETE_TASKS: 'CAN_DELETE_TASKS',
  VIEW_REPORTS: 'CAN_VIEW_REPORTS',
  CREATE_REPORTS: 'CAN_CREATE_REPORTS',
  UPDATE_REPORTS: 'CAN_UPDATE_REPORTS',
  DELETE_REPORTS: 'CAN_DELETE_REPORTS',
  MANAGE_STAFF: 'CAN_MANAGE_STAFF',
  VIEW_STAFF: 'CAN_VIEW_STAFF',
  MANAGE_ROLES: 'CAN_MANAGE_ROLES',
  MANAGE_DEPARTMENTS: 'CAN_MANAGE_DEPARTMENTS',
  CREATE_DOCUMENTS: 'CAN_CREATE_DOCUMENTS',
  VIEW_DOCUMENTS: 'CAN_VIEW_DOCUMENTS',
} as const;

/**
 * Only these values may be used to gate UI. This keeps the compiler as the
 * safety net: a typo or a stale `'TASK:edit'`-style string fails the build
 * instead of quietly hiding the control at runtime.
 */
export type KnownPermission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export interface Role {
  id: ID;
  name: string;
  code: string;
  description?: string;
  permissions: Permission[];
  allowedModules: ModuleKey[];
  sidebarModules: ModuleKey[];
  parentName?: string;
}

// ---------------------------------------------------------------------------
// People / HR
// ---------------------------------------------------------------------------

export interface Department {
  id: ID;
  name: string;
  description?: string;
  isActive: boolean;
}

export type StaffLocation = 'headquarters' | 'branch_office' | 'regional_office' | 'remote';

export interface User {
  id: ID;
  fullName: string;
  email: string;
  /** Human-readable role label from the server (`role_display`). */
  role: string;
  /** Numeric role id, needed when writing staff records. */
  roleId?: number;
  employeeId?: string;
  department?: string;
  location?: StaffLocation;
  locationLabel?: string;
  initials?: string;
  avatarUrl?: string;
  isActive: boolean;
}

export interface Session {
  token: string;
  refresh?: string;
  user: User;
  permissions: Permission[];
  allowedModules: ModuleKey[];
  sidebarModules: ModuleKey[];
}

// ---------------------------------------------------------------------------
// Tasks / Projects / Reports
// ---------------------------------------------------------------------------

export type TaskPriority = 'low' | 'medium' | 'high';

/** Server-defined task lifecycle. */
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'overdue';

export interface Task {
  id: ID;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  projectId?: ID;
  /** Display name of the assignee (the list endpoint returns a name). */
  assigneeName?: string;
  assignerName?: string;
  assigneeRole?: string;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: ID;
  name: string;
  description?: string;
  startDate?: string;
  /** The API calls this `deadline`. */
  endDate?: string;
  createdAt: string;
}

/** Server-defined report status. Note the hyphen in `in-progress`. */
export type ReportStatus = 'pending' | 'in-progress' | 'done';

export interface Report {
  id: ID;
  /** Reports have no title field; the note is the body. */
  body?: string;
  status: ReportStatus;
  taskId?: ID;
  authorName?: string;
  authorEmail?: string;
  authorRole?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Chat / Forum (PRD 11.2)
// ---------------------------------------------------------------------------

export type ConversationKind = 'direct' | 'forum';

export interface Conversation {
  id: ID;
  kind: ConversationKind;
  participantIds: ID[];
  title: string;
  /** The other participant — required to send, since the API keys off recipient. */
  recipientId?: ID;
  lastMessage?: string;
  lastMessageAt?: string;
  /** Always 0 today: the API exposes no read/unread state. */
  unreadCount: number;
}

export interface Message {
  id: ID;
  conversationId: ID;
  senderId: ID;
  senderName: string;
  body: string;
  createdAt: string;
  /** Read receipt from the server. */
  isRead?: boolean;
  status?: 'sent' | 'delivered' | 'read';
  editedAt?: string;
  deleted?: boolean;
}

// ---------------------------------------------------------------------------
// Documents — PRD / SDD repository (PRD 11.3)
// ---------------------------------------------------------------------------

export type DocKind = 'PRD' | 'SDD';

export type DocSource = 'link' | 'file' | 'inapp';

export interface DocVersion {
  version: number;
  updatedAt: string;
  updatedByName: string;
  note?: string;
}

export interface ProjectDoc {
  id: ID;
  /** Documents are not project-scoped on the server yet; see docs service. */
  projectId?: ID;
  /** `document_name` on the server. */
  name?: string;
  kind: DocKind;
  source: DocSource;
  url?: string;
  fileName?: string;
  fileSizeKb?: number;
  content?: string;
  version: number;
  updatedAt: string;
  updatedByName: string;
  history: DocVersion[];
}

export interface DocComment {
  id: ID;
  docId: ID;
  authorId: ID;
  authorName: string;
  body: string;
  createdAt: string;
}

/** Default templates supplied by the PRD. */
export const DOC_TEMPLATES: Record<DocKind, string> = {
  SDD: 'http://oinvent-sdd.pages.dev/',
  PRD: 'http://oinvent-sdd.pages.dev/prd',
};

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface DashboardOverview {
  totalTasks: number;
  inProgress: number;
  overdue: number;
  completionRate: number;
  statusDistribution: { completed: number; inProgress: number; pending: number; overdue: number };
  priorityBreakdown: { low: number; medium: number; high: number };
  recentTasks: Task[];
}
