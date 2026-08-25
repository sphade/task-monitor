import { auditLogs } from '@/db/schema';
import type { Db } from '@/db/client';

export interface AuditEntry {
  userId?: number | null;
  actorName?: string;
  module: string;
  action: string;
  description?: string;
  ipAddress?: string | null;
}

/** Append-only audit trail, mirroring the Django `audit` app. */
export async function writeAudit(db: Db, entry: AuditEntry): Promise<void> {
  await db.insert(auditLogs).values({
    userId: entry.userId ?? null,
    actorName: entry.actorName ?? 'system',
    module: entry.module,
    action: entry.action,
    description: entry.description ?? '',
    ipAddress: entry.ipAddress ?? null,
    createdAt: new Date().toISOString(),
  });
}
