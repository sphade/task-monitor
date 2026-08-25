import { create } from 'zustand';

import { getItem, removeItem, setItem } from '@/lib/secure-store';
import type { ModuleKey, Permission, Session, User } from '@/types';

const SESSION_KEY = 'oih.session';

interface AuthState {
  session: Session | null;
  hydrated: boolean;
  /** Load a persisted session on app start. */
  hydrate: () => Promise<void>;
  setSession: (session: Session) => Promise<void>;
  updateUser: (user: Partial<User>) => void;
  /** Refresh RBAC in place (for example after re-fetching the profile). */
  setAccess: (access: {
    permissions?: Permission[];
    allowedModules?: ModuleKey[];
    sidebarModules?: ModuleKey[];
  }) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await getItem(SESSION_KEY);
      if (raw) set({ session: JSON.parse(raw) as Session });
    } catch {
      // Ignore a corrupt session; the user will be sent back to login.
    } finally {
      set({ hydrated: true });
    }
  },

  setSession: async (session) => {
    await setItem(SESSION_KEY, JSON.stringify(session));
    set({ session });
  },

  updateUser: (patch) => {
    const current = get().session;
    if (!current) return;
    const next = { ...current, user: { ...current.user, ...patch } };
    set({ session: next });
    setItem(SESSION_KEY, JSON.stringify(next)).catch(() => {});
  },

  setAccess: async (access) => {
    const current = get().session;
    if (!current) return;
    const next: Session = {
      ...current,
      permissions: access.permissions ?? current.permissions,
      allowedModules: access.allowedModules ?? current.allowedModules,
      sidebarModules: access.sidebarModules ?? current.sidebarModules,
    };
    set({ session: next });
    await setItem(SESSION_KEY, JSON.stringify(next));
  },

  logout: async () => {
    await removeItem(SESSION_KEY);
    set({ session: null });
  },
}));

export const getToken = (): string | null => useAuthStore.getState().session?.token ?? null;
export const getRefreshToken = (): string | undefined =>
  useAuthStore.getState().session?.refresh;
export const getPermissions = (): Permission[] =>
  useAuthStore.getState().session?.permissions ?? [];
export const getAllowedModules = (): ModuleKey[] =>
  useAuthStore.getState().session?.allowedModules ?? [];
