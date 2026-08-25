import type { Context } from 'hono';
import { z } from 'zod';

import type { AppEnv } from '@/types';

/**
 * Wire-format helpers replicating the Django API's response conventions so the
 * mobile client keeps working unchanged:
 *
 *   - single resources & mutations: `{ message, data }`
 *   - list endpoints: DRF pages `{ count, next, previous, results }`
 *   - validation errors: 400 `{ message: "Validation error", errors: { field: [msg] } }`
 *   - auth/permission errors: `{ detail }`
 */

export function ok<T>(c: Context<AppEnv>, data: T, message = 'Success'): Response {
  return c.json({ message, data });
}

export interface Page<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export function pageOf<T>(results: T[], count: number): Page<T> {
  return { count, next: null, previous: null, results };
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export function paging(c: Context<AppEnv>): { page: number; size: number; offset: number } {
  const rawPage = Number(c.req.query('page') ?? '1');
  const rawSize = Number(c.req.query('size') ?? c.req.query('page_size') ?? `${DEFAULT_PAGE_SIZE}`);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  let size = Number.isFinite(rawSize) && rawSize >= 1 ? Math.floor(rawSize) : DEFAULT_PAGE_SIZE;
  if (size > MAX_PAGE_SIZE) size = MAX_PAGE_SIZE;
  return { page, size, offset: (page - 1) * size };
}

/** Escapes user input for LIKE and wraps it in `%…%`. */
export function likePattern(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const escaped = input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  return `%${escaped}%`;
}

export class ApiError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409,
    public body:
      | { detail: string }
      | { message: string; errors?: Record<string, string[]> },
  ) {
    super(typeof body === 'string' ? body : JSON.stringify(body));
  }

  static badRequest(message: string, errors?: Record<string, string[]>) {
    return new ApiError(400, errors ? { message, errors } : { message });
  }

  static fieldErrors(errors: Record<string, string[]>) {
    return new ApiError(400, { message: 'Validation error', errors });
  }

  static unauthorized(detail = 'Authentication credentials were not provided.') {
    return new ApiError(401, { detail });
  }

  static forbidden(detail = 'You do not have permission to perform this action.') {
    return new ApiError(403, { detail });
  }

  static notFound(detail = 'Not found.') {
    return new ApiError(404, { detail });
  }

  static conflict(detail: string) {
    return new ApiError(409, { detail });
  }
}

/** Flattens a Zod error into the DRF-style `{ field: [messages] }` map. */
export function zodFieldErrors(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : 'non_field_errors';
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Unwraps a single-row aggregate query (COUNT/SUM). SQLite guarantees exactly
 * one row for those, but `noUncheckedIndexedAccess` demands the guard.
 */
export function firstOf<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error('Aggregate query returned no rows');
  return row;
}

/**
 * Runs post-response work via waitUntil when an ExecutionContext exists
 * (production); runs inline otherwise (unit tests), so side effects like chat
 * fan-out remain observable.
 */
export function runBackground(c: Context<AppEnv>, task: () => Promise<void>): void {
  try {
    c.executionCtx.waitUntil(task());
  } catch {
    // No ExecutionContext (unit tests): run inline so side effects stay
    // observable.
    void task();
  }
}
