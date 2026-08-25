import { makeDb } from '@/db/client';
import { sweepOverdueTasks } from '@/app';
import { ChatRoom } from '@/durable/chat-room';
import { createApp } from '@/app';
import type { Env } from '@/types';

// Durable Object classes must be exported from the entrypoint for wrangler.
export { ChatRoom };

const app = createApp();

export default {
  fetch: (request, env, ctx) => app.fetch(request, env, ctx),
  /** Hourly cron: mark lapsed tasks overdue even when nobody opens the app. */
  scheduled: (_event, env, ctx) => {
    ctx.waitUntil(sweepOverdueTasks(makeDb(env.DB)));
  },
} satisfies ExportedHandler<Env>;
