/**
 * Wire-format DTOs, transcribed from the backend OpenAPI schema.
 *
 * These mirror the API exactly (snake_case, server enums). Screens consume the
 * domain types in `src/types/index.ts`; mappers in `src/services/api/*` convert
 * between the two so a backend rename never leaks into the UI.
 */

/** Standard success envelope: `{ message, data }`. */
export interface Envelope<T> {
  message?: string;
  data: T;
}

/** DRF pagination wrapper. */
export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/** Error body: `{ message, errors: { field: [msg] } }`. */
export interface ApiErrorBody {
  success?: boolean;
  message?: string;
  /** Field errors, e.g. `{ non_field_errors: ["Invalid username/email…"] }`. */
  errors?: Record<string, string[]>;
  /** DRF's own errors (auth/permission) use `detail` instead of `message`. */
  detail?: string;
}

// ── Auth ──────────────────────────────────────────────────────────────────

/** POST /v1/auth/login/ → the OTP handle for step two. */
export interface LoginResultDto {
  otp_key: string;
}

export interface PermissionDto {
  id: number;
  name: string;
  module: ServerModule;
  description?: string;
}

/** The authenticated user embedded in the verify-login response. */
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

/** POST /v1/auth/verify-login/ */
export interface VerifyLoginResultDto {
  token: string;
  refresh?: string;
  user: AuthUserDto;
}

/** POST /v1/auth/password-reset/verify/ → token used by reset-password. */
export interface PasswordResetVerifyResultDto {
  token_hash: string;
}

// ── Server enums ──────────────────────────────────────────────────────────

export type ServerModule =
  | 'DASHBOARD'
  | 'HR_SETTINGS'
  | 'TASKS'
  | 'REPORTS'
  | 'APPROVALS'
  | 'PERFORMANCE_OVERVIEW'
  | 'ROLES'
  | 'SYSTEM_CONFIG'
  | 'DEPARTMENTS';

export type ServerTaskStatus = 'pending' | 'in_progress' | 'completed' | 'overdue';
export type ServerPriority = 'low' | 'medium' | 'high';
/** Note the hyphen in `in-progress` — reports differ from tasks. */
export type ServerReportStatus = 'pending' | 'in-progress' | 'done';
export type ServerLocation = 'headquarters' | 'branch_office' | 'regional_office' | 'remote';
export type ServerDocType = 'PRD' | 'SDD';

// ── Tasks ─────────────────────────────────────────────────────────────────

export interface TaskDto {
  id: number;
  title: string;
  description?: string | null;
  /** Display name, read-only on the server. */
  assigned_to: string;
  assigned_by: string;
  user_role: string;
  /** Project uuid. Added by the backend after the initial integration. */
  project?: string | null;
  priority?: ServerPriority;
  status?: ServerTaskStatus;
  deadline?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskCreateDto {
  project: string;
  title: string;
  description?: string | null;
  /** User id, not a name, when writing. */
  assigned_to: number;
  priority?: ServerPriority;
  status?: ServerTaskStatus;
  deadline?: string | null;
}

// ── Projects ──────────────────────────────────────────────────────────────

export interface ProjectDto {
  id: string;
  name: string;
  description?: string | null;
  start_date?: string | null;
  deadline?: string | null;
  created_at: string;
  updated_at: string;
}

// ── Reports ───────────────────────────────────────────────────────────────

export interface ReportDto {
  id: number;
  username: string;
  email: string;
  status?: ServerReportStatus;
  user_role: string;
  note?: string;
  created_at: string;
}

export interface ReportCreateDto {
  status?: ServerReportStatus;
  note?: string;
  parent_task: number;
}

// ── Staff / HR ────────────────────────────────────────────────────────────

export interface StaffDto {
  id: number;
  name: string;
  email: string;
  employee_id?: string | null;
  department_name: string;
  location?: ServerLocation;
  location_display: string;
  role?: number | null;
  role_display: string;
  initials: string;
  profile_photo_url: string;
  is_active?: boolean;
}

export interface DepartmentDto {
  id: number;
  name: string;
  description?: string | null;
  is_active?: boolean;
}

export interface RoleDto {
  id: number;
  name: string;
  code: string;
  description?: string;
  allowed_modules: string[];
  sidebar_modules: string[];
  permission_details: { id: number; name: string; module: ServerModule }[];
  parent?: number | null;
  parent_name: string;
  created_at: string;
  updated_at: string;
}

export interface UserDropdownDto {
  id: number;
  label: string;
  email: string;
}

// ── Chat ──────────────────────────────────────────────────────────────────

export interface ChatUserDto {
  id: number;
  username: string;
}

/** Delivery state of a message. */
export type ServerMessageStatus = 'sent' | 'delivered' | 'read';

/**
 * The chat API is message-centric: there is no Conversation resource.
 * `GET /v1/chat/conversations/` returns a paginated list of messages, and
 * `GET /v1/chat/conversations/{conversationId}/` returns that thread's messages.
 */
export interface SendMessageDto {
  id: number;
  content: string;
  conversation: number;
  sender: number;
  recipient: number;
  status?: ServerMessageStatus;
  is_read?: boolean;
  created_at: string;
  updated_at: string;
}

// ── Documents ─────────────────────────────────────────────────────────────

export interface DocumentDto {
  id: number;
  document_name: string;
  document_type?: ServerDocType | '' | null;
  content?: string | null;
  url?: string | null;
  created_at: string;
  updated_at: string;
  sender: number;
}

export interface DocCommentDto {
  id: number;
  content: string;
  document: number;
  commenter: number;
  created_at: string;
  updated_at: string;
}
