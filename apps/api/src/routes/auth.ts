import { and, eq, gte, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

import { departments, roles, tasks, users } from '@/db/schema';
import type { Db } from '@/db/client';
import { writeAudit } from '@/lib/audit';
import { hashPassword, verifyPassword } from '@/lib/crypto';
import { ApiError, ok, zodFieldErrors, nowIso } from '@/lib/http';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  signToken,
  verifyToken,
} from '@/lib/jwt';
import { sendOtpEmail } from '@/lib/mailer';
import {
  clearLoginEmailIndex,
  consumeLoginOtp,
  consumeResetOtp,
  consumeResetToken,
  createLoginOtp,
  createResetOtp,
  resendLoginOtp,
} from '@/lib/otp';
import { serializeAuthUser } from '@/lib/serialize';
import { requireAuth } from '@/middleware/auth';
import type { AppEnv } from '@/types';

const credentials = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
  remember_me: z.boolean().optional(),
});

const otpVerify = z.object({
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code.'),
  temp_id: z.string().min(1),
});

const registerInput = z
  .object({
    name: z.string().trim().min(2).max(255),
    username: z
      .string()
      .trim()
      .min(3)
      .max(150)
      .regex(/^[\w.@+-]+$/, 'Letters, digits and @/./+/-/_ only.'),
    email: z.string().trim().toLowerCase().email(),
    phone: z.string().trim().max(50).nullish(),
    role: z.number().int().positive(),
    department: z.number().int().positive().nullish(),
    password: z.string().min(8, 'Password must be at least 8 characters.'),
    confirm_password: z.string().min(1),
  })
  .refine((v) => v.password === v.confirm_password, {
    path: ['confirm_password'],
    message: 'Passwords do not match.',
  });

const changePasswordInput = z
  .object({
    current_password: z.string().min(1),
    new_password: z.string().min(8, 'New password must be at least 8 characters.'),
    confirm_password: z.string().min(1),
  })
  .refine((v) => v.new_password === v.confirm_password, {
    path: ['confirm_password'],
    message: 'Passwords do not match.',
  });

const profilePatch = z.object({
  name: z.string().trim().min(2).max(255).optional(),
  phone: z.string().trim().max(50).nullish(),
  bio: z.string().max(2000).nullish(),
  office_phone: z.string().trim().max(50).nullish(),
  location: z.enum(['headquarters', 'branch_office', 'regional_office', 'remote']).optional(),
  profile_photo: z.string().url().nullish(),
  department: z.number().int().positive().nullish(),
});

/** Matches on email OR username — the mobile login field takes either. */
async function findUserByLogin(db: Db, login: string) {
  const needle = login.trim().toLowerCase();
  const [user] = await db
    .select()
    .from(users)
    .where(or(eq(users.email, needle), eq(users.username, login.trim())))
    .limit(1);
  return user ?? null;
}

function invalidCredentials(): ApiError {
  return ApiError.fieldErrors({
    non_field_errors: ['Invalid username/email or password.'],
  });
}

export function authRoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // ── Login step one: credentials → OTP handle ────────────────────────────
  app.post('/login/', async (c) => {
    const parsed = credentials.safeParse(await c.req.json());
    if (!parsed.success) throw ApiError.fieldErrors(zodFieldErrors(parsed.error));

    const { services } = c.var;
    const user = await findUserByLogin(services.db, parsed.data.login);
    const passwordOk =
      user && user.isActive ? await verifyPassword(parsed.data.password, user.passwordHash) : false;
    if (!user || !passwordOk) throw invalidCredentials();

    const otp = await createLoginOtp(services.kv, user.email, user.id);
    await sendOtpEmail(user.email, otp.code, 'login');
    await writeAudit(services.db, {
      userId: user.id,
      actorName: user.name,
      module: 'AUTH',
      action: 'LOGIN_REQUESTED',
      description: `OTP issued for ${user.email}`,
      ipAddress: c.req.header('CF-Connecting-IP'),
    });

    const data: Record<string, unknown> = { otp_key: otp.handle };
    if (services.showOtpInResponses) data.debug_otp = otp.code;
    return ok(c, data, 'A verification code has been sent to your email.');
  });

  // ── Login step two: OTP → JWT session ───────────────────────────────────
  app.post('/verify-login/', async (c) => {
    const parsed = otpVerify.safeParse(await c.req.json());
    if (!parsed.success) throw ApiError.fieldErrors(zodFieldErrors(parsed.error));

    const { services } = c.var;
    const result = await consumeLoginOtp(services.kv, parsed.data.temp_id, parsed.data.otp);
    if (!result) throw invalidCredentials();

    const [user] = await services.db
      .select()
      .from(users)
      .where(eq(users.id, result.userId))
      .limit(1);
    if (!user || !user.isActive) throw invalidCredentials();

    await clearLoginEmailIndex(services.kv, user.email);

    const token = await signToken(services.jwtSecret, {
      userId: user.id,
      typ: 'access',
      name: user.name,
      roleId: user.roleId,
      ttlSeconds: ACCESS_TOKEN_TTL_SECONDS,
    });
    const refresh = await signToken(services.jwtSecret, {
      userId: user.id,
      typ: 'refresh',
      name: user.name,
      roleId: user.roleId,
      ttlSeconds: REFRESH_TOKEN_TTL_SECONDS,
    });

    await writeAudit(services.db, {
      userId: user.id,
      actorName: user.name,
      module: 'AUTH',
      action: 'LOGIN_SUCCESS',
      description: `${user.email} signed in`,
      ipAddress: c.req.header('CF-Connecting-IP'),
    });

    return ok(
      c,
      { token, refresh, user: await serializeAuthUser(services.db, user) },
      'Login successful',
    );
  });

  // ── Resend keeps the SAME handle the client already holds ───────────────
  app.post('/resend-otp/', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { email?: string };
    const email = (body.email ?? '').trim().toLowerCase();
    if (!email) throw ApiError.fieldErrors({ email: ['This field is required.'] });

    const { services } = c.var;
    const [user] = await services.db.select().from(users).where(eq(users.email, email)).limit(1);
    // Do not reveal whether the account exists.
    if (!user) return ok(c, {}, 'A new code has been sent to your email.');

    const otp = await resendLoginOtp(services.kv, user.email, user.id);
    await sendOtpEmail(user.email, otp.code, 'login');
    return ok(c, { otp_key: otp.handle }, 'A new code has been sent to your email.');
  });

  // ── Register (staff onboarding; requires CAN_MANAGE_STAFF) ──────────────
  app.use('/register/', requireAuth);
  app.post('/register/', async (c) => {
    const parsed = registerInput.safeParse(await c.req.json());
    if (!parsed.success) throw ApiError.fieldErrors(zodFieldErrors(parsed.error));
    const input = parsed.data;

    const { services, auth } = c.var;
    if (!auth.isSuperuser && !auth.permissions.has('CAN_MANAGE_STAFF')) {
      throw ApiError.forbidden();
    }

    const [role] = await services.db.select().from(roles).where(eq(roles.id, input.role)).limit(1);
    if (!role) throw ApiError.fieldErrors({ role: ['Invalid role.'] });

    if (input.department) {
      const [dept] = await services.db
        .select()
        .from(departments)
        .where(eq(departments.id, input.department))
        .limit(1);
      if (!dept) throw ApiError.fieldErrors({ department: ['Invalid department.'] });
    }

    const clashes = await findUserByLogin(services.db, input.email);
    if (clashes?.username === input.username || clashes?.email === input.email) {
      throw ApiError.fieldErrors({
        ...(clashes.email === input.email ? { email: ['A user with this email already exists.'] } : {}),
        ...(clashes.username === input.username
          ? { username: ['A user with this username already exists.'] }
          : {}),
      });
    }

    const now = nowIso();
    const [created] = await services.db
      .insert(users)
      .values({
        username: input.username,
        name: input.name,
        email: input.email,
        phone: input.phone ?? null,
        passwordHash: await hashPassword(input.password),
        roleId: input.role,
        departmentId: input.department ?? null,
        isVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await writeAudit(services.db, {
      userId: auth.userId,
      actorName: auth.name,
      module: 'HR_SETTINGS',
      action: 'USER_REGISTERED',
      description: `Created staff account for ${created!.email}`,
    });

    return ok(c, { id: created!.id }, 'Account created successfully');
  });

  // ── Logout: blacklist the refresh token until it would expire ───────────
  app.post('/logout/', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { refresh?: string };
    const refresh = body.refresh;
    if (refresh) {
      const { services } = c.var;
      const claims = await verifyToken(services.jwtSecret, refresh, 'refresh');
      if (claims) {
        const ttl = REFRESH_TOKEN_TTL_SECONDS;
        await services.kv.put(`blacklist:${claims.jti}`, '1', { expirationTtl: ttl });
      }
    }
    return ok(c, {}, 'Logout successful');
  });

  // ── Forgot password: issue reset code ───────────────────────────────────
  app.post('/forgot-password/', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { email?: string };
    const email = (body.email ?? '').trim().toLowerCase();
    if (!email) throw ApiError.fieldErrors({ email: ['This field is required.'] });

    const { services } = c.var;
    const [user] = await services.db.select().from(users).where(eq(users.email, email)).limit(1);
    let handle = '';
    if (user) {
      const otp = await createResetOtp(services.kv, user.email, user.id);
      handle = otp.handle;
      await sendOtpEmail(user.email, otp.code, 'password-reset');
    }
    // Identical response either way so accounts cannot be enumerated.
    return ok(c, { otp_key: handle }, 'If the email exists, a reset code has been sent.');
  });

  // ── Verify reset code → token_hash ──────────────────────────────────────
  app.post('/password-reset/verify/', async (c) => {
    const parsed = otpVerify.safeParse(await c.req.json());
    if (!parsed.success) throw ApiError.fieldErrors(zodFieldErrors(parsed.error));

    const { services } = c.var;
    const tokenHash = await consumeResetOtp(services.kv, parsed.data.temp_id, parsed.data.otp);
    if (!tokenHash) {
      throw ApiError.fieldErrors({ non_field_errors: ['Invalid or expired code.'] });
    }
    return ok(c, { token_hash: tokenHash }, 'Code verified');
  });

  // ── Complete the reset ──────────────────────────────────────────────────
  app.post('/reset-password/', async (c) => {
    const schema = z
      .object({
        token: z.string().min(1),
        password: z.string().min(8, 'Password must be at least 8 characters.'),
        confirm_password: z.string().min(1),
      })
      .refine((v) => v.password === v.confirm_password, {
        path: ['confirm_password'],
        message: 'Passwords do not match.',
      });
    const parsed = schema.safeParse(await c.req.json());
    if (!parsed.success) throw ApiError.fieldErrors(zodFieldErrors(parsed.error));

    const { services } = c.var;
    const verified = await consumeResetToken(services.kv, parsed.data.token);
    if (!verified) throw ApiError.fieldErrors({ token: ['Invalid or expired reset link.'] });

    const hash = await hashPassword(parsed.data.password);
    await services.db
      .update(users)
      .set({ passwordHash: hash, updatedAt: nowIso() })
      .where(eq(users.id, verified.userId));

    await writeAudit(services.db, {
      userId: verified.userId,
      module: 'AUTH',
      action: 'PASSWORD_RESET',
      description: 'Password reset completed',
    });
    return ok(c, {}, 'Password reset successful');
  });

  // ── Authenticated endpoints below ───────────────────────────────────────
  app.use('/change-password/', requireAuth);
  app.use('/staff/profile/', requireAuth);
  app.use('/performance/overview/', requireAuth);

  app.post('/change-password/', async (c) => {
    const parsed = changePasswordInput.safeParse(await c.req.json());
    if (!parsed.success) throw ApiError.fieldErrors(zodFieldErrors(parsed.error));

    const { services, auth } = c.var;
    const [user] = await services.db.select().from(users).where(eq(users.id, auth.userId)).limit(1);
    if (!user) throw ApiError.unauthorized();

    const currentOk = await verifyPassword(parsed.data.current_password, user.passwordHash);
    if (!currentOk) {
      throw ApiError.fieldErrors({ current_password: ['Current password is incorrect.'] });
    }

    await services.db
      .update(users)
      .set({ passwordHash: await hashPassword(parsed.data.new_password), updatedAt: nowIso() })
      .where(eq(users.id, user.id));

    await writeAudit(services.db, {
      userId: user.id,
      actorName: user.name,
      module: 'AUTH',
      action: 'PASSWORD_CHANGED',
      description: 'Password changed by user',
    });
    return ok(c, {}, 'Password updated successfully');
  });

  app.get('/staff/profile/', async (c) => {
    const { services, auth } = c.var;
    const [user] = await services.db.select().from(users).where(eq(users.id, auth.userId)).limit(1);
    if (!user) throw ApiError.unauthorized();
    return ok(c, await serializeAuthUser(services.db, user), 'Profile retrieved');
  });

  app.patch('/staff/profile/', async (c) => {
    const parsed = profilePatch.safeParse(await c.req.json());
    if (!parsed.success) throw ApiError.fieldErrors(zodFieldErrors(parsed.error));

    const { services, auth } = c.var;
    if (parsed.data.department) {
      const [dept] = await services.db
        .select()
        .from(departments)
        .where(eq(departments.id, parsed.data.department))
        .limit(1);
      if (!dept) throw ApiError.fieldErrors({ department: ['Invalid department.'] });
    }

    await services.db
      .update(users)
      .set({
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        ...(parsed.data.phone !== undefined && { phone: parsed.data.phone ?? null }),
        ...(parsed.data.bio !== undefined && { bio: parsed.data.bio ?? null }),
        ...(parsed.data.office_phone !== undefined && {
          officePhone: parsed.data.office_phone ?? null,
        }),
        ...(parsed.data.location !== undefined && { location: parsed.data.location }),
        ...(parsed.data.profile_photo !== undefined && {
          profilePhoto: parsed.data.profile_photo ?? null,
        }),
        ...(parsed.data.department !== undefined && {
          departmentId: parsed.data.department ?? null,
        }),
        updatedAt: nowIso(),
      })
      .where(eq(users.id, auth.userId));

    const [updated] = await services.db
      .select()
      .from(users)
      .where(eq(users.id, auth.userId))
      .limit(1);
    return ok(c, await serializeAuthUser(services.db, updated!), 'Profile updated');
  });

  /** Lightweight performance snapshot for the signed-in staff member. */
  app.get('/performance/overview/', async (c) => {
    const range = c.req.query('range') ?? '30d';
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;

    const { services, auth } = c.var;
    const [user] = await services.db
      .select()
      .from(users)
      .where(eq(users.id, auth.userId))
      .limit(1);
    if (!user) throw ApiError.unauthorized();

    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const taskRows = await services.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.assignedTo, auth.userId), gte(tasks.createdAt, since)));

    const completed = taskRows.filter((t) => t.status === 'completed').length;
    const total = taskRows.length;
    const onTime = taskRows.filter(
      (t) => t.status === 'completed' && (!t.deadline || t.completedAt! <= t.deadline),
    ).length;

    return ok(
      c,
      {
        range,
        tasks_assigned: total,
        tasks_completed: completed,
        completion_rate: total > 0 ? Math.round((completed / total) * 100) : 0,
        on_time_rate: completed > 0 ? Math.round((onTime / completed) * 100) : 0,
        performance_score: user.performanceScore,
        performance_points: user.performancePoints,
      },
      'Performance overview',
    );
  });

  /**
   * Refresh exchange: POST /auth/refresh/ with `{ refresh }` → new access
   * token. The mobile client does not call this yet but it rounds out parity
   * with SimpleJWT.
   */
  app.post('/refresh/', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { refresh?: string };
    if (!body.refresh) throw ApiError.fieldErrors({ refresh: ['This field is required.'] });

    const { services } = c.var;
    const claims = await verifyToken(services.jwtSecret, body.refresh, 'refresh');
    if (!claims) throw ApiError.unauthorized('Token is invalid or expired');

    const blacklisted = await services.kv.get(`blacklist:${claims.jti}`);
    if (blacklisted) throw ApiError.unauthorized('Token is blacklisted');

    const [user] = await services.db
      .select()
      .from(users)
      .where(eq(users.id, Number(claims.sub)))
      .limit(1);
    if (!user || !user.isActive) throw ApiError.unauthorized();

    const token = await signToken(services.jwtSecret, {
      userId: user.id,
      typ: 'access',
      name: user.name,
      roleId: user.roleId,
      ttlSeconds: ACCESS_TOKEN_TTL_SECONDS,
    });
    return ok(c, { token, refresh: body.refresh }, 'Token refreshed');
  });

  return app;
}
