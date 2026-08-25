import { beforeEach, describe, expect, it } from 'vitest';

import { callJson, jsonRequest, loginAs, setupTest, type TestCtx } from './harness';

let ctx: TestCtx;
let admin: { token: string; userId: number };
let manager: { token: string; userId: number };
let sam: { token: string; userId: number };

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(async () => {
  ctx = setupTest();
  admin = await loginAs(ctx, 'admin@orangeinvent.house');
  manager = await loginAs(ctx, 'paul@orangeinvent.house');
  sam = await loginAs(ctx, 'sam@orangeinvent.house');
});

async function saveDoc(token: string, overrides: Record<string, unknown> = {}): Promise<Response> {
  return ctx.app.request(
    '/v1/documents/',
    jsonRequest(
      'POST',
      '/',
      {
        project: PROJECT_ID,
        document_type: 'PRD',
        content: '# PRD\n\nInitial scope.',
        ...overrides,
      },
      token,
    ),
    ctx.env,
  );
}

describe('documents (PRD/SDD repository)', () => {
  it('creates a v1 slot and bumps versions on re-save with history', async () => {
    const first = await saveDoc(manager.token);
    expect(first.status).toBe(200);
    const doc = ((await first.json()) as { data: { id: number; version: number; document_type: string } }).data;
    expect(doc.version).toBe(1);

    const second = await saveDoc(manager.token, {
      content: '# PRD\n\nAdds realtime section.',
      note: 'Added realtime',
    });
    expect(second.status).toBe(200);
    const updated = ((await second.json()) as { data: { id: number; version: number } }).data;
    expect(updated.id).toBe(doc.id); // same slot
    expect(updated.version).toBe(2);

    const revisions = (await callJson(ctx, 'GET', `/v1/documents/${doc.id}/revisions/`, undefined, sam.token)).body as {
      data: { version: number; note: string | null; editor_name: string }[];
    };
    expect(revisions.data.map((r) => r.version)).toEqual([1, 2]);
    expect(revisions.data[1]!.editor_name).toBe('Paul Manager');

    // Listing scoped to the project returns both slots? Only PRD saved so far.
    const list = (await callJson(ctx, 'GET', `/v1/documents/?project=${PROJECT_ID}`, undefined, sam.token)).body as { count: number; results: Record<string, unknown>[] };
    expect(list.count).toBe(1);
    expect(list.results[0]!['source']).toBe('inapp');
  });

  it('keeps PRD and SDD as separate slots per project', async () => {
    await saveDoc(manager.token);
    const sdd = await saveDoc(manager.token, {
      document_type: 'SDD',
      url: 'https://docs.example.com/sdd',
      content: null,
    });
    expect(sdd.status).toBe(200);

    const list = (await callJson(ctx, 'GET', `/v1/documents/?project=${PROJECT_ID}`, undefined, sam.token)).body as { count: number; results: { document_type: string; source: string }[] };
    expect(list.count).toBe(2);
    const sddRow = list.results.find((d) => d.document_type === 'SDD')!;
    expect(sddRow.source).toBe('link');
  });

  it('requires content or a link, and CAN_CREATE_DOCUMENTS to write', async () => {
    const empty = await saveDoc(manager.token, { content: null });
    expect(empty.status).toBe(400);

    // Staff role has no CAN_CREATE_DOCUMENTS in the seed.
    const forbidden = await saveDoc(sam.token);
    expect(forbidden.status).toBe(403);
  });

  it('supports comments with owner-only deletion', async () => {
    const doc = ((await (await saveDoc(admin.token)).json())) as { data: { id: number } };

    const add = await ctx.app.request(
      '/v1/documents/comments/',
      jsonRequest(
        'POST',
        '/',
        { document: doc.data.id, content: 'Does this cover offline drafts?' },
        sam.token,
      ),
      ctx.env,
    );
    expect(add.status).toBe(200);
    const comment = ((await add.json()) as { data: { id: number } }).data;

    const list = (await callJson(ctx, 'GET', `/v1/documents/comments/?document=${doc.data.id}`, undefined, manager.token)).body as { data: { id: number; commenter_name?: string }[] };
    expect(list.data).toHaveLength(1);

    // Manager is not the comment author → blocked.
    const foreignDelete = await ctx.app.request(
      `/v1/documents/comments/${comment.id}/`,
      jsonRequest('DELETE', '/', undefined, manager.token),
      ctx.env,
    );
    expect(foreignDelete.status).toBe(403);

    const ownDelete = await ctx.app.request(
      `/v1/documents/comments/${comment.id}/`,
      jsonRequest('DELETE', '/', undefined, sam.token),
      ctx.env,
    );
    expect(ownDelete.status).toBe(200);
  });

  it('deletes documents behind the create permission', async () => {
    const doc = ((await (await saveDoc(admin.token)).json())) as { data: { id: number } };

    const forbidden = await ctx.app.request(
      `/v1/documents/${doc.data.id}/`,
      jsonRequest('DELETE', '/', undefined, sam.token),
      ctx.env,
    );
    expect(forbidden.status).toBe(403);

    const okRes = await ctx.app.request(
      `/v1/documents/${doc.data.id}/`,
      jsonRequest('DELETE', '/', undefined, admin.token),
      ctx.env,
    );
    expect(okRes.status).toBe(200);
  });
});
