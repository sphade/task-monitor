import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';

import { documentComments, documentRevisions, documents, projects, users } from '@/db/schema';
import { writeAudit } from '@/lib/audit';
import { ApiError, firstOf, ok, pageOf, paging, zodFieldErrors, nowIso } from '@/lib/http';
import { requireAuth, requirePermission } from '@/middleware/auth';
import type { AppEnv } from '@/types';

const DOC_TYPES = ['PRD', 'SDD'] as const;

function serializeDocument(
  doc: typeof documents.$inferSelect,
  senderName: string | null,
): Record<string, unknown> {
  return {
    id: doc.id,
    project: doc.projectId,
    document_name: doc.documentName,
    document_type: doc.documentType,
    content: doc.content,
    url: doc.url,
    version: doc.version,
    source: doc.url ? 'link' : 'inapp',
    sender: doc.senderId,
    sender_name: senderName,
    created_at: doc.createdAt,
    updated_at: doc.updatedAt,
  };
}

/** GET /v1/documents/ — list, optionally scoped to a project/type. */
export async function listDocuments(c: Context<AppEnv>): Promise<Response> {
  const { services } = c.var;
  const { size, offset } = paging(c);

  const conditions = [];
  const project = c.req.query('project');
  if (project) conditions.push(eq(documents.projectId, project));
  const type = c.req.query('document_type')?.toUpperCase();
  if (type) conditions.push(eq(documents.documentType, type));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await services.db
    .select({ doc: documents, senderName: users.name })
    .from(documents)
    .leftJoin(users, eq(users.id, documents.senderId))
    .where(where)
    .orderBy(desc(documents.updatedAt))
    .limit(size)
    .offset(offset);
  const { total } = firstOf(
    await services.db.select({ total: sql<number>`COUNT(*)` }).from(documents).where(where),
  );

  return c.json(pageOf(rows.map((r) => serializeDocument(r.doc, r.senderName)), total));
}

/**
 * POST /v1/documents/ — create or update a project's PRD/SDD slot. Saving over
 * an existing slot bumps the version and records a revision row.
 */
export async function saveDocument(c: Context<AppEnv>): Promise<Response> {
  const schema = z.object({
    project: z.string().min(1),
    document_type: z.enum(DOC_TYPES),
    document_name: z.string().trim().max(255).optional(),
    content: z.string().nullish(),
    url: z.string().url().nullish(),
    note: z.string().max(500).nullish(),
  });
  const parsed = schema.safeParse(await c.req.json());
  if (!parsed.success) throw ApiError.fieldErrors(zodFieldErrors(parsed.error));
  const input = parsed.data;
  if (!input.content && !input.url) {
    throw ApiError.fieldErrors({
      content: ['Provide either in-app content or an external link.'],
    });
  }

  const { services, auth } = c.var;
  const [project] = await services.db
    .select()
    .from(projects)
    .where(eq(projects.id, input.project))
    .limit(1);
  if (!project) throw ApiError.fieldErrors({ project: ['Invalid project.'] });

  const now = nowIso();
  const [existing] = await services.db
    .select()
    .from(documents)
    .where(
      and(eq(documents.projectId, input.project), eq(documents.documentType, input.document_type)),
    )
    .limit(1);

  let saved;
  if (existing) {
    const nextVersion = existing.version + 1;
    await services.db.insert(documentRevisions).values({
      documentId: existing.id,
      version: nextVersion,
      content: input.content ?? null,
      url: input.url ?? null,
      note: input.note ?? null,
      editorId: auth.userId,
      createdAt: now,
    });
    const [updated] = await services.db
      .update(documents)
      .set({
        content: input.content ?? null,
        url: input.url ?? null,
        documentName: input.document_name ?? `${input.document_type} — ${project.name}`,
        version: nextVersion,
        senderId: auth.userId,
        updatedAt: now,
      })
      .where(eq(documents.id, existing.id))
      .returning();
    saved = updated!;
  } else {
    const [created] = await services.db
      .insert(documents)
      .values({
        projectId: input.project,
        documentType: input.document_type,
        documentName: input.document_name ?? `${input.document_type} — ${project.name}`,
        content: input.content ?? null,
        url: input.url ?? null,
        version: 1,
        senderId: auth.userId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    saved = created!;
    await services.db.insert(documentRevisions).values({
      documentId: saved.id,
      version: 1,
      content: saved.content,
      url: saved.url,
      note: input.note ?? 'Initial version',
      editorId: auth.userId,
      createdAt: now,
    });
  }

  await writeAudit(services.db, {
    userId: auth.userId,
    actorName: auth.name,
    module: 'DOCUMENTS',
    action: 'DOCUMENT_SAVED',
    description: `Saved ${saved.documentType} v${saved.version} for ${project.name}`,
  });
  return ok(c, serializeDocument(saved, auth.name), 'Document saved');
}

export function documentRoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use('*', requireAuth);

  // Roots also live at the parent level (a sub-app '/' loses its trailing
  // slash when mounted); kept here so direct mounting still works.
  app.get('/', listDocuments);
  app.post('/', requirePermission('CAN_CREATE_DOCUMENTS'), saveDocument);

  // NOTE: literal segments must be registered BEFORE '/:id/' so that
  // '/comments/' is never swallowed by the parameterized route.

  // ── Comments ────────────────────────────────────────────────────────────
  app.get('/comments/', async (c) => {
    const { services } = c.var;
    const { size, offset } = paging(c);
    const documentId = c.req.query('document');

    const where = documentId ? eq(documentComments.documentId, Number(documentId)) : undefined;
    const rows = await services.db
      .select({ comment: documentComments, authorName: users.name })
      .from(documentComments)
      .leftJoin(users, eq(users.id, documentComments.commenterId))
      .where(where)
      .orderBy(asc(documentComments.createdAt))
      .limit(size)
      .offset(offset);

    return ok(
      c,
      rows.map((r) => ({
        id: r.comment.id,
        document: r.comment.documentId,
        commenter: r.comment.commenterId,
        commenter_name: r.authorName,
        content: r.comment.content,
        created_at: r.comment.createdAt,
        updated_at: r.comment.updatedAt,
      })),
      'Comments retrieved',
    );
  });

  app.post('/comments/', async (c) => {
    const schema = z.object({
      document: z.number().int().positive(),
      content: z.string().trim().min(1).max(2000),
    });
    const parsed = schema.safeParse(await c.req.json());
    if (!parsed.success) throw ApiError.fieldErrors(zodFieldErrors(parsed.error));

    const { services, auth } = c.var;
    const [doc] = await services.db
      .select()
      .from(documents)
      .where(eq(documents.id, parsed.data.document))
      .limit(1);
    if (!doc) throw ApiError.fieldErrors({ document: ['Invalid document.'] });

    const now = nowIso();
    const [created] = await services.db
      .insert(documentComments)
      .values({
        documentId: doc.id,
        commenterId: auth.userId,
        content: parsed.data.content,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return ok(
      c,
      {
        id: created!.id,
        document: created!.documentId,
        commenter: created!.commenterId,
        content: created!.content,
        created_at: created!.createdAt,
      },
      'Comment added',
    );
  });

  app.delete('/comments/:id/', async (c) => {
    const id = Number(c.req.param('id'));
    const { services, auth } = c.var;
    const [existing] = await services.db
      .select()
      .from(documentComments)
      .where(eq(documentComments.id, id))
      .limit(1);
    if (!existing) throw ApiError.notFound();

    const isOwner = existing.commenterId === auth.userId;
    if (!isOwner && !auth.isSuperuser && !auth.permissions.has('CAN_MANAGE_STAFF')) {
      throw ApiError.forbidden();
    }
    await services.db.delete(documentComments).where(eq(documentComments.id, id));
    return ok(c, {}, 'Comment deleted');
  });

  // ── Documents ───────────────────────────────────────────────────────────
  app.get('/:id/', async (c) => {
    const id = Number(c.req.param('id'));
    const rows = await c.var.services.db
      .select({ doc: documents, senderName: users.name })
      .from(documents)
      .leftJoin(users, eq(users.id, documents.senderId))
      .where(eq(documents.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) throw ApiError.notFound();
    return ok(c, serializeDocument(row.doc, row.senderName), 'Document retrieved');
  });

  app.delete('/:id/', requirePermission('CAN_CREATE_DOCUMENTS'), async (c) => {
    const id = Number(c.req.param('id'));
    const { services, auth } = c.var;
    const [deleted] = await services.db.delete(documents).where(eq(documents.id, id)).returning();
    if (!deleted) throw ApiError.notFound();

    await writeAudit(services.db, {
      userId: auth.userId,
      actorName: auth.name,
      module: 'DOCUMENTS',
      action: 'DOCUMENT_DELETED',
      description: `Deleted ${deleted.documentType} #${id}`,
    });
    return ok(c, {}, 'Document deleted');
  });

  /** Version history, oldest first. */
  app.get('/:id/revisions/', async (c) => {
    const id = Number(c.req.param('id'));
    const rows = await c.var.services.db
      .select({ rev: documentRevisions, editorName: users.name })
      .from(documentRevisions)
      .leftJoin(users, eq(users.id, documentRevisions.editorId))
      .where(eq(documentRevisions.documentId, id))
      .orderBy(asc(documentRevisions.version));
    return ok(
      c,
      rows.map((r) => ({
        id: r.rev.id,
        version: r.rev.version,
        content: r.rev.content,
        url: r.rev.url,
        note: r.rev.note,
        editor_id: r.rev.editorId,
        editor_name: r.editorName,
        created_at: r.rev.createdAt,
      })),
      'Revision history',
    );
  });

  return app;
}
