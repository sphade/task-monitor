# Task Monitor — Cloudflare Monorepo

Turborepo monorepo containing the **Orange Invent House task & reporting platform**:
a Hono API running on Cloudflare Workers (replacing the original Django REST
backend in `task_monitor`) and the Expo React Native mobile app connected to it.

The API is a **drop-in wire-compatible replacement**: same paths, same
`{ message, data }` envelopes, same DRF-style pagination, same error shapes —
the mobile app's service layer required no rewrite to switch backends.

## Structure

```
task-monitor/
├── apps/
│   ├── api/       Hono on Workers — D1 · KV · Durable Objects · Cron
│   └── mobile/    Expo (SDK 57) React Native app
├── packages/
│   └── tsconfig/  Shared TypeScript config
├── turbo.json
└── pnpm-workspace.yaml
```

## Django → Cloudflare mapping

| Django (task_monitor) | Here | Notes |
|---|---|---|
| Postgres | **D1** (SQLite) | Drizzle ORM, typed schema in `apps/api/src/db/schema.ts` |
| SimpleJWT | **JWT via jose** (HS256) | 30-day access / 90-day refresh; refresh blacklist in KV |
| OTP emails + cache table | **KV** | Pending-login handles, `email → handle` index so resend keeps the same key |
| Django Channels websockets | **Durable Objects** (`ChatRoom`) | WebSocket hibernation; worker verifies JWT + participation before upgrade |
| Celery beat (overdue sweep) | **Cron trigger** (hourly) | Plus a lazy sweep on every task read/dashboard load |
| django-redis cache | KV | |

## Quick start

```bash
pnpm install

# 1) Local database: create D1 schema + seed data
pnpm db:migrate
pnpm db:seed

# 2) Dev secrets for wrangler
cp apps/api/.dev.vars.example apps/api/.dev.vars

# 3) Run both
pnpm dev:api      # http://localhost:8787
pnpm dev:mobile   # Expo; .env already points at localhost:8787
```

> Android emulator: set `EXPO_PUBLIC_API_URL=http://10.0.2.2:8787`.
> Physical device: use your LAN IP instead.

### Seeded accounts (local)

All passwords are `Password123!`. In dev (`.dev.vars` sets `DEBUG_SHOW_OTP=true`)
the 6-digit login code is returned in the login response as `debug_otp`, so you
can complete the two-step sign-in without an inbox.

| Login | Role |
|---|---|
| `admin@orangeinvent.house` | Administrator (all permissions) |
| `paul@orangeinvent.house` | Manager (tasks/reports/docs, no HR) |
| `sam@orangeinvent.house`, `tola@orangeinvent.house` | Staff |

Login flow: `POST /v1/auth/login/` → `otp_key`; then
`POST /v1/auth/verify-login/` with `{ otp, temp_id: otp_key }` → JWT session.
Resend keeps the same handle (the client only ever posts `{ email }`).

## Commands

| Command | What it does |
|---|---|
| `pnpm dev:api` / `pnpm dev:mobile` | Run each app locally |
| `pnpm test` | API integration suite (55 tests, real SQL via better-sqlite3 D1 shim) |
| `pnpm typecheck` / `pnpm lint` | Across the workspace via Turbo |
| `pnpm db:migrate` / `pnpm db:seed` | Apply local D1 migrations / seed |
| `pnpm --filter @task-monitor/api db:migrate:remote` / `db:seed:remote` | Same against production D1 |

## Database workflow (Drizzle → D1)

The schema lives in `apps/api/src/db/schema.ts`. Never hand-write SQL:

```bash
# 1. Edit apps/api/src/db/schema.ts, then generate a migration:
pnpm --filter @task-monitor/api db:generate

# 2. Review the file it created in apps/api/migrations/000X_*.sql

# 3a. Apply locally (miniflare D1 in .wrangler/state):
pnpm db:migrate

# 3b. Apply to Cloudflare:
pnpm --filter @task-monitor/api db:migrate:remote
```

Wrangler tracks applied migrations inside each database (`d1_migrations`
table), so local and remote progress independently. Seed data
(`scripts/seed.sql`) is separate and idempotent per-fresh-database:
`pnpm db:seed` / `db:seed:remote`.

## Deploying the API

```bash
cd apps/api

# One-time resources
wrangler d1 create task-monitor-db        # put the id into wrangler.jsonc
wrangler kv namespace create KV           # put the id into wrangler.jsonc

# Secrets (never in git)
wrangler secret put JWT_SECRET
wrangler secret put ENVIRONMENT           # e.g. "production"

# Ship it — schema first, then the worker
pnpm db:migrate:remote
pnpm db:seed:remote        # optional demo content (includes admin login)
pnpm deploy
```

Then point the app at it:

```bash
cd apps/mobile
EXPO_PUBLIC_API_URL=https://task-monitor-api.<your-subdomain>.workers.dev pnpm start
```

Realtime chat needs no extra setup — the `ChatRoom` Durable Object migration
(`v1`, SQLite-backed) ships with `wrangler.jsonc`.

## Email (OTP delivery)

OTP codes are logged (and echoed via `DEBUG_SHOW_OTP` in dev). Wire a provider
in `apps/api/src/lib/mailer.ts` — e.g. Resend over `fetch`, or Cloudflare Email
Routing — before public launch.

## API surface (all under `/v1`, trailing slashes like the original)

- **auth** — `login/`, `verify-login/`, `resend-otp/`, `register/`, `logout/`,
  `forgot-password/`, `password-reset/verify/`, `reset-password/`,
  `change-password/`, `staff/profile/` (GET/PATCH), `performance/overview/`,
  `refresh/`
- **work** — `tasks/` CRUD (+ `projects/` CRUD), `reports/` CRUD;
  filters: `status,priority,search,assignee,project_id,ordering,page,size`
- **console** — `dashboard/overview/`, `staff/`, `departments/`, `roles/`
  (+ `add-permissions/`, `remove-permissions/`), `permissions/`,
  `user-dropdown/`
- **chat** — direct *and* group rooms: `conversations/` (my messages),
  `conversations/{id}/` (thread), `messages/` (send `{recipient,content}` for
  direct or `{conversation,content}` for groups), `conversations/{id}/read/`,
  `groups/` (list incl. per-group unreads · create · add/remove members;
  a whole-team room named **Team** is auto-provisioned and mirrors active
  staff), `ws/{id}/?token=` (realtime)
- **documents** — PRD/SDD slots per project with version history
  (`documents/`, `documents/{id}/revisions/`, `documents/comments/`)
- **audit** — append-only trail of logins & mutations
- `health-check/`

Wire-format quirks preserved on purpose (the mobile DTOs depend on them):
task statuses are `in_progress`, report statuses are `in-progress`;
`assigned_to` is the assignee's *name* on reads but a numeric id on writes;
lists return DRF pages `{count,next,previous,results}` while detail/mutations
use `{message,data}` envelopes.
