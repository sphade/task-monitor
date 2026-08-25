import { beforeEach, describe, expect, it } from 'vitest';

import { callJson, jsonRequest, loginAs, setupTest, type TestCtx } from './harness';

let ctx: TestCtx;
let admin: { token: string; userId: number };
let manager: { token: string; userId: number };
let sam: { token: string; userId: number };
let tola: { token: string; userId: number };

beforeEach(async () => {
  ctx = setupTest();
  admin = await loginAs(ctx, 'admin@orangeinvent.house');
  manager = await loginAs(ctx, 'paul@orangeinvent.house');
  sam = await loginAs(ctx, 'sam@orangeinvent.house');
  tola = await loginAs(ctx, 'tola@orangeinvent.house');
});

interface MsgDto {
  id: number;
  conversation: number;
  sender: number;
  recipient: number;
  content: string;
  status: string;
  is_read: boolean;
}

async function send(from: { token: string }, recipientId: number, content: string): Promise<Response> {
  return ctx.app.request(
    '/v1/chat/messages/',
    jsonRequest('POST', '/', { recipient: recipientId, content }, from.token),
    ctx.env,
  );
}

describe('chat REST', () => {
  it('sends a message and derives/creates the thread from the recipient', async () => {
    const res = await send(manager, sam.userId, 'Morning Sam — standup at 10?');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: MsgDto };
    expect(body.data.recipient).toBe(sam.userId);
    expect(body.data.sender).toBe(manager.userId);
    expect(body.data.status).toBe('sent');
    expect(body.data.is_read).toBe(false);
  });

  it('is idempotent about threads — same pair, one conversation', async () => {
    const first = ((await (await send(manager, sam.userId, 'one')).json())) as { data: MsgDto };
    const second = ((await (await send(sam, manager.userId, 'two')).json())) as { data: MsgDto };
    // Replying in either direction lands in the SAME thread.
    expect(second.data.conversation).toBe(first.data.conversation);

    const reply = ((await (await send(manager, sam.userId, 'three')).json())) as { data: MsgDto };
    expect(reply.data.conversation).toBe(first.data.conversation);
  });

  it('scopes the conversations list to the caller', async () => {
    await send(manager, sam.userId, 'm→s');
    await send(manager, tola.userId, 'm→t');

    // Seed already contains a manager↔sam thread with two messages.
    const mine = (await callJson(ctx, 'GET', '/v1/chat/conversations/', undefined, manager.token)).body as { count: number };
    expect(mine.count).toBe(4);

    const theirs = (await callJson(ctx, 'GET', '/v1/chat/conversations/', undefined, tola.token)).body as { count: number };
    expect(theirs.count).toBe(1);

    // A user with no traffic sees nothing of theirs.
    const adminList = (await callJson(ctx, 'GET', '/v1/chat/conversations/', undefined, admin.token)).body as { count: number };
    expect(adminList.count).toBe(0);
  });

  it('returns a thread ascending for participants and blocks outsiders', async () => {
    // manager↔tola has NO seed history — a brand-new thread.
    const first = ((await (await send(manager, tola.userId, 'first')).json())) as { data: MsgDto };
    const cId = first.data.conversation;

    const outsider = await ctx.app.request(
      `/v1/chat/conversations/${cId}/`,
      jsonRequest('GET', '/', undefined, sam.token),
      ctx.env,
    );
    expect(outsider.status).toBe(403);

    await send(tola, manager.userId, 'second');
    const threadAfter = (await callJson(ctx, 'GET', `/v1/chat/conversations/${cId}/`, undefined, tola.token)).body as {
      count: number;
      results: MsgDto[];
    };
    expect(threadAfter.count).toBe(2);
    expect(threadAfter.results.map((m) => m.content)).toEqual(['first', 'second']);
  });

  it('marks only MY received messages read and broadcasts the event', async () => {
    await send(manager, sam.userId, 'please read this');
    const listForSam = (await callJson(ctx, 'GET', '/v1/chat/conversations/', undefined, sam.token)).body as { results: MsgDto[] };
    const conversationId = listForSam.results[0]!.conversation;

    const markRes = await ctx.app.request(
      `/v1/chat/conversations/${conversationId}/read/`,
      jsonRequest('POST', '/', {}, sam.token),
      ctx.env,
    );
    expect(markRes.status).toBe(200);
    const markBody = (await markRes.json()) as { data: { updated: number } };
    expect(markBody.data.updated).toBe(1);

    // Manager's copy of their own sent message is unaffected.
    const listForManager = (await callJson(ctx, 'GET', '/v1/chat/conversations/', undefined, manager.token)).body as { results: MsgDto[] };
    const sent = listForManager.results.find((m) => m.sender === manager.userId)!;
    expect(sent.is_read).toBe(true); // now read by recipient

    // Broadcast fan-out reached the room stub.
    const events = ctx.broadcasts.map((b) => JSON.parse(b) as { type: string });
    expect(events.some((e) => e.type === 'message.new')).toBe(true);
    expect(events.some((e) => e.type === 'message.read')).toBe(true);
  });

  it('validates recipient and self-send rules', async () => {
    const badUser = await send(manager, 999999, 'hi');
    expect(badUser.status).toBe(400);

    const selfSend = await send(manager, manager.userId, 'note to self');
    expect(selfSend.status).toBe(400);
    const body = (await selfSend.json()) as { errors: Record<string, string[]> };
    expect(body.errors['recipient']?.[0]).toMatch(/yourself/i);
  });
});
