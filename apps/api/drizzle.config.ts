import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit config — the single source of truth for schema changes:
 *
 *   1. Edit src/db/schema.ts
 *   2. pnpm db:generate          → diffs schema vs migrations/, emits SQL
 *   3. Review the generated file
 *   4. pnpm db:migrate           → apply to LOCAL D1 (wrangler miniflare)
 *      pnpm db:migrate:remote    → apply to CLOUDFLARE D1
 *
 * Generated files land directly in wrangler's `migrations` directory so
 * `wrangler d1 migrations apply` picks them up (it tracks state in the
 * d1_migrations table inside each database).
 */
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './migrations',
  dialect: 'sqlite',
});
