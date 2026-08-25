import { beforeEach, describe, expect, it } from 'vitest';

import { callJson, jsonRequest, loginAs, setupTest, type TestCtx } from './harness';

let ctx: TestCtx;
let admin: { token: string; userId: number };
let manager: { token: string; userId: number };
let sam: { token: string; userId: number };
let tola: { token: string; userId: number };

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(async () => {
  ctx = setupTest();
  admin = await loginAs(ctx, 'admin@orangeinvent.house');
  manager = await loginAs(ctx, 'paul@orangeinvent.house');
  sam = await loginAs(ctx, 'sam@orangeinvent.house');
  tola = await loginAs(ctx, 'tola@orangeinvent.house');
});

async function listTasks(query = '', token = manager.token): Promise<{ count: number; results: Record<string, unknown>[] }> {
  const res = await ctx.app.request(
    `/v1/tasks/${query}`,
    jsonRequest('GET', '/', undefined, token),
    ctx.env,
  );
  expect(res.status).toBe(200);
  return (await res.json()) as never;
}

describe('projects', () => {
  it('lists seeded projects as DRF pages', async () => {
    const page = (await callJson(ctx, 'GET', '/v1/tasks/projects/', undefined, sam.token)).body as { count: number; results: { id: string; name: string }[] };
    expect(page.count).toBe(1);
    expect(page.results[0]!.name).toBe('Mobile Platform');
    expect(page.results[0]!.id).toBe(PROJECT_ID);
  });

  it('creates, patches and deletes projects', async () => {
    const created = await ctx.app.request(
      '/v1/tasks/projects/',
      jsonRequest(
        'POST',
        '/',
        {
          name: 'Cloud Migration',
          description: 'Django → Workers',
          start_date: '2026-09-01',
          deadline: '2026-12-01',
        },
        manager.token,
      ),
      ctx.env,
    );
    expect(created.status).toBe(200);
    const project = ((await created.json()) as { data: { id: string } }).data;

    const patched = await ctx.app.request(
      `/v1/tasks/projects/${project.id}/`,
      jsonRequest('PATCH', '/', { description: 'Workers + D1 + DO' }, manager.token),
      ctx.env,
    );
    expect(patched.status).toBe(200);

    const detail = (await callJson(ctx, 'GET', `/v1/tasks/projects/${project.id}/`, undefined, manager.token)).body as { data: { description: string } };
    expect(detail.data.description).toBe('Workers + D1 + DO');

    // Staff cannot delete.
    const forbidden = await ctx.app.request(
      `/v1/tasks/projects/${project.id}/`,
      jsonRequest('DELETE', '/', undefined, sam.token),
      ctx.env,
    );
    expect(forbidden.status).toBe(403);

    const deleted = await ctx.app.request(
      `/v1/tasks/projects/${project.id}/`,
      jsonRequest('DELETE', '/', undefined, manager.token),
      ctx.env,
    );
    expect(deleted.status).toBe(200);
  });
});

describe('tasks', () => {
  it('returns the exact wire format the mobile DTOs expect', async () => {
    const page = await listTasks('', sam.token);
    expect(page.count).toBeGreaterThanOrEqual(3);

    const mine = page.results.find(
      (t) => t['title'] === 'Build dashboard metrics screen',
    ) as Record<string, unknown>;
    expect(mine).toBeTruthy();
    // assigned_to/assigned_by are display NAMES on read…
    expect(mine['assigned_to']).toBe('Sam Staff');
    expect(mine['assigned_by']).toBe('Paul Manager');
    // …user_role is the assignee's role name…
    expect(mine['user_role']).toBe('Staff');
    // …project is the uuid, and enums keep server casing.
    expect(mine['project']).toBe(PROJECT_ID);
    expect(mine['status']).toBe('in_progress');
    expect(mine['priority']).toBe('medium');
    expect(typeof mine['id']).toBe('number');
  });

  it('supports status/priority/search/project/ordering filters', async () => {
    // After the sweep no seeded task remains pending…
    const pending = await listTasks('?status=pending');
    expect(pending.count).toBe(0);

    // …and both lapsed ones show up overdue.
    const overdue = await listTasks('?status=overdue');
    expect(overdue.count).toBe(2);

    const high = await listTasks('?priority=high');
    expect(high.count).toBe(2);

    const search = await listTasks('?search=chat');
    expect(search.count).toBe(1);
    expect((search.results[0] as Record<string, unknown>)['title']).toContain('chat');

    const scoped = await listTasks(`?project_id=${PROJECT_ID}`);
    expect(scoped.count).toBeGreaterThanOrEqual(3);
  });

  it('creates tasks only for CAN_ASSIGN_TASKS holders and stamps lifecycle times', async () => {
    const created = await ctx.app.request(
      '/v1/tasks/',
      jsonRequest(
        'POST',
        '/',
        {
          project: PROJECT_ID,
          title: 'Wire realtime docs',
          description: null,
          assigned_to: tola.userId,
          priority: 'medium',
          deadline: '2026-10-01',
        },
        manager.token,
      ),
      ctx.env,
    );
    expect(created.status).toBe(200);
    const taskId = ((await created.json()) as { data: { id: number } }).data.id;

    // Move in progress → started_at stamped once.
    await ctx.app.request(
      `/v1/tasks/${taskId}/`,
      jsonRequest('PATCH', '/', { status: 'in_progress' }, tola.token),
      ctx.env,
    );
    const detail = (await callJson(ctx, 'GET', `/v1/tasks/${taskId}/`, undefined, manager.token)).body as { data: { started_at: string | null; completed_at: string | null } };
    expect(detail.data.started_at).toBeTruthy();
    expect(detail.data.completed_at).toBeNull();

    // Complete → completed_at stamped.
    await ctx.app.request(
      `/v1/tasks/${taskId}/`,
      jsonRequest('PATCH', '/', { status: 'completed' }, tola.token),
      ctx.env,
    );
    const done = (await callJson(ctx, 'GET', `/v1/tasks/${taskId}/`, undefined, manager.token)).body as { data: { completed_at: string | null } };
    expect(done.data.completed_at).toBeTruthy();
  });

  it('lets assignees move their own cards but not reassign', async () => {
    const boardPage = await listTasks('?assignee=' + sam.userId);
    const card = boardPage.results.find(
      (t) => t['title'] === 'Build dashboard metrics screen',
    ) as Record<string, unknown>;
    const cardId = card['id'] as number;

    const moved = await ctx.app.request(
      `/v1/tasks/${cardId}/`,
      jsonRequest('PATCH', '/', { status: 'completed' }, sam.token),
      ctx.env,
    );
    expect(moved.status).toBe(200);

    const reassign = await ctx.app.request(
      `/v1/tasks/${cardId}/`,
      jsonRequest('PATCH', '/', { assigned_to: tola.userId }, sam.token),
      ctx.env,
    );
    expect(reassign.status).toBe(403);
  });

  it('blocks staff without CAN_ASSIGN_TASKS from creating tasks', async () => {
    const res = await ctx.app.request(
      '/v1/tasks/',
      jsonRequest(
        'POST',
        '/',
        { project: PROJECT_ID, title: 'Nope', assigned_to: sam.userId },
        sam.token,
      ),
      ctx.env,
    );
    expect(res.status).toBe(403);
  });

  it('sweeps lapsed tasks to overdue on read', async () => {
    // Seed contains "Ship chat module" with deadline 2026-08-20 still pending —
    // a read must flip it since that date is in the past.
    const page = await listTasks();
    const chatTask = page.results.find((t) => t['title'] === 'Ship chat module') as Record<
      string,
      unknown
    >;
    expect(chatTask['status']).toBe('overdue');
  });

  it('deletes tasks behind CAN_DELETE_TASKS', async () => {
    const page = await listTasks('?search=audit');
    const auditTask = page.results[0]! as Record<string, unknown>;
    const taskId = auditTask['id'] as number;

    const forbidden = await ctx.app.request(
      `/v1/tasks/${taskId}/`,
      jsonRequest('DELETE', '/', undefined, tola.token),
      ctx.env,
    );
    expect(forbidden.status).toBe(403);

    const okRes = await ctx.app.request(
      `/v1/tasks/${taskId}/`,
      jsonRequest('DELETE', '/', undefined, admin.token),
      ctx.env,
    );
    expect(okRes.status).toBe(200);

    const missing = await ctx.app.request(
      `/v1/tasks/${taskId}/`,
      jsonRequest('GET', '/', undefined, admin.token),
      ctx.env,
    );
    expect(missing.status).toBe(404);
  });

  it('validates enum filters', async () => {
    const res = await ctx.app.request(
      '/v1/tasks/?status=bogus',
      jsonRequest('GET', '/', undefined, manager.token),
      ctx.env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { errors?: Record<string, string[]> };
    expect(body.errors?.['status']).toBeTruthy();
  });
});

describe('reports', () => {
  let parentTaskId: number;

  beforeEach(async () => {
    const page = await listTasks('?search=metrics');
    parentTaskId = (page.results[0]! as Record<string, unknown>)['id'] as number;
  });

  it('creates reports attached to tasks with hyphenated statuses', async () => {
    const created = await ctx.app.request(
      '/v1/reports/',
      jsonRequest(
        'POST',
        '/',
        { parent_task: parentTaskId, note: 'Charts done, starting polish.', status: 'in-progress' },
        sam.token,
      ),
      ctx.env,
    );
    expect(created.status).toBe(200);

    const list = (await callJson(ctx, 'GET', '/v1/reports/', undefined, manager.token)).body as {
      count: number;
      results: { username: string; user_role: string; status: string; note: string }[];
    };

    const report = list.results.find((r) => r.note.startsWith('Charts done'))!;
    expect(report.username).toBe('Sam Staff');
    expect(report.user_role).toBe('Staff');
    expect(report.status).toBe('in-progress'); // hyphenated on the wire!
  });

  it('owners may edit their own reports; others need permission', async () => {
    const created = await ctx.app.request(
      '/v1/reports/',
      jsonRequest('POST', '/', { parent_task: parentTaskId, note: 'Draft' }, tola.token),
      ctx.env,
    );
    const reportId = ((await created.json()) as { data: { id: number } }).data.id;

    const selfEdit = await ctx.app.request(
      `/v1/reports/${reportId}/`,
      jsonRequest('PATCH', '/', { note: 'Final', status: 'done' }, tola.token),
      ctx.env,
    );
    expect(selfEdit.status).toBe(200);

    // Sam has CAN_CREATE_REPORTS but not CAN_UPDATE_REPORTS.
    const foreign = await ctx.app.request(
      `/v1/reports/${reportId}/`,
      jsonRequest('PATCH', '/', { note: 'hijack' }, sam.token),
      ctx.env,
    );
    expect(foreign.status).toBe(403);

    // Admin can moderate anything.
    const moderated = await ctx.app.request(
      `/v1/reports/${reportId}/`,
      jsonRequest('PATCH', '/', { status: 'pending' }, admin.token),
      ctx.env,
    );
    expect(moderated.status).toBe(200);
  });

  it('rejects reports against invalid parents', async () => {
    const res = await ctx.app.request(
      '/v1/reports/',
      jsonRequest('POST', '/', { parent_task: 999999, note: 'x' }, sam.token),
      ctx.env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { errors: Record<string, string[]> };
    expect(body.errors['parent_task']).toBeTruthy();
  });
});
