import { and, asc, desc, eq, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

import { conversations, messages, users } from '@/db/schema';
import { ApiError, ok, pageOf, paging, runBackground, zodFieldErrors, nowIso, firstOf } from '@/lib/http';
import { serializeMessage } from '@/lib/serialize';
import { requireAuth } from '@/middleware/auth';
import type { AppEnv } from '@/types';

/** Deterministic room name per conversation. */
export const roomNameFor = (conversationId: number) => `conv:${conversationId}`;

async function findOrCreateConversation(
  db: AppEnv['Variables']['services']['db'],
  userA: number,
  userB: number,
): Promise<number> {
  // Canonical ordering keeps the pair unique no matter who initiates.
  const [firstUserId, secondUserId] = userA < userB ? [userA, userB] : [userB, userA];
  await db
    .insert(conversations)
    .values({
      firstUserId,
      secondUserId,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    })
    .onConflictDoNothing();

  const [row] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.firstUserId, firstUserId), eq(conversations.secondUserId, secondUserId)))
    .limit(1);
  return row!.id;
}

export function chatRoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use('*', requireAuth);

  /** Every message addressed to or authored by the caller, newest first. */
  app.get('/conversations/', async (c) => {
    const { services, auth } = c.var;
    const { size, offset } = paging(c);

    const rows = await services.db
      .select()
      .from(messages)
      .where(or(eq(messages.senderId, auth.userId), eq(messages.recipientId, auth.userId)))
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(size)
      .offset(offset);
    const { total } = firstOf(
      await services.db
        .select({ total: sql<number>`COUNT(*)` })
        .from(messages)
        .where(or(eq(messages.senderId, auth.userId), eq(messages.recipientId, auth.userId))),
    );

    return c.json(pageOf(rows.map(serializeMessage), total));
  });

  app.get('/conversations/:id/', async (c) => {
    const conversationId = Number(c.req.param('id'));
    if (!Number.isInteger(conversationId)) throw ApiError.notFound();

    const { services, auth } = c.var;
    const [conversation] = await services.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    if (!conversation) throw ApiError.notFound();

    const isParticipant =
      conversation.firstUserId === auth.userId || conversation.secondUserId === auth.userId;
    if (!isParticipant && !auth.isSuperuser) throw ApiError.forbidden();

    const rows = await services.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt), asc(messages.id));
    return c.json(pageOf(rows.map(serializeMessage), rows.length));
  });

  app.post('/messages/', async (c) => {
    const schema = z.object({
      recipient: z.number().int().positive(),
      content: z.string().trim().min(1).max(4000),
    });
    const parsed = schema.safeParse(await c.req.json());
    if (!parsed.success) throw ApiError.fieldErrors(zodFieldErrors(parsed.error));

    const { services, auth } = c.var;
    const [recipient] = await services.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, parsed.data.recipient))
      .limit(1);
    if (!recipient) throw ApiError.fieldErrors({ recipient: ['Invalid recipient.'] });
    if (recipient.id === auth.userId) {
      throw ApiError.fieldErrors({ recipient: ['You cannot message yourself.'] });
    }

    const conversationId = await findOrCreateConversation(services.db, auth.userId, recipient.id);
    const now = nowIso();
    const [created] = await services.db
      .insert(messages)
      .values({
        conversationId,
        senderId: auth.userId,
        recipientId: recipient.id,
        content: parsed.data.content,
        status: 'sent',
        isRead: false,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    const dto = serializeMessage(created!);

    // Fan out to connected WebSocket clients; persistence already succeeded so
    // this is fire-and-forget off the critical path.
    runBackground(c, async () => {
      try {
        const stub = services.roomStub(roomNameFor(conversationId));
        await stub.broadcast(JSON.stringify({ type: 'message.new', message: dto }));
      } catch (e) {
        console.error('chat broadcast failed', e);
      }
    });

    return ok(c, dto, 'Message sent');
  });

  /** Marks the caller's received messages in a thread as read. */
  app.post('/conversations/:id/read/', async (c) => {
    const conversationId = Number(c.req.param('id'));
    const { services, auth } = c.var;

    const [conversation] = await services.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    if (!conversation) throw ApiError.notFound();
    if (conversation.firstUserId !== auth.userId && conversation.secondUserId !== auth.userId) {
      throw ApiError.forbidden();
    }

    const unreadIds = (
      await services.db
        .select({ id: messages.id })
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, conversationId),
            eq(messages.recipientId, auth.userId),
            eq(messages.isRead, false),
          ),
        )
    ).map((r) => r.id);

    for (const id of unreadIds) {
      await services.db
        .update(messages)
        .set({ isRead: true, status: 'read', updatedAt: nowIso() })
        .where(eq(messages.id, id));
    }

    if (unreadIds.length > 0) {
      runBackground(c, async () => {
        try {
          await services
            .roomStub(roomNameFor(conversationId))
            .broadcast(
              JSON.stringify({
                type: 'message.read',
                conversation: conversationId,
                reader: auth.userId,
              }),
            );
        } catch {
          // Fan-out is best-effort; persistence already succeeded.
        }
      });
    }

    return ok(c, { updated: unreadIds.length }, 'Conversation marked as read');
  });

  /**
   * Realtime upgrades: `/ws/{conversationId}?token=…`.
   * The worker verifies JWT + participation once, then hands the socket to the
   * Durable Object which owns broadcasting for that conversation.
   */
  app.get('/ws/:conversationId/', async (c) => {
    const conversationId = Number(c.req.param('conversationId'));
    if (!Number.isInteger(conversationId)) throw ApiError.notFound();

    const { services, auth } = c.var;
    const [conversation] = await services.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    if (!conversation) throw ApiError.notFound();
    if (conversation.firstUserId !== auth.userId && conversation.secondUserId !== auth.userId) {
      throw ApiError.forbidden();
    }

    const upgradeHeader = c.req.header('Upgrade');
    if (upgradeHeader?.toLowerCase() !== 'websocket') {
      throw ApiError.badRequest('Expected a WebSocket upgrade request.');
    }

    const stub = services.roomStub(roomNameFor(conversationId));
    // The DO re-derives identity from the forwarded header we set here.
    const forwardHeaders = new Headers(c.req.raw.headers);
    forwardHeaders.set('X-User-Id', String(auth.userId));
    forwardHeaders.set('X-Conversation-Id', String(conversationId));
    const forwardRequest = new Request(c.req.raw, { headers: forwardHeaders });
    return stub.forward(forwardRequest);
  });

  return app;
}
