import type { ModuleKey } from '@/types';

export interface ModuleNavItem {
  key: ModuleKey;
  label: string;
  /** Ionicons name. */
  icon: string;
  route: string;
}

/**
 * Navigation registry keyed by the server's module names. Entries are filtered
 * against the session's `sidebar_modules` / `allowed_modules`.
 *
 * Note the API has no PROJECT or TEAM module: projects live under TASKS and the
 * team directory under HR_SETTINGS.
 */
export const MODULE_NAV: ModuleNavItem[] = [
  { key: 'DASHBOARD', label: 'Dashboard', icon: 'grid-outline', route: '/(app)/(tabs)/dashboard' },
  { key: 'TASKS', label: 'Tasks', icon: 'checkbox-outline', route: '/(app)/(tabs)/task' },
  { key: 'TASKS', label: 'Projects', icon: 'folder-outline', route: '/(app)/(tabs)/project' },
  { key: 'REPORTS', label: 'Reports', icon: 'document-text-outline', route: '/(app)/(tabs)/report' },
  { key: 'HR_SETTINGS', label: 'Team', icon: 'people-outline', route: '/(app)/(tabs)/team' },
];
