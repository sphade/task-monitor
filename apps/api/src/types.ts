import type { DrizzleD1Database } from 'drizzle-orm/d1';

import type * as schema from '@/db/schema';
import type { ChatRoom } from '@/durable/chat-room';

/** Drizzle instance shape produced by makeDb() in db/client.ts. */
export type AppDb = DrizzleD1Database<typeof schema> & { $client: D1Database };

/**
 * Worker bindings, mirroring wrangler.jsonc.
 *
 * Regenerate with `pnpm wrangler types` after changing bindings — this
 * hand-written shape must stay in sync with the config.
 */
export interface Env {
  /** D1 database binding. */
  DB: D1Database;
  /** KV namespace: OTP handles, refresh-token blacklist, misc cache. */
  KV: KvStore;
  /** Durable Object namespace backing realtime chat. */
  CHAT_ROOM: DurableObjectNamespace<ChatRoom>;
  /** HS256 signing secret (wrangler secret / .dev.vars). */
  JWT_SECRET: string;
  /** development | staging | production */
  ENVIRONMENT?: string;
  /** When "true" (dev only) OTP codes are echoed back in API responses. */
  DEBUG_SHOW_OTP?: string;
}

/**
 * Minimal KV surface the app relies on. `KVNamespace` satisfies this; tests
 * supply an in-memory implementation.
 */
export interface KvStore {
  get(key: string, options?: { type?: 'text' }): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number; metadata?: unknown },
  ): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string }): Promise<{ keys: { name: string }[] }>;
}

/** Everything a request needs, built once per request from bindings. */
export interface Services {
  db: AppDb;
  kv: KvStore;
  jwtSecret: Uint8Array;
  environment: string;
  /** Dev convenience: echo OTP codes back instead of emailing them. */
  showOtpInResponses: boolean;
  /**
   * Handle to the Durable Object instance owning a chat conversation.
   * `broadcast` fans out to connected sockets; `forward` upgrades a WebSocket.
   */
  roomStub: (roomName: string) => {
    broadcast(payload: string): Promise<void> | void;
    forward(request: Request): Response | Promise<Response>;
  };
}

/** Populated by the auth middleware. */
export interface AuthContext {
  userId: number;
  username: string;
  name: string;
  roleId: number | null;
  isSuperuser: boolean;
  permissions: Set<string>;
}

export type AppEnv = {
  Bindings: Env;
  Variables: {
    services: Services;
    auth: AuthContext;
  };
};

export const PERMISSION_MODULES = [
  'DASHBOARD',
  'HR_SETTINGS',
  'TASKS',
  'REPORTS',
  'APPROVALS',
  'PERFORMANCE_OVERVIEW',
  'ROLES',
  'SYSTEM_CONFIG',
  'DEPARTMENTS',
] as const;

export type PermissionModule = (typeof PERMISSION_MODULES)[number];
