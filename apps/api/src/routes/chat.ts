import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { Hono } from 'hono';
import { z } from 'zod';

import { conversationMembers, conversations, messages, users } from '@/db/schema';
import { writeAudit } from '@/lib/audit';
import {
  ApiError,
  ok,
  pageOf,
  paging,
  runBackground,
  zodFieldErrors,
  nowIso,
} from '@/lib/http';
import { serializeMessage } from '@/lib/serialize';
import { requireAuth } from '@/middleware/auth';
import type { AppEnv } from '@/types';

/** Deterministic room name per conversation. */
export const roomNameFor = (conversationId: number) => `conv:${conversationId}`;

const creators = alias(users, 'creators');

/** Canonical ordered pair keeps direct threads unique no matter who initiates. */
async function findOrCreateConversation(
  db: AppEnv['Variables']['services']['db'],
  userA: number,
  userB: number,
): Promise<number> {
  const [firstUserId, secondUserId] = userA < userB ? [userA, userB] : [userB, userA];
  await db
    .insert(conversations)
    .values({
      kind: 'direct',
      firstUserId,
      secondUserId,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    })
    .onConflictDoNothing();

  const [row] = await db
    .select()
    .from(conversations)
    .where(
      and(eq(conversations.firstUserId, firstUserId), eq(conversations.secondUserId, secondUserId)),
    )
    .limit(1);
  return row!.id;
}

interface ConversationRow {
  id: number;
  kind: string;
  firstUserId: number | null;
  secondUserId: number | null;
}

/**
 * Throws unless the caller may read/write this thread: either side of a direct
 * conversation, or a member of a group. Superusers may moderate anything.
 */
async function assertParticipant(
  db: AppEnv['Variables']['services']['db'],
  conversation: ConversationRow | undefined,
  userId: number,
  isSuperuser: boolean,
): Promise<void> {
  if (!conversation) throw ApiError.notFound();
  if (isSuperuser) return;

  if (conversation.kind === 'group') {
    const [membership] = await db
      .select({ userId: conversationMembers.userId })
      .from(conversationMembers)
      .where(
        and(
          eq(conversationMembers.conversationId, conversation.id),
          eq(conversationMembers.userId, userId),
        ),
      )
      .limit(1);
    if (!membership) throw ApiError.forbidden();
    return;
  }

  if (conversation.firstUserId !== userId && conversation.secondUserId !== userId) {
    throw ApiError.forbidden();
  }
}

const TEAM_ROOM_NAME = 'Team';

/**
 * Whole-team room: auto-provisioned once, membership mirrored to every active
 * staff account. Removal from the org removes you; re-hiring re-adds.
 */
async function ensureTeamRoom(db: AppEnv['Variables']['services']['db']): Promise<number> {
  const [existing] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.isTeam, true))
    .limit(1);

  let teamId: number;
  if (existing) {
    teamId = existing.id;
  } else {
    const now = nowIso();
    const [created] = await db
      .insert(conversations)
      .values({
        kind: 'group',
        name: TEAM_ROOM_NAME,
        isTeam: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    teamId = created!.id;
  }

  const active = await db.select({ id: users.id }).from(users).where(eq(users.isActive, true));
  const current = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, teamId));
  const have = new Set(current.map((r) => r.userId));
  const missing = active.map((u) => u.id).filter((id) => !have.has(id));

  if (missing.length > 0) {
    const joinedAt = nowIso();
    await db
      .insert(conversationMembers)
      .values(missing.map((uid) => ({ conversationId: teamId, userId: uid, joinedAt })))
      .onConflictDoNothing();
  }
  return teamId;
}

export function chatRoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use('*', requireAuth);

  /**
   * Every message visible to the caller — direct threads AND group rooms —
   * newest first. Powers the client's derived conversation list.
   */
  app.get('/conversations/', async (c) => {
    const { services, auth } = c.var;
    const { size, offset } = paging(c);

    const myGroupIds = services.db
      .select({ id: conversationMembers.conversationId })
      .from(conversationMembers)
      .where(eq(conversationMembers.userId, auth.userId));

    const visible = or(
      eq(messages.senderId, auth.userId),
      eq(messages.recipientId, auth.userId),
      inArray(messages.conversationId, myGroupIds),
    );

    const rows = await services.db
      .select()
      .from(messages)
      .where(visible)
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(size)
      .offset(offset);
    const { total } = await totalVisible(services.db, auth.userId);

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
    await assertParticipant(services.db, conversation, auth.userId, auth.isSuperuser);

    const rows = await services.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt), asc(messages.id));
    return c.json(pageOf(rows.map(serializeMessage), rows.length));
  });

  /**
   * Send a message. Two shapes:
   *   `{ recipient, content }` → direct thread (find-or-create), or
   *   `{ conversation, content }` → post into an existing group/direct thread.
   * The sender is always derived from the JWT.
   */
  app.post('/messages/', async (c) => {
    const schema = z
      .object({
        recipient: z.number().int().positive().optional(),
        conversation: z.number().int().positive().optional(),
        content: z.string().trim().min(1).max(4000),
      })
      .refine((v) => v.recipient !== undefined || v.conversation !== undefined, {
        message: 'Provide either a recipient (direct) or a conversation (thread).',
      });
    const parsed = schema.safeParse(await c.req.json());
    if (!parsed.success) throw ApiError.fieldErrors(zodFieldErrors(parsed.error));
    const input = parsed.data;

    const { services, auth } = c.var;
    let conversationId: number;
    let recipientId: number | null;

    if (input.conversation !== undefined) {
      const [conversation] = await services.db
        .select()
        .from(conversations)
        .where(eq(conversations.id, input.conversation))
        .limit(1);
      await assertParticipant(services.db, conversation, auth.userId, auth.isSuperuser);
      conversationId = input.conversation;
      recipientId = null; // group broadcasts have no single recipient
    } else {
      const recipient = input.recipient!;
      const [target] = await services.db
        .select({ id: users.id, isActive: users.isActive })
        .from(users)
        .where(eq(users.id, recipient))
        .limit(1);
      if (!target || !target.isActive) {
        throw ApiError.fieldErrors({ recipient: ['Invalid recipient.'] });
      }
      if (target.id === auth.userId) {
        throw ApiError.fieldErrors({ recipient: ['You cannot message yourself.'] });
      }
      conversationId = await findOrCreateConversation(services.db, auth.userId, target.id);
      recipientId = target.id;
    }

    const now = nowIso();
    const [created] = await services.db
      .insert(messages)
      .values({
        conversationId,
        senderId: auth.userId,
        recipientId,
        content: input.content,
        status: 'sent',
        isRead: false,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    const dto = serializeMessage(created!);

    // Fan out to connected WebSocket clients off the critical path.
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

  /** Marks MY position in a thread read — per-user for groups, flags for direct. */
  app.post('/conversations/:id/read/', async (c) => {
    const conversationId = Number(c.req.param('id'));
    const { services, auth } = c.var;

    const [conversation] = await services.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    await assertParticipant(services.db, conversation, auth.userId, auth.isSuperuser);

    if (conversation!.kind === 'group') {
      await services.db
        .update(conversationMembers)
        .set({ lastReadAt: nowIso() })
        .where(
          and(
            eq(conversationMembers.conversationId, conversationId),
            eq(conversationMembers.userId, auth.userId),
          ),
        );
    } else {
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
    }

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

    return ok(c, { updated: 0 }, 'Conversation marked as read');
  });

  // ── Groups ──────────────────────────────────────────────────────────────

  interface GroupDto {
    id: number;
    kind: 'group';
    name: string;
    is_team: boolean;
    created_by: number | null;
    created_by_name: string | null;
    member_ids: number[];
    member_count: number;
    unread_count: number;
    last_message_at: string | null;
    created_at: string;
  }

  /** Lists my group rooms. Auto-provisions the whole-team room first. */
  app.get('/groups/', async (c) => {
    const { services, auth } = c.var;
    await ensureTeamRoom(services.db);

    const memberships = await services.db
      .select({
        id: conversations.id,
        name: conversations.name,
        isTeam: conversations.isTeam,
        createdBy: conversations.createdBy,
        createdAt: conversations.createdAt,
        lastReadAt: conversationMembers.lastReadAt,
        creatorName: creators.name,
      })
      .from(conversationMembers)
      .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
      .leftJoin(creators, eq(creators.id, conversations.createdBy))
      .where(
        and(eq(conversations.kind, 'group'), eq(conversationMembers.userId, auth.userId)),
      )
      .orderBy(desc(conversations.createdAt));

    const ids = memberships.map((m) => m.id);

    // Per-group unread (messages newer than MY read cursor, not mine) + activity.
    const statsByGroup = new Map<number, { unread: number; lastAt: string | null }>();
    if (ids.length > 0) {
      const stats = await services.db
        .select({
          id: messages.conversationId,
          unread: sql<number>`SUM(CASE WHEN ${messages.senderId} != ${auth.userId} AND ${messages.createdAt} > COALESCE(${conversationMembers.lastReadAt}, '') THEN 1 ELSE 0 END)`,
          lastAt: sql<string | null>`MAX(${messages.createdAt})`,
        })
        .from(messages)
        .innerJoin(
          conversationMembers,
          and(
            eq(conversationMembers.conversationId, messages.conversationId),
            eq(conversationMembers.userId, auth.userId),
          ),
        )
        .where(inArray(messages.conversationId, ids))
        .groupBy(messages.conversationId);
      for (const row of stats) statsByGroup.set(row.id, { unread: row.unread ?? 0, lastAt: row.lastAt });

      const memberRows = await services.db
        .select({
          conversationId: conversationMembers.conversationId,
          userId: conversationMembers.userId,
        })
        .from(conversationMembers)
        .where(inArray(conversationMembers.conversationId, ids));
      const membersByGroup = new Map<number, number[]>();
      for (const r of memberRows) {
        const list = membersByGroup.get(r.conversationId) ?? [];
        list.push(r.userId);
        membersByGroup.set(r.conversationId, list);
      }

      const results: GroupDto[] = memberships.map((m) => ({
        id: m.id,
        kind: 'group',
        name: m.name ?? 'Group',
        is_team: m.isTeam,
        created_by: m.createdBy,
        created_by_name: m.creatorName ?? null,
        member_ids: membersByGroup.get(m.id) ?? [],
        member_count: membersByGroup.get(m.id)?.length ?? 0,
        unread_count: statsByGroup.get(m.id)?.unread ?? 0,
        last_message_at: statsByGroup.get(m.id)?.lastAt ?? null,
        created_at: m.createdAt,
      }));
      return ok(c, results, 'Groups retrieved');
    }

    return ok(c, [] as GroupDto[], 'Groups retrieved');
  });

  /** Creates a group room. The creator is always a member. */
  app.post('/groups/', async (c) => {
    const schema = z.object({
      name: z.string().trim().min(1).max(80),
      member_ids: z.array(z.number().int().positive()).max(200).default([]),
    });
    const parsed = schema.safeParse(await c.req.json());
    if (!parsed.success) throw ApiError.fieldErrors(zodFieldErrors(parsed.error));

    const { services, auth } = c.var;
    const now = nowIso();
    const [created] = await services.db
      .insert(conversations)
      .values({
        kind: 'group',
        name: parsed.data.name,
        createdBy: auth.userId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const memberIds = [...new Set([auth.userId, ...parsed.data.member_ids])];
    await services.db
      .insert(conversationMembers)
      .values(memberIds.map((uid) => ({ conversationId: created!.id, userId: uid, joinedAt: now })));

    await writeAudit(services.db, {
      userId: auth.userId,
      actorName: auth.name,
      module: 'CHAT',
      action: 'GROUP_CREATED',
      description: `Created group "${parsed.data.name}" with ${memberIds.length} members`,
    });

    return ok(
      c,
      {
        id: created!.id,
        kind: 'group',
        name: created!.name,
        is_team: false,
        created_by: auth.userId,
        member_ids: memberIds,
        member_count: memberIds.length,
      },
      'Group created',
    );
  });

  const canManageGroups = (auth: AppEnv['Variables']['auth']) =>
    auth.isSuperuser || auth.permissions.has('CAN_MANAGE_STAFF');

  /** Adds members. Creator, CAN_MANAGE_STAFF holders, or superusers only. */
  app.post('/groups/:id/members/', async (c) => {
    const groupId = Number(c.req.param('id'));
    const schema = z.object({ user_ids: z.array(z.number().int().positive()).min(1).max(200) });
    const parsed = schema.safeParse(await c.req.json());
    if (!parsed.success) throw ApiError.fieldErrors(zodFieldErrors(parsed.error));

    const { services, auth } = c.var;
    const [conversation] = await services.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, groupId))
      .limit(1);
    if (!conversation || conversation.kind !== 'group') throw ApiError.notFound();

    const isCreator = conversation.createdBy === auth.userId;
    if (!isCreator && !canManageGroups(auth)) throw ApiError.forbidden();

    const now = nowIso();
    await services.db
      .insert(conversationMembers)
      .values(
        [...new Set(parsed.data.user_ids)].map((uid) => ({
          conversationId: groupId,
          userId: uid,
          joinedAt: now,
        })),
      )
      .onConflictDoNothing();
    await services.db
      .update(conversations)
      .set({ updatedAt: now })
      .where(eq(conversations.id, groupId));

    return ok(c, {}, 'Members added');
  });

  /** Removes a member. Self-leave always allowed; kicking needs rights. */
  app.delete('/groups/:id/members/:userId/', async (c) => {
    const groupId = Number(c.req.param('id'));
    const targetId = Number(c.req.param('userId'));
    const { services, auth } = c.var;

    const [conversation] = await services.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, groupId))
      .limit(1);
    if (!conversation || conversation.kind !== 'group') throw ApiError.notFound();

    const leavingSelf = targetId === auth.userId;
    if (!leavingSelf) {
      const isCreator = conversation.createdBy === auth.userId;
      // Team-room membership mirrors active staff; only HR/superusers may prune.
      if (conversation.isTeam) {
        if (!canManageGroups(auth)) throw ApiError.forbidden();
      } else if (!isCreator && !canManageGroups(auth)) {
        throw ApiError.forbidden();
      }
    } else if (conversation.isTeam) {
      throw ApiError.badRequest('The team room includes everyone — ask HR to deactivate the account instead.');
    }

    await services.db
      .delete(conversationMembers)
      .where(
        and(
          eq(conversationMembers.conversationId, groupId),
          eq(conversationMembers.userId, targetId),
        ),
      );
    return ok(c, {}, 'Member removed');
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
    await assertParticipant(services.db, conversation, auth.userId, auth.isSuperuser);

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

async function totalVisible(
  db: AppEnv['Variables']['services']['db'],
  userId: number,
): Promise<{ total: number }> {
  const myGroupIds = db
    .select({ id: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, userId));

  const [row] = await db
    .select({ total: sql<number>`COUNT(*)` })
    .from(messages)
    .where(
      or(
        eq(messages.senderId, userId),
        eq(messages.recipientId, userId),
        inArray(messages.conversationId, myGroupIds),
      ),
    );
  return { total: row?.total ?? 0 };
}
