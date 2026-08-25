import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { getServices } from '@/db/client';
import { ApiError, ok } from '@/lib/http';
import { requireAuth, requirePermission } from '@/middleware/auth';
import { authRoutes } from '@/routes/auth';
import { chatRoutes } from '@/routes/chat';
import { auditRoutes, consoleRoutes, listAuditLogs } from '@/routes/console';
import { documentRoutes, listDocuments, saveDocument } from '@/routes/documents';
import { sweepOverdueTasks, workRoutes } from '@/routes/work';
import type { AppEnv } from '@/types';

/**
 * Builds the full API surface. Kept free of `cloudflare:workers` imports so
 * the Node-based test harness can instantiate it directly.
 */
export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // Expo Web (and browser tooling) need CORS; native clients ignore it.
  app.use(
    '*',
    cors({
      origin: '*',
      allowHeaders: ['Authorization', 'Content-Type'],
      allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    }),
  );

  // Build services from bindings once per request.
  app.use('*', async (c, next) => {
    c.set('services', getServices(c.env));
    await next();
  });

  app.get('/', (c) => ok(c, { service: 'task-monitor-api', version: '1.0.0' }, 'OK'));

  app.route('/v1/auth', authRoutes());
  app.route('/v1/console', consoleRoutes());
  app.route('/v1/chat', chatRoutes());
  app.route('/v1/documents', documentRoutes());
  app.route('/v1/audit', auditRoutes());

  // Sub-app root handlers re-mounted here: Hono drops the trailing slash when
  // a sub-app's '/' is prefixed, but the mobile client always calls
  // `/v1/documents/` & `/v1/audit/` WITH one (Django parity).
  app.get('/v1/documents/', requireAuth, listDocuments);
  app.post('/v1/documents/', requireAuth, requirePermission('CAN_CREATE_DOCUMENTS'), saveDocument);
  app.get('/v1/audit/', requireAuth, listAuditLogs);

  // Tasks & reports live directly under /v1 (matches the original API).
  app.route('/v1', workRoutes());

  app.get('/v1/health-check/', async (c) => {
    try {
      await c.env.DB.prepare('SELECT 1').first();
      return ok(c, { status: 'ok', database: 'connected' }, 'Healthy');
    } catch {
      return c.json({ message: 'Database unavailable' }, 503);
    }
  });

  app.notFound((c) => c.json({ detail: 'Not found.' }, 404));

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json(err.body, err.status);
    }
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'unhandled_error',
        path: c.req.path,
        method: c.req.method,
        message: err instanceof Error ? err.message : String(err),
      }),
    );
    return c.json({ message: 'Internal server error' }, 500);
  });

  return app;
}

/** Re-exported so the hourly cron shares the exact list-path logic. */
export { sweepOverdueTasks };
