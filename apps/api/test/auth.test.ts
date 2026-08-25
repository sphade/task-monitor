import { beforeEach, describe, expect, it, vi } from 'vitest';

import { callJson, jsonRequest, loginAs, setupTest, type TestCtx } from './harness';

let ctx: TestCtx;
beforeEach(() => {
  ctx = setupTest();
});

/**
 * The mailer logs OTP codes (no provider wired in dev). Capture them so tests
 * can complete OTP flows without guessing.
 */
function captureOtpLogs(): { lastCode(purpose: string): string } {
  const codes: { purpose: string; code: string }[] = [];
  vi.spyOn(console, 'log').mockImplementation((first) => {
    try {
      const parsed = JSON.parse(String(first)) as { event?: string; purpose?: string; code?: string };
      if (parsed.event === 'otp_email' && parsed.purpose && parsed.code) {
        codes.push({ purpose: parsed.purpose, code: parsed.code });
      }
    } catch {
      // not one of ours
    }
  });
  return {
    lastCode(purpose: string): string {
      const found = [...codes].reverse().find((c) => c.purpose === purpose);
      if (!found) throw new Error(`no otp logged for ${purpose}`);
      return found.code;
    },
  };
}

async function login(
  loginId: string,
  password = 'Password123!',
): Promise<Response> {
  const otps = captureOtpLogs();
  const res1 = await ctx.app.request(
    '/v1/auth/login/',
    jsonRequest('POST', '/', { login: loginId, password }),
    ctx.env,
  );
  if (res1.status !== 200) return res1;
  const { otp_key } = ((await res1.json()) as { data: { otp_key: string } }).data;
  return ctx.app.request(
    '/v1/auth/verify-login/',
    jsonRequest('POST', '/', { otp: otps.lastCode('login'), temp_id: otp_key }),
    ctx.env,
  );
}

describe('health & discovery', () => {
  it('reports healthy with a connected database', async () => {
    const res = await ctx.app.request('/v1/health-check/', jsonRequest('GET', '/'), ctx.env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { status: string; database: string } };
    expect(body.data.status).toBe('ok');
    expect(body.data.database).toBe('connected');
  });

  it('returns DRF-style 404 bodies', async () => {
    const res = await ctx.app.request('/v1/does-not-exist/', jsonRequest('GET', '/'), ctx.env);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ detail: 'Not found.' });
  });
});

describe('two-step OTP login', () => {
  it('rejects bad credentials with field errors', async () => {
    const res = await ctx.app.request(
      '/v1/auth/login/',
      jsonRequest('POST', '/', { login: 'admin@orangeinvent.house', password: 'wrong' }),
      ctx.env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { message: string; errors: Record<string, string[]> };
    expect(body.message).toBe('Validation error');
    expect(body.errors['non_field_errors']?.[0]).toMatch(/invalid/i);
  });

  it('accepts username or email and returns an otp handle + dev code', async () => {
    ctx.env.DEBUG_SHOW_OTP = 'true';
    const res = await ctx.app.request(
      '/v1/auth/login/',
      jsonRequest('POST', '/', { login: 'staff.sam', password: 'Password123!' }),
      ctx.env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { otp_key: string; debug_otp?: string } };
    expect(body.data.otp_key).toBeTruthy();
    expect(body.data.debug_otp).toMatch(/^\d{6}$/);
  });

  it('completes login and returns a session shaped for the mobile client', async () => {
    const session = await loginAs(ctx, 'paul@orangeinvent.house');
    expect(session.token.split('.')).toHaveLength(3); // JWT
    expect(session.userId).toBeGreaterThan(0);

    const meRes = await ctx.app.request(
      '/v1/auth/staff/profile/',
      jsonRequest('GET', '/', undefined, session.token),
      ctx.env,
    );
    expect(meRes.status).toBe(200);
    const me = (await meRes.json()) as {
      data: {
        email: string;
        role: string;
        permissions: { name: string }[];
        allowed_modules: string[];
        sidebar_modules: string[];
      };
    };
    expect(me.data.email).toBe('paul@orangeinvent.house');
    expect(me.data.role).toBe('Manager');
    const names = me.data.permissions.map((p) => p.name);
    expect(names).toContain('CAN_ASSIGN_TASKS');
    expect(names).not.toContain('CAN_MANAGE_ROLES');
    expect(me.data.allowed_modules).toContain('TASKS');
    expect(me.data.sidebar_modules).toEqual(me.data.allowed_modules);
  });

  it('rejects a wrong otp without burning anything else', async () => {
    const otps = captureOtpLogs();
    const res1 = await ctx.app.request(
      '/v1/auth/login/',
      jsonRequest('POST', '/', { login: 'sam@orangeinvent.house', password: 'Password123!' }),
      ctx.env,
    );
    const { otp_key } = ((await res1.json()) as { data: { otp_key: string } }).data;

    const wrong = otps.lastCode('login') === '123456' ? '654321' : '123456';
    const res2 = await ctx.app.request(
      '/v1/auth/verify-login/',
      jsonRequest('POST', '/', { otp: wrong, temp_id: otp_key }),
      ctx.env,
    );
    expect(res2.status).toBe(400);

    // The correct code still verifies after one failed attempt.
    const res3 = await ctx.app.request(
      '/v1/auth/verify-login/',
      jsonRequest('POST', '/', { otp: otps.lastCode('login'), temp_id: otp_key }),
      ctx.env,
    );
    expect(res3.status).toBe(200);
  });

  it('resend refreshes the code under the SAME handle (mobile contract)', async () => {
    const otps = captureOtpLogs();
    const res1 = await ctx.app.request(
      '/v1/auth/login/',
      jsonRequest('POST', '/', { login: 'sam@orangeinvent.house', password: 'Password123!' }),
      ctx.env,
    );
    const { otp_key } = ((await res1.json()) as { data: { otp_key: string } }).data;
    const originalCode = otps.lastCode('login');

    // The client only ever POSTs { email } on resend — the handle must survive.
    await ctx.app.request(
      '/v1/auth/resend-otp/',
      jsonRequest('POST', '/', { email: 'sam@orangeinvent.house' }),
      ctx.env,
    );
    const refreshedCode = otps.lastCode('login');
    expect(refreshedCode).not.toBe(originalCode);

    // Old code no longer works…
    const stale = await ctx.app.request(
      '/v1/auth/verify-login/',
      jsonRequest('POST', '/', { otp: originalCode, temp_id: otp_key }),
      ctx.env,
    );
    expect(stale.status).toBe(400);

    // …and the ORIGINAL handle verifies with the refreshed code.
    const verify = await ctx.app.request(
      '/v1/auth/verify-login/',
      jsonRequest('POST', '/', { otp: refreshedCode, temp_id: otp_key }),
      ctx.env,
    );
    expect(verify.status).toBe(200);
  });

  it('never verifies twice (handle is consumed)', async () => {
    const otps = captureOtpLogs();
    const res1 = await ctx.app.request(
      '/v1/auth/login/',
      jsonRequest('POST', '/', { login: 'tola@orangeinvent.house', password: 'Password123!' }),
      ctx.env,
    );
    const { otp_key } = ((await res1.json()) as { data: { otp_key: string } }).data;
    const code = otps.lastCode('login');

    const good = await ctx.app.request(
      '/v1/auth/verify-login/',
      jsonRequest('POST', '/', { otp: code, temp_id: otp_key }),
      ctx.env,
    );
    expect(good.status).toBe(200);

    const replay = await ctx.app.request(
      '/v1/auth/verify-login/',
      jsonRequest('POST', '/', { otp: code, temp_id: otp_key }),
      ctx.env,
    );
    expect(replay.status).toBe(400);
  });

  it('hides debug_otp outside development', async () => {
    ctx.env.DEBUG_SHOW_OTP = 'false';
    const res = await ctx.app.request(
      '/v1/auth/login/',
      jsonRequest('POST', '/', { login: 'sam@orangeinvent.house', password: 'Password123!' }),
      ctx.env,
    );
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body.data['debug_otp']).toBeUndefined();
  });

  it('blacklists refresh tokens after logout', async () => {
    const session = await loginAs(ctx, 'sam@orangeinvent.house');

    const logoutRes = await ctx.app.request(
      '/v1/auth/logout/',
      jsonRequest('POST', '/', { refresh: session.refresh }, session.token),
      ctx.env,
    );
    expect(logoutRes.status).toBe(200);

    const refreshRes = await ctx.app.request(
      '/v1/auth/refresh/',
      jsonRequest('POST', '/', { refresh: session.refresh }),
      ctx.env,
    );
    expect(refreshRes.status).toBe(401);

    // A still-valid refresh can be exchanged before logout.
    const other = await loginAs(ctx, 'sam@orangeinvent.house');
    const okRefresh = await ctx.app.request(
      '/v1/auth/refresh/',
      jsonRequest('POST', '/', { refresh: other.refresh }),
      ctx.env,
    );
    expect(okRefresh.status).toBe(200);
  });

  it('401s protected endpoints without a token', async () => {
    const res = await ctx.app.request('/v1/tasks/', jsonRequest('GET', '/'), ctx.env);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { detail?: string };
    expect(body.detail).toBeTruthy();
  });

  it('401s on a garbage token', async () => {
    const res = await ctx.app.request(
      '/v1/tasks/',
      jsonRequest('GET', '/', undefined, 'not-a-jwt'),
      ctx.env,
    );
    expect(res.status).toBe(401);
  });

  it('deactivated accounts cannot sign in', async () => {
    const admin = await loginAs(ctx, 'admin@orangeinvent.house');
    const sam = await loginAs(ctx, 'sam@orangeinvent.house');

    const deact = await ctx.app.request(
      `/v1/console/staff/${sam.userId}/`,
      jsonRequest('PATCH', '/', { is_active: false }, admin.token),
      ctx.env,
    );
    expect(deact.status).toBe(200);

    const reLogin = await login('sam@orangeinvent.house');
    expect(reLogin.status).toBe(400);

    const oldToken = await ctx.app.request(
      '/v1/tasks/',
      jsonRequest('GET', '/', undefined, sam.token),
      ctx.env,
    );
    expect(oldToken.status).toBe(401);
  });
});

describe('registration (staff onboarding)', () => {
  const validMember = {
    name: 'Ngozi New',
    username: 'ngozi',
    email: 'ngozi@orangeinvent.house',
    phone: '+2348000000009',
    role: 3,
    department: 1,
    password: 'TempPass123!',
    confirm_password: 'TempPass123!',
  };

  it('lets CAN_MANAGE_STAFF holders create accounts', async () => {
    const admin = await loginAs(ctx, 'admin@orangeinvent.house');
    const res = await ctx.app.request(
      '/v1/auth/register/',
      jsonRequest('POST', '/', validMember, admin.token),
      ctx.env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { message: string };
    expect(body.message.toLowerCase()).toContain('created');

    // Visible in the assignee picker immediately.
    const raw: unknown = (
      await callJson(ctx, 'GET', '/v1/console/user-dropdown/', undefined, admin.token)
    ).body;
    // The dropdown returns a bare array; tolerate page envelopes too.
    const rows = Array.isArray(raw)
      ? (raw as { label: string }[])
      : ((raw as { results?: { label: string }[] }).results ?? []);
    expect(rows.map((u) => u.label)).toContain('Ngozi New');
  });

  it('blocks staff without CAN_MANAGE_STAFF', async () => {
    const staff = await loginAs(ctx, 'sam@orangeinvent.house');
    const res = await ctx.app.request(
      '/v1/auth/register/',
      jsonRequest(
        'POST',
        '/',
        { ...validMember, username: 'nope', email: 'nope@orangeinvent.house' },
        staff.token,
      ),
      ctx.env,
    );
    expect(res.status).toBe(403);
  });

  it('validates passwords and duplicates', async () => {
    const admin = await loginAs(ctx, 'admin@orangeinvent.house');
    const mismatch = await ctx.app.request(
      '/v1/auth/register/',
      jsonRequest(
        'POST',
        '/',
        {
          ...validMember,
          name: 'Mismatch Case',
          username: 'mismatch',
          email: 'mismatch@orangeinvent.house',
          confirm_password: 'Different1!',
        },
        admin.token,
      ),
      ctx.env,
    );
    expect(mismatch.status).toBe(400);

    const dupe = await ctx.app.request(
      '/v1/auth/register/',
      jsonRequest(
        'POST',
        '/',
        { ...validMember, name: 'Dupe User', username: 'dupe', email: 'sam@orangeinvent.house' },
        admin.token,
      ),
      ctx.env,
    );
    expect(dupe.status).toBe(400);
    const body = (await dupe.json()) as { errors: Record<string, string[]> };
    expect(body.errors['email']).toBeTruthy();
  });
});

describe('password reset flow', () => {
  it('returns the same shape whether or not the account exists', async () => {
    const hit = await ctx.app.request(
      '/v1/auth/forgot-password/',
      jsonRequest('POST', '/', { email: 'sam@orangeinvent.house' }),
      ctx.env,
    );
    const miss = await ctx.app.request(
      '/v1/auth/forgot-password/',
      jsonRequest('POST', '/', { email: 'ghost@orangeinvent.house' }),
      ctx.env,
    );
    const hitBody = (await hit.json()) as { data: { otp_key: string } };
    const missBody = (await miss.json()) as { data: { otp_key: string } };
    expect(hitBody.data.otp_key).not.toBe('');
    expect(missBody.data.otp_key).toBe('');
    expect(hit.status).toBe(miss.status);
  });

  it('completes the full forgot→verify→reset cycle', async () => {
    const otps = captureOtpLogs();

    const forgot = await ctx.app.request(
      '/v1/auth/forgot-password/',
      jsonRequest('POST', '/', { email: 'sam@orangeinvent.house' }),
      ctx.env,
    );
    const { otp_key } = ((await forgot.json()) as { data: { otp_key: string } }).data;

    const verify = await ctx.app.request(
      '/v1/auth/password-reset/verify/',
      jsonRequest('POST', '/', { otp: otps.lastCode('password-reset'), temp_id: otp_key }),
      ctx.env,
    );
    expect(verify.status).toBe(200);
    const { token_hash } = ((await verify.json()) as { data: { token_hash: string } }).data;
    expect(token_hash).toBeTruthy();

    const reset = await ctx.app.request(
      '/v1/auth/reset-password/',
      jsonRequest('POST', '/', {
        token: token_hash,
        password: 'NewPassword456!',
        confirm_password: 'NewPassword456!',
      }),
      ctx.env,
    );
    expect(reset.status).toBe(200);

    // Old password rejected, new password accepted.
    const oldLogin = await login('sam@orangeinvent.house');
    expect(oldLogin.status).toBe(400);
    const newLogin = await login('sam@orangeinvent.house', 'NewPassword456!');
    expect(newLogin.status).toBe(200);
  });

  it('rejects mismatched confirmation passwords', async () => {
    const otps = captureOtpLogs();
    const forgot = await ctx.app.request(
      '/v1/auth/forgot-password/',
      jsonRequest('POST', '/', { email: 'tola@orangeinvent.house' }),
      ctx.env,
    );
    const { otp_key } = ((await forgot.json()) as { data: { otp_key: string } }).data;

    const verify = await ctx.app.request(
      '/v1/auth/password-reset/verify/',
      jsonRequest('POST', '/', { otp: otps.lastCode('password-reset'), temp_id: otp_key }),
      ctx.env,
    );
    const { token_hash } = ((await verify.json()) as { data: { token_hash: string } }).data;

    const reset = await ctx.app.request(
      '/v1/auth/reset-password/',
      jsonRequest('POST', '/', {
        token: token_hash,
        password: 'NewPassword456!',
        confirm_password: 'Different456!',
      }),
      ctx.env,
    );
    expect(reset.status).toBe(400);
  });
});

describe('profile & change password', () => {
  it('returns and patches the signed-in profile', async () => {
    const session = await loginAs(ctx, 'sam@orangeinvent.house');
    const patch = await ctx.app.request(
      '/v1/auth/staff/profile/',
      jsonRequest('PATCH', '/', { bio: 'Mobile engineer.', office_phone: '+2347000000001' }, session.token),
      ctx.env,
    );
    expect(patch.status).toBe(200);

    const profile = await ctx.app.request(
      '/v1/auth/staff/profile/',
      jsonRequest('GET', '/', undefined, session.token),
      ctx.env,
    );
    const body = (await profile.json()) as { data: { id: number; name: string } };
    expect(body.data.id).toBe(session.userId);
  });

  it('changes password with the current one', async () => {
    const session = await loginAs(ctx, 'tola@orangeinvent.house');

    const badCurrent = await ctx.app.request(
      '/v1/auth/change-password/',
      jsonRequest(
        'POST',
        '/',
        {
          current_password: 'WrongCurrent1!',
          new_password: 'Changed789!x',
          confirm_password: 'Changed789!x',
        },
        session.token,
      ),
      ctx.env,
    );
    expect(badCurrent.status).toBe(400);

    const good = await ctx.app.request(
      '/v1/auth/change-password/',
      jsonRequest(
        'POST',
        '/',
        {
          current_password: 'Password123!',
          new_password: 'Changed789!x',
          confirm_password: 'Changed789!x',
        },
        session.token,
      ),
      ctx.env,
    );
    expect(good.status).toBe(200);

    const reLogin = await login('tola@orangeinvent.house', 'Changed789!x');
    expect(reLogin.status).toBe(200);
  });
});
