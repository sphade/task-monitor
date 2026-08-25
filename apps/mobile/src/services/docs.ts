import { privateApi, toArray, unwrap } from '@/lib/api';
import { API } from '@/lib/endpoints';
import type { DocComment, DocKind, DocSource, DocVersion, ProjectDoc } from '@/types';

/**
 * PRD/SDD documentation repository backed by the Cloudflare API
 * (`/v1/documents`). One slot per project+kind; saving bumps the version and
 * records revision history server-side.
 */

interface DocumentDto {
  id: number;
  project: string | null;
  document_name: string;
  document_type: string;
  content?: string | null;
  url?: string | null;
  version: number;
  sender_name?: string | null;
  created_at: string;
  updated_at: string;
}

interface RevisionDto {
  version: number;
  note?: string | null;
  editor_name?: string | null;
  created_at: string;
}

interface CommentDto {
  id: number;
  document: number;
  commenter: number;
  commenter_name?: string | null;
  content: string;
  created_at: string;
}

function sourceOf(dto: DocumentDto): DocSource {
  return dto.url ? 'link' : 'inapp';
}

function mapDoc(dto: DocumentDto): ProjectDoc {
  return {
    id: String(dto.id),
    projectId: dto.project ?? undefined,
    name: dto.document_name,
    kind: (dto.document_type || 'PRD') as DocKind,
    source: sourceOf(dto),
    url: dto.url ?? undefined,
    fileName: dto.url ? dto.document_name : undefined,
    content: dto.content ?? undefined,
    version: dto.version,
    updatedAt: dto.updated_at,
    updatedByName: dto.sender_name ?? 'Unknown',
    // History loads lazily via getDoc().
    history: [],
  };
}

function mapRevision(r: RevisionDto): DocVersion {
  return {
    version: r.version,
    updatedAt: r.created_at,
    updatedByName: r.editor_name ?? 'Unknown',
    note: r.note ?? undefined,
  };
}

export const docsService = {
  async listForProject(projectId: string): Promise<ProjectDoc[]> {
    const res = await privateApi.get(API.DOCUMENTS, {
      params: { project: projectId, size: 100 },
    });
    return toArray<DocumentDto>(res).map(mapDoc);
  },

  async getDoc(id: string): Promise<ProjectDoc | undefined> {
    try {
      const res = await privateApi.get(API.document(id));
      const doc = mapDoc(unwrap<DocumentDto>(res));
      // Attach version history for the detail view.
      const revRes = await privateApi.get(`${API.document(id)}revisions/`);
      doc.history = unwrap<RevisionDto[]>(revRes)
        .map(mapRevision)
        .sort((a, b) => b.version - a.version);
      return doc;
    } catch {
      return undefined;
    }
  },

  /** Creates or bumps the project+kind slot; the server owns versioning. */
  async saveDoc(input: {
    projectId: string;
    kind: DocKind;
    source: DocSource;
    url?: string;
    fileName?: string;
    fileSizeKb?: number;
    content?: string;
    updatedByName: string;
    note?: string;
  }): Promise<ProjectDoc> {
    const res = await privateApi.post(API.DOCUMENTS, {
      project: input.projectId,
      document_type: input.kind,
      document_name: input.fileName,
      content: input.source === 'link' ? null : (input.content ?? null),
      url: input.source === 'link' ? (input.url ?? null) : null,
      note: input.note ?? null,
    });
    return mapDoc(unwrap<DocumentDto>(res));
  },

  async listComments(docId: string): Promise<DocComment[]> {
    const res = await privateApi.get(`${API.DOC_COMMENTS}`, {
      params: { document: Number(docId), size: 200 },
    });
    return unwrap<CommentDto[]>(res).map((c) => ({
      id: String(c.id),
      docId: String(c.document),
      authorId: String(c.commenter),
      authorName: c.commenter_name ?? `User ${c.commenter}`,
      body: c.content,
      createdAt: c.created_at,
    }));
  },

  async addComment(
    docId: string,
    author: { id: string; name: string },
    body: string,
  ): Promise<DocComment> {
    const res = await privateApi.post(API.DOC_COMMENTS, {
      document: Number(docId),
      content: body,
    });
    const c = unwrap<{ id: number; document: number; commenter: number; content: string; created_at: string }>(res);
    return {
      id: String(c.id),
      docId: String(c.document),
      authorId: author.id,
      authorName: author.name,
      body: c.content,
      createdAt: c.created_at,
    };
  },
};
