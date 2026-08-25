import { beforeEach, describe, expect, it } from 'vitest';

import { callJson, jsonRequest, loginAs, setupTest, type TestCtx } from './harness';

let ctx: TestCtx;
let admin: { token: string; userId: number };
let manager: { token: string; userId: number };
let sam: { token: string; userId: number };

beforeEach(async () => {
  ctx = setupTest();
  admin = await loginAs(ctx, 'admin@orangeinvent.house');
  manager = await loginAs(ctx, 'paul@orangeinvent.house');
  sam = await loginAs(ctx, 'sam@orangeinvent.house');
});

describe('staff directory', () => {
  it('returns the exact StaffDto shape the mobile mapper consumes', async () => {
    const res = await ctx.app.request(
      '/v1/console/staff/',
      jsonRequest('GET', '/', undefined, manager.token),
      ctx.env,
    );
    expect(res.status).toBe(200);
    const page = (await res.json()) as {
      count: number;
      results: Record<string, unknown>[];
    };

    expect(page.count).toBe(4);
    const samRow = page.results.find((u) => u['email'] === 'sam@orangeinvent.house')!;
    expect(samRow['name']).toBe('Sam Staff');
    expect(samRow['initials']).toBe('SS');
    expect(samRow['department_name']).toBe('Engineering');
    expect(samRow['role_display']).toBe('Staff');
    expect(samRow['location']).toBe('branch_office');
    expect(samRow['location_display']).toBe('Branch Office');
    expect(samRow['profile_photo_url']).toBe('');
    expect(samRow['is_active']).toBe(true);
  });

  it('searches by name or email', async () => {
    const res = await ctx.app.request(
      '/v1/console/staff/?search=sam',
      jsonRequest('GET', '/', undefined, manager.token),
      ctx.env,
    );
    const page = (await res.json()) as { count: number };
    expect(page.count).toBe(1);
  });

  it('patches staff behind CAN_MANAGE_STAFF only', async () => {
    // find tola's id via list
    const listRes = await ctx.app.request(
      '/v1/console/staff/',
      jsonRequest('GET', '/', undefined, manager.token),
      ctx.env,
    );
    const all = ((await listRes.json()) as { results: { id: number; name: string }[] }).results;
    const tolaId = all.find((u) => u.name === 'Tola Staff')!.id;

    // Manager only has CAN_VIEW_STAFF → blocked.
    const forbidden = await ctx.app.request(
      `/v1/console/staff/${tolaId}/`,
      jsonRequest('PATCH', '/', { is_active: false }, manager.token),
      ctx.env,
    );
    expect(forbidden.status).toBe(403);

    const okRes = await ctx.app.request(
      `/v1/console/staff/${tolaId}/`,
      jsonRequest('PATCH', '/', { employee_id: 'OIH-009', location: 'remote' }, admin.token),
      ctx.env,
    );
    expect(okRes.status).toBe(200);

    const detail = (await callJson(ctx, 'GET', `/v1/console/staff/${tolaId}/`, undefined, manager.token)).body as { data: { employee_id: string; location_display: string } };
    expect(detail.data.employee_id).toBe('OIH-009');
    expect(detail.data.location_display).toBe('Remote');
  });
});

describe('departments', () => {
  it('lists bare arrays for the picker', async () => {
    const res = await ctx.app.request(
      '/v1/console/departments/',
      jsonRequest('GET', '/', undefined, sam.token),
      ctx.env,
    );
    const rows = (await res.json()) as { name: string }[];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.map((d) => d.name)).toContain('Engineering');
  });

  it('guards mutations behind CAN_MANAGE_DEPARTMENTS', async () => {
    const createAsManager = await ctx.app.request(
      '/v1/console/departments/',
      jsonRequest('POST', '/', { name: 'Design' }, manager.token),
      ctx.env,
    );
    expect(createAsManager.status).toBe(403);

    const created = await ctx.app.request(
      '/v1/console/departments/',
      jsonRequest('POST', '/', { name: 'Design', description: 'Product design' }, admin.token),
      ctx.env,
    );
    expect(created.status).toBe(200);
    const deptId = ((await created.json()) as { data: { id: number } }).data.id;

    // Cannot delete a department that still has staff.
    const engRes = await ctx.app.request(
      '/v1/console/departments/',
      jsonRequest('GET', '/', undefined, admin.token),
      ctx.env,
    );
    const depts = (await engRes.json()) as { id: number; name: string }[];
    const engineeringId = depts.find((d) => d.name === 'Engineering')!.id;
    const blocked = await ctx.app.request(
      `/v1/console/departments/${engineeringId}/`,
      jsonRequest('DELETE', '/', undefined, admin.token),
      ctx.env,
    );
    expect(blocked.status).toBe(400);

    const deleted = await ctx.app.request(
      `/v1/console/departments/${deptId}/`,
      jsonRequest('DELETE', '/', undefined, admin.token),
      ctx.env,
    );
    expect(deleted.status).toBe(200);
  });
});

describe('roles & permissions', () => {
  it('exposes permission_details, allowed_modules and parent_name', async () => {
    const res = await ctx.app.request(
      '/v1/console/roles/',
      jsonRequest('GET', '/', undefined, sam.token),
      ctx.env,
    );
    const body = (await res.json()) as {
      results: {
        code: string;
        allowed_modules: string[];
        sidebar_modules: string[];
        permission_details: { name: string }[];
        parent_name: string;
      }[];
    };

    const adminRole = body.results.find((r) => r.code === 'ADMIN')!;
    expect(adminRole.allowed_modules.length).toBeGreaterThanOrEqual(5);
    expect(adminRole.permission_details.length).toBe(15);

    const staffRole = body.results.find((r) => r.code === 'STAFF')!;
    expect(staffRole.allowed_modules).not.toContain('ROLES');
    expect(staffRole.parent_name).toBe('');
  });

  it('creates roles with permissions and applies add/remove actions', async () => {
    const created = await ctx.app.request(
      '/v1/console/roles/',
      jsonRequest(
        'POST',
        '/',
        {
          name: 'Auditor',
          code: 'AUDITOR',
          description: 'Read-mostly oversight',
          permissions: ['CAN_VIEW_TASKS', 'CAN_VIEW_REPORTS'],
        },
        admin.token,
      ),
      ctx.env,
    );
    expect(created.status).toBe(200);
    const roleId = ((await created.json()) as { data: { id: number } }).data.id;

    const addPerms = await ctx.app.request(
      `/v1/console/roles/${roleId}/add-permissions/`,
      jsonRequest('POST', '/', { permissions: ['CAN_VIEW_STAFF'] }, admin.token),
      ctx.env,
    );
    expect(addPerms.status).toBe(200);

    let roles = (await callJson(ctx, 'GET', '/v1/console/roles/', undefined, admin.token)).body as { results: { id: number; permission_details: { name: string }[] }[] };
    let auditor = roles.results.find((r) => r.id === roleId)!;
    expect(auditor.permission_details.map((p) => p.name).sort()).toEqual([
      'CAN_VIEW_REPORTS',
      'CAN_VIEW_STAFF',
      'CAN_VIEW_TASKS',
    ]);

    const removePerms = await ctx.app.request(
      `/v1/console/roles/${roleId}/remove-permissions/`,
      jsonRequest('POST', '/', { permissions: ['CAN_VIEW_STAFF'] }, admin.token),
      ctx.env,
    );
    expect(removePerms.status).toBe(200);

    roles = (await callJson(ctx, 'GET', '/v1/console/roles/', undefined, admin.token)).body as never;
    auditor = roles.results.find((r) => r.id === roleId)!;
    expect(auditor.permission_details).toHaveLength(2);

    // Non-managers cannot touch roles.
    const forbidden = await ctx.app.request(
      `/v1/console/roles/${roleId}/`,
      jsonRequest('PATCH', '/', { description: 'x' }, manager.token),
      ctx.env,
    );
    expect(forbidden.status).toBe(403);

    // Empty role can be deleted.
    const deleted = await ctx.app.request(
      `/v1/console/roles/${roleId}/`,
      jsonRequest('DELETE', '/', undefined, admin.token),
      ctx.env,
    );
    expect(deleted.status).toBe(200);
  });

  it('refuses to delete roles with members', async () => {
    const roles = (await callJson(ctx, 'GET', '/v1/console/roles/', undefined, admin.token)).body as { results: { id: number; code: string }[] };
    const staffRole = roles.results.find((r) => r.code === 'STAFF')!;

    const res = await ctx.app.request(
      `/v1/console/roles/${staffRole.id}/`,
      jsonRequest('DELETE', '/', undefined, admin.token),
      ctx.env,
    );
    expect(res.status).toBe(400);
  });
});

describe('dashboard overview', () => {
  it('aggregates counts matching the seeded data', async () => {
    const res = await ctx.app.request(
      '/v1/console/dashboard/overview/',
      jsonRequest('GET', '/', undefined, manager.token),
      ctx.env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        total_tasks: number;
        completed_tasks: number;
        overdue_tasks: number;
        active_projects: number;
        staff_count: number;
        recent_tasks: unknown[];
      };
    };
    // Sweep already ran during other tests? This context is fresh — seed has
    // 4 tasks; sweep flips the lapsed pending one → overdue.
    expect(body.data.total_tasks).toBe(4);
    expect(body.data.completed_tasks).toBe(1);
    expect(body.data.overdue_tasks).toBe(2);
    expect(body.data.active_projects).toBe(1);
    expect(body.data.staff_count).toBe(4);
    expect(body.data.recent_tasks).toHaveLength(4 > 5 ? 5 : 4);
  });
});

describe('audit trail', () => {
  it('records entries for key actions and lists them newest first', async () => {
    // A mutation happened in beforeEach logins? No — but registration would.
    // Perform one now:
    await ctx.app.request(
      '/v1/tasks/projects/',
      jsonRequest('POST', '/', { name: 'Audit Probe' }, manager.token),
      ctx.env,
    );

    const res = await ctx.app.request(
      '/v1/audit/',
      jsonRequest('GET', '/', undefined, admin.token),
      ctx.env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      count: number;
      results: { audit_module: string; audit_type: string; actor_name: string }[];
    };
    expect(body.count).toBeGreaterThan(0);

    const projectCreate = body.results.find((r) => r.audit_type === 'PROJECT_CREATED');
    expect(projectCreate?.actor_name).toBe('Paul Manager');
    expect(projectCreate?.audit_module).toBe('TASKS');

    // Logins are audited too.
    expect(body.results.some((r) => r.audit_type === 'LOGIN_SUCCESS')).toBe(true);
  });
});
