import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { useAuthStore } from '@/store/auth';
import type { ModuleKey, Permission } from '@/types';

interface PermissionsContextValue {
  permissions: Permission[];
  allowedModules: ModuleKey[];
  sidebarModules: ModuleKey[];
  /** True when the user holds the named permission (e.g. `CAN_ASSIGN_TASKS`). */
  hasPermission: (permission: Permission) => boolean;
  hasAnyPermission: (permissions: Permission[]) => boolean;
  /** Can the user reach this module at all? */
  canAccessModule: (module: ModuleKey) => boolean;
  /** Should this module appear in navigation? */
  showInNav: (module: ModuleKey) => boolean;
}

const PermissionsContext = createContext<PermissionsContextValue | null>(null);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const session = useAuthStore((s) => s.session);

  const value = useMemo<PermissionsContextValue>(() => {
    const permissions = session?.permissions ?? [];
    const allowedModules = session?.allowedModules ?? [];
    const sidebarModules = session?.sidebarModules ?? [];
    return {
      permissions,
      allowedModules,
      sidebarModules,
      hasPermission: (p) => permissions.includes(p),
      hasAnyPermission: (ps) => ps.some((p) => permissions.includes(p)),
      canAccessModule: (m) => allowedModules.includes(m),
      // Fall back to allowed modules when the server sends no sidebar list.
      showInNav: (m) =>
        sidebarModules.length > 0 ? sidebarModules.includes(m) : allowedModules.includes(m),
    };
  }, [session]);

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissions(): PermissionsContextValue {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error('usePermissions must be used within a PermissionsProvider');
  return ctx;
}
