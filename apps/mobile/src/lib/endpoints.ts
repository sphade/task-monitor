/**
 * API routes, transcribed from the OpenAPI schema.
 * Every path is versioned under /v1/.
 */
export const API = {
  // ── Auth ────────────────────────────────────────────────────────────────
  LOGIN: '/v1/auth/login/',
  VERIFY_LOGIN: '/v1/auth/verify-login/',
  RESEND_OTP: '/v1/auth/resend-otp/',
  REGISTER: '/v1/auth/register/',
  LOGOUT: '/v1/auth/logout/',
  FORGOT_PASSWORD: '/v1/auth/forgot-password/',
  PASSWORD_RESET_VERIFY: '/v1/auth/password-reset/verify/',
  RESET_PASSWORD: '/v1/auth/reset-password/',
  CHANGE_PASSWORD: '/v1/auth/change-password/',
  PROFILE: '/v1/auth/staff/profile/',
  PERFORMANCE_OVERVIEW: '/v1/auth/performance/overview/',

  // ── Dashboard ───────────────────────────────────────────────────────────
  DASHBOARD_OVERVIEW: '/v1/console/dashboard/overview/',

  // ── Tasks & Projects ────────────────────────────────────────────────────
  TASKS: '/v1/tasks/',
  task: (id: string | number) => `/v1/tasks/${id}/`,
  PROJECTS: '/v1/tasks/projects/',
  project: (id: string) => `/v1/tasks/projects/${id}/`,

  // ── Reports ─────────────────────────────────────────────────────────────
  REPORTS: '/v1/reports/',
  report: (id: string | number) => `/v1/reports/${id}/`,

  // ── Console / HR ────────────────────────────────────────────────────────
  STAFF: '/v1/console/staff/',
  staff: (id: string | number) => `/v1/console/staff/${id}/`,
  DEPARTMENTS: '/v1/console/departments/',
  department: (id: string | number) => `/v1/console/departments/${id}/`,
  ROLES: '/v1/console/roles/',
  role: (id: string | number) => `/v1/console/roles/${id}/`,
  roleAddPermissions: (id: string | number) => `/v1/console/roles/${id}/add-permissions/`,
  roleRemovePermissions: (id: string | number) => `/v1/console/roles/${id}/remove-permissions/`,
  PERMISSIONS: '/v1/console/permissions/',
  permission: (id: string | number) => `/v1/console/permissions/${id}/`,
  USER_DROPDOWN: '/v1/console/user-dropdown/',

  // ── Chat (PRD 11.2) ─────────────────────────────────────────────────────
  /** Flat list of the caller's messages. */
  CONVERSATIONS: '/v1/chat/conversations/',
  /** Messages belonging to one conversation. */
  conversation: (id: string | number) => `/v1/chat/conversations/${id}/`,
  /** Marks my received messages in a thread as read. */
  conversationRead: (id: string | number) => `/v1/chat/conversations/${id}/read/`,
  /** Group rooms (the whole-team room auto-exists here). */
  GROUPS: '/v1/chat/groups/',
  groupMembers: (id: string | number) => `/v1/chat/groups/${id}/members/`,
  MESSAGES: '/v1/chat/messages/',

  // ── Documents (PRD 11.3) ────────────────────────────────────────────────
  DOCUMENTS: '/v1/documents/',
  document: (id: string | number) => `/v1/documents/${id}/`,
  DOC_COMMENTS: '/v1/documents/comments/',
  docComment: (id: string | number) => `/v1/documents/comments/${id}/`,

  // ── Audit ───────────────────────────────────────────────────────────────
  AUDIT: '/v1/audit/',
  audit: (id: string) => `/v1/audit/${id}/`,

  HEALTH: '/v1/health-check/',
} as const;
