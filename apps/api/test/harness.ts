import Database from 'better-sqlite3';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createApp } from '@/app';
import type { Env, KvStore } from '@/types';

/**
 * Node-side test harness: the real Hono app runs against a D1-shaped shim
 * over better-sqlite3, an in-memory KV with TTL semantics, and a fake chat
 * room stub that records broadcasts.
 */

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '../migrations');
const MIGRATIONS = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(migrationsDir, f), 'utf8'));
const SEED = readFileSync(join(here, '../scripts/seed.sql'), 'utf8');

// ── D1 shim ──────────────────────────────────────────────────────────────────

interface D1Meta {
  changes?: number;
  last_row_id?: number;
  duration?: number;
}

function makeStatement(db: Database.Database, sql: string) {
  const stmt = {
    sql,
    params: [] as unknown[],
    bind(...params: unknown[]) {
      this.params = params;
      return this;
    },
    async first<T>(colName?: string): Promise<T | null> {
      const row = db.prepare(sql).get(...(this.params as never[])) as
        | Record<string, unknown>
        | undefined;
      if (row === undefined) return null;
      if (colName !== undefined) return (row[colName] ?? null) as T;
      return row as T;
    },
    async run(): Promise<{ success: boolean; meta: D1Meta }> {
      const info = db.prepare(sql).run(...(this.params as never[]));
      return {
        success: true,
        meta: {
          changes: Number(info.changes),
          last_row_id: Number(info.lastInsertRowid),
          duration: 0,
        },
      };
    },
    async all<T>(): Promise<{ results: T[]; success: boolean; meta: D1Meta }> {
      const results = db.prepare(sql).all(...(this.params as never[])) as T[];
      return { results, success: true, meta: { changes: 0, duration: 0 } };
    },
    async raw<T>(): Promise<T[]> {
      return db.prepare(sql).raw().all(this.params) as T[];
    },
  };
  return stmt;
}

export function makeD1(database: Database.Database): D1Database {
  return {
    prepare: (sql: string) => makeStatement(database, sql),
    async batch<T>(statements: unknown[]) {
      const results: { success: boolean; meta: D1Meta }[] = [];
      for (const statement of statements) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        results.push(await (statement as any).run());
      }
      return results as never as { results: T[] }[];
    },
    async exec(sqlText: string) {
      database.exec(sqlText);
    },
    dump: async () => new ArrayBuffer(0),
    withSession: undefined as never,
  } as unknown as D1Database;
}

// ── KV shim ──────────────────────────────────────────────────────────────────

interface KvEntry {
  value: string;
  expiresAt: number | null;
}

export class FakeKv implements KvStore {
  private store = new Map<string, KvEntry>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    const ttl = options?.expirationTtl;
    this.store.set(key, {
      value,
      expiresAt: ttl ? Date.now() + ttl * 1000 : null,
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(options?: { prefix?: string }): Promise<{ keys: { name: string }[] }> {
    const prefix = options?.prefix ?? '';
    const keys = [...this.store.keys()]
      .filter((k) => k.startsWith(prefix))
      .map((name) => ({ name }));
    return { keys };
  }
}

// ── Context ──────────────────────────────────────────────────────────────────

export interface TestCtx {
  app: ReturnType<typeof createApp>;
  env: Env;
  kv: FakeKv;
  broadcasts: string[];
}

export function setupTest(): TestCtx {
  const sqlite = new Database(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  for (const migration of MIGRATIONS) {
    sqlite.exec(migration);
  }
  sqlite.exec(SEED);

  const broadcasts: string[] = [];

  const env: Env = {
    DB: makeD1(sqlite),
    KV: new FakeKv(),
    CHAT_ROOM: {
      getByName: () => ({
        broadcast: async (payload: string) => {
          broadcasts.push(payload);
        },
        forward: () => {
          throw new Error('WebSocket upgrades are not exercised in unit tests');
        },
      }),
    } as unknown as Env['CHAT_ROOM'],
    JWT_SECRET: 'test-secret-do-not-use-in-prod',
    ENVIRONMENT: 'development',
    DEBUG_SHOW_OTP: 'true',
  };

  return { app: createApp(), env, kv: env.KV as FakeKv, broadcasts };
}

// ── Request helpers ──────────────────────────────────────────────────────────

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export function jsonRequest(
  method: HttpMethod,
  path: string,
  body?: unknown,
  token?: string,
): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return new Request(`https://api.test${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Performs a request against the app and parses the JSON response. */
export async function callJson<T>(
  ctx: TestCtx,
  method: HttpMethod,
  path: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; body: T }> {
  const res = await ctx.app.request(jsonRequest(method, path, body, token), undefined, ctx.env);
  return { status: res.status, body: (await res.json()) as T };
}

export interface SessionTokens {
  token: string;
  refresh: string;
  userId: number;
}

/** Drives the two-step OTP login and returns session tokens. */
export async function loginAs(
  ctx: TestCtx,
  login: string,
  password = 'Password123!',
): Promise<SessionTokens> {
  const loginRes = await ctx.app.request(
    '/v1/auth/login/',
    jsonRequest('POST', '/', { login, password }),
    ctx.env,
  );
  expect(loginRes.status).toBe(200);
  const loginBody = (await loginRes.json()) as {
    data: { otp_key: string; debug_otp: string };
  };

  const verifyRes = await ctx.app.request(
    '/v1/auth/verify-login/',
    jsonRequest('POST', '/', { otp: loginBody.data.debug_otp, temp_id: loginBody.data.otp_key }),
    ctx.env,
  );
  expect(verifyRes.status).toBe(200);
  const verifyBody = (await verifyRes.json()) as {
    data: { token: string; refresh: string; user: { id: number } };
  };
  return {
    token: verifyBody.data.token,
    refresh: verifyBody.data.refresh,
    userId: verifyBody.data.user.id,
  };
}
