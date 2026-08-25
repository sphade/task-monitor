import { beforeEach, describe, expect, it } from 'vitest';

import { callJson, jsonRequest, loginAs, setupTest, type TestCtx } from './harness';

let ctx: TestCtx;
let admin: { token: string; userId: number };
let manager: { token: string; userId: number };
let sam: { token: string; userId: number };
let tola: { token: string; userId: number };

interface GroupDto {
  id: number;
  name: string;
  is_team: boolean;
  member_ids: number[];
  member_count: number;
  unread_count: number;
  last_message_at: string | null;
}

async function myGroups(token: string): Promise<GroupDto[]> {
  const res = await callJson(ctx, 'GET', '/v1/chat/groups/', undefined, token);
  expect(res.status).toBe(200);
  return (res.body as { data: GroupDto[] }).data;
}

beforeEach(async () => {
  ctx = setupTest();
  admin = await loginAs(ctx, 'admin@orangeinvent.house');
  manager = await loginAs(ctx, 'paul@orangeinvent.house');
  sam = await loginAs(ctx, 'sam@orangeinvent.house');
  tola = await loginAs(ctx, 'tola@orangeinvent.house');
});

async function sendToConversation(from: { token: string }, conversationId: number, content: string) {
  return ctx.app.request(
    '/v1/chat/messages/',
    jsonRequest('POST', '/', { conversation: conversationId, content }, from.token),
    ctx.env,
  );
}

describe('whole-team room', () => {
  it('is auto-provisioned on first groups read and contains every active user', async () => {
    const groups = await myGroups(sam.token);
    const team = groups.find((g) => g.is_team);
    expect(team).toBeTruthy();
    expect(team!.name).toBe('Team');
    expect(team!.member_count).toBe(4); // all four seeded actives
    expect(team!.member_ids).toContain(manager.userId);
    expect(team!.member_ids).toContain(tola.userId);
  });

  it('is idempotent — no duplicate team rooms across calls', async () => {
    await myGroups(admin.token);
    const again = await myGroups(sam.token);
    expect(again.filter((g) => g.is_team)).toHaveLength(1);
  });

  it('mirrors staff lifecycle: deactivated accounts drop out of the room', async () => {
    // Deactivate Tola (admin has CAN_MANAGE_STAFF).
    await ctx.app.request(
      `/v1/console/staff/${tola.userId}/`,
      jsonRequest('PATCH', '/', { is_active: false }, admin.token),
      ctx.env,
    );

    const groups = await myGroups(sam.token);
    const team = groups.find((g) => g.is_team)!;
    expect(team.member_ids).not.toContain(tola.userId);
  });

  it('anyone in the room can post and everyone sees the message', async () => {
    const groups = await myGroups(sam.token);
    const team = groups.find((g) => g.is_team)!;

    const sent = await sendToConversation(tola, team.id, 'Standup in five!');
    expect(sent.status).toBe(200);

    for (const viewer of [manager.token, sam.token]) {
      const threadRes = await callJson(
        ctx,
        'GET',
        `/v1/chat/conversations/${team.id}/`,
        undefined,
        viewer,
      );
      const thread = threadRes.body as { results: { content: string; recipient: number | null }[] };
      expect(thread.results).toHaveLength(1);
      expect(thread.results[0]!.content).toBe('Standup in five!');
      // Group messages broadcast — no single recipient.
      expect(thread.results[0]!.recipient).toBeNull();
    }
  });
});

describe('group unreads & read state', () => {
  async function teamRoom(token: string): Promise<GroupDto> {
    return (await myGroups(token)).find((g) => g.is_team)!;
  }

  it('counts messages newer than MY read cursor, excluding my own', async () => {
    const team = await teamRoom(manager.token);
    await sendToConversation(tola, team.id, 'one');
    await sendToConversation(manager, team.id, 'two');
    await sendToConversation(tola, team.id, 'three');

    // Manager sent one of the three → 2 unread for them.
    let mine = await teamRoom(manager.token);
    expect(mine.unread_count).toBe(2);

    // Sam sent nothing → all 3 unread.
    const sams = await teamRoom(sam.token);
    expect(sams.unread_count).toBe(3);

    // Manager reads up.
    await callJson(ctx, 'POST', `/v1/chat/conversations/${team.id}/read/`, {}, manager.token);
    mine = await teamRoom(manager.token);
    expect(mine.unread_count).toBe(0);

    // …and Sam's count is untouched by that.
    const samsAfter = await teamRoom(sam.token);
    expect(samsAfter.unread_count).toBe(3);
  });

  it('exposes group activity through the flat message list too', async () => {
    const team = await teamRoom(manager.token);
    await sendToConversation(manager, team.id, 'hello team');

    const listRes = await callJson(
      ctx,
      'GET',
      '/v1/chat/conversations/',
      undefined,
      tola.token,
    );
    const list = listRes.body as { results: { conversation: number; recipient: number | null }[] };
    const groupMsg = list.results.find((m) => m.conversation === team.id);
    expect(groupMsg).toBeTruthy(); // tola sees the group message…
    // …even though they are neither sender nor a direct `recipient`.
    expect(groupMsg!.recipient).toBeNull();

    // And someone outside cannot see it — admins are superusers, so use a
    // fresh non-member via a private group instead.
    const created = (
      (
        await callJson(ctx, 'POST', '/v1/chat/groups/', { name: 'Skunkworks' }, sam.token)
      ).body as { data: { id: number } }
    ).data;
    await sendToConversation(sam, created.id, 'secret plans');

    const outsiderList = (
      await callJson(ctx, 'GET', '/v1/chat/conversations/', undefined, tola.token)
    ).body as { results: { conversation: number }[] };
    expect(outsiderList.results.some((m) => m.conversation === created.id)).toBe(false);
  });
});

describe('custom groups', () => {
  it('creates a group with members and gates posting to membership', async () => {
    const createdRes = await callJson(
      ctx,
      'POST',
      '/v1/chat/groups/',
      { name: 'Mobile Guild', member_ids: [sam.userId] },
      manager.token,
    );
    expect(createdRes.status).toBe(200);
    const group = (createdRes.body as { data: GroupDto }).data;
    expect(group.name).toBe('Mobile Guild');
    expect(group.member_count).toBe(2); // creator + sam

    const posted = await sendToConversation(sam, group.id, 'guild assemble');
    expect(posted.status).toBe(200);

    // Non-member (tola) cannot post or read…
    const forbiddenPost = await sendToConversation(tola, group.id, 'let me in');
    expect(forbiddenPost.status).toBe(403);
    const forbiddenRead = await callJson(
      ctx,
      'GET',
      `/v1/chat/conversations/${group.id}/`,
      undefined,
      tola.token,
    );
    expect(forbiddenRead.status).toBe(403);

    // …and does not see it in their groups list.
    const tolasGroups = await myGroups(tola.token);
    expect(tolasGroups.some((g) => g.id === group.id)).toBe(false);
  });

  it('lets the creator add and remove members; removal revokes access', async () => {
    const group = (
      (
        await callJson(ctx, 'POST', '/v1/chat/groups/', { name: 'Design Crit' }, manager.token)
      ).body as { data: GroupDto }
    ).data;

    const add = await callJson(
      ctx,
      'POST',
      `/v1/chat/groups/${group.id}/members/`,
      { user_ids: [tola.userId] },
      manager.token,
    );
    expect(add.status).toBe(200);

    // Random staff cannot manage membership.
    const forbiddenAdd = await callJson(
      ctx,
      'POST',
      `/v1/chat/groups/${group.id}/members/`,
      { user_ids: [sam.userId] },
      tola.token,
    );
    expect(forbiddenAdd.status).toBe(403);

    const removed = await callJson(
      ctx,
      'DELETE',
      `/v1/chat/groups/${group.id}/members/${tola.userId}/`,
      undefined,
      manager.token,
    );
    expect(removed.status).toBe(200);

    const revoked = await callJson(
      ctx,
      'GET',
      `/v1/chat/conversations/${group.id}/`,
      undefined,
      tola.token,
    );
    expect(revoked.status).toBe(403);
  });

  it('allows self-leave from custom groups but not from the Team room', async () => {
    const group = (
      (
        await callJson(ctx, 'POST', '/v1/chat/groups/', { name: 'Book Club' }, manager.token)
      ).body as { data: GroupDto }
    ).data;
    await callJson(
      ctx,
      'POST',
      `/v1/chat/groups/${group.id}/members/`,
      { user_ids: [sam.userId] },
      manager.token,
    );

    const leave = await callJson(
      ctx,
      'DELETE',
      `/v1/chat/groups/${group.id}/members/${sam.userId}/`,
      undefined,
      sam.token,
    );
    expect(leave.status).toBe(200);

    const team = (await myGroups(sam.token)).find((g) => g.is_team)!;
    const leaveTeam = await callJson(
      ctx,
      'DELETE',
      `/v1/chat/groups/${team.id}/members/${sam.userId}/`,
      undefined,
      sam.token,
    );
    expect(leaveTeam.status).toBe(400);
  });
});

describe('direct chat regression after group changes', () => {
  it('direct threads keep working exactly as before', async () => {
    const res = await ctx.app.request(
      '/v1/chat/messages/',
      jsonRequest('POST', '/', { recipient: sam.userId, content: 'still direct' }, manager.token),
      ctx.env,
    );
    expect(res.status).toBe(200);

    const list = (
      await callJson(ctx, 'GET', '/v1/chat/conversations/', undefined, manager.token)
    ).body as { count: number };
    // Two seeded direct messages + this one. Team room has no messages yet so
    // contributes nothing here.
    expect(list.count).toBe(3);
  });
});
