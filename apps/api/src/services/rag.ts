import { prisma } from '@loop/db';
import { atLeast, type Role } from '@loop/shared';
import { complete, embed } from './ai.js';
import { features } from '../env.js';
import { logger } from '../lib/logger.js';

/**
 * Ask the Workspace — permission-aware retrieval augmented generation.
 *
 * The important part is the order of operations: we filter by what the asker
 * is allowed to see *before* retrieval, not after. A CLIENT can never pull an
 * internal chat message into the context window, so the model cannot leak it
 * even if it wanted to.
 */

export type SourceType = 'task' | 'wiki' | 'message' | 'comment' | 'commit';

interface QueueInput {
  workspaceId: string;
  projectId?: string | null;
  sourceType: SourceType;
  sourceId: string;
}

interface Indexable {
  title: string;
  content: string;
  url: string | null;
  visibility: 'INTERNAL' | 'SHARED';
  projectId: string | null;
}

const stripTags = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

async function loadIndexable(input: QueueInput): Promise<Indexable | null> {
  const { sourceType, sourceId, workspaceId } = input;

  if (sourceType === 'task') {
    const task = await prisma.task.findFirst({
      where: { id: sourceId, workspaceId },
      include: { project: { select: { id: true, key: true } }, assignee: { select: { name: true } } },
    });
    if (!task) return null;
    return {
      title: `${task.project.key}-${task.number}: ${task.title}`,
      content: [
        task.description ?? '',
        `Status: ${task.status}. Priority: ${task.priority}.`,
        task.assignee ? `Assigned to ${task.assignee.name}.` : 'Unassigned.',
        task.isBlocked ? `BLOCKED: ${task.blockedNote ?? 'no reason given'}` : '',
        task.dueDate ? `Due ${task.dueDate.toISOString().slice(0, 10)}.` : '',
      ]
        .filter(Boolean)
        .join(' '),
      url: `/w/${workspaceId}/tasks/${task.id}`,
      // Task progress is exactly what clients are allowed to see.
      visibility: 'SHARED',
      projectId: task.projectId,
    };
  }

  if (sourceType === 'wiki') {
    const page = await prisma.wikiPage.findFirst({ where: { id: sourceId, workspaceId }, include: { author: { select: { name: true } } } });
    if (!page) return null;
    return {
      title: page.title,
      content: `${stripTags(page.content).slice(0, 6000)} — written by ${page.author.name}`,
      url: `/w/${workspaceId}/projects/${page.projectId}/wiki/${page.id}`,
      visibility: page.isShared ? 'SHARED' : 'INTERNAL',
      projectId: page.projectId,
    };
  }

  if (sourceType === 'message') {
    const message = await prisma.message.findFirst({
      where: { id: sourceId, workspaceId },
      include: { author: { select: { name: true } }, channel: { select: { name: true, projectId: true } } },
    });
    if (!message || message.deletedAt) return null;
    return {
      title: `#${message.channel.name} — ${message.author.name}`,
      content: message.body,
      url: `/w/${workspaceId}/chat/${message.channelId}`,
      visibility: 'INTERNAL',
      projectId: message.channel.projectId,
    };
  }

  if (sourceType === 'comment') {
    const comment = await prisma.comment.findFirst({
      where: { id: sourceId, workspaceId },
      include: { author: { select: { name: true } }, task: { select: { id: true, number: true, title: true, projectId: true, project: { select: { key: true } } } } },
    });
    if (!comment) return null;
    return {
      title: `Comment on ${comment.task.project.key}-${comment.task.number} by ${comment.author.name}`,
      content: comment.body,
      url: `/w/${workspaceId}/tasks/${comment.task.id}`,
      visibility: 'INTERNAL',
      projectId: comment.task.projectId,
    };
  }

  const log = await prisma.activityLog.findFirst({ where: { id: sourceId, workspaceId } });
  if (!log) return null;
  const meta = log.meta as Record<string, unknown>;
  return {
    title: `Commit — ${String(meta.repo ?? 'repository')}`,
    content: log.message,
    url: typeof meta.url === 'string' ? meta.url : null,
    visibility: 'INTERNAL',
    projectId: log.projectId,
  };
}

const vectorLiteral = (values: number[]) => `[${values.join(',')}]`;

/**
 * Fire-and-forget indexing. The row is written even when embeddings are not
 * configured so keyword retrieval keeps working — the vector column is simply
 * left null and the search falls back to ILIKE.
 */
export async function queueEmbedding(input: QueueInput): Promise<void> {
  try {
    const doc = await loadIndexable(input);
    if (!doc) return;

    const text = `${doc.title}\n${doc.content}`.slice(0, 8000);
    const [vector] = await embed([text]);

    await prisma.$executeRawUnsafe(
      `INSERT INTO "Embedding" (id, "workspaceId", "projectId", "sourceType", "sourceId", title, content, url, visibility, vector, "createdAt")
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8::"EmbeddingVisibility", ${vector ? '$9::vector' : 'NULL'}, now())
       ON CONFLICT ("sourceType", "sourceId") DO UPDATE
       SET title = EXCLUDED.title, content = EXCLUDED.content, url = EXCLUDED.url,
           visibility = EXCLUDED.visibility, vector = EXCLUDED.vector, "projectId" = EXCLUDED."projectId"`,
      ...[
        input.workspaceId,
        doc.projectId,
        input.sourceType,
        input.sourceId,
        doc.title.slice(0, 300),
        doc.content.slice(0, 8000),
        doc.url,
        doc.visibility,
        ...(vector ? [vectorLiteral(vector)] : []),
      ],
    );
  } catch (error: unknown) {
    logger.warn(`embedding ${input.sourceType}:${input.sourceId} failed`, error instanceof Error ? error.message : error);
  }
}

export interface RetrievedChunk {
  id: string;
  sourceType: SourceType;
  sourceId: string;
  title: string;
  content: string;
  url: string | null;
  score: number;
}

interface Scope {
  workspaceId: string;
  userId: string;
  role: Role;
}

/** Projects the asker may read. PM and above see everything in the workspace. */
async function readableProjectIds(scope: Scope): Promise<string[] | null> {
  if (atLeast(scope.role, 'PM')) return null; // null = no project restriction
  const rows = await prisma.projectMember.findMany({
    where: { userId: scope.userId, project: { workspaceId: scope.workspaceId } },
    select: { projectId: true },
  });
  return rows.map((r) => r.projectId);
}

export async function retrieve(scope: Scope, question: string, limit = 8): Promise<RetrievedChunk[]> {
  const projectIds = await readableProjectIds(scope);
  const clientOnly = scope.role === 'CLIENT';

  // Build the permission filter first — it is applied inside the SQL, never after.
  const conditions: string[] = ['"workspaceId" = $1'];
  const baseParams: unknown[] = [scope.workspaceId];

  if (clientOnly) conditions.push(`visibility = 'SHARED'`);
  if (projectIds !== null) {
    if (projectIds.length === 0) return [];
    baseParams.push(projectIds);
    conditions.push(`"projectId" = ANY($${baseParams.length}::text[])`);
  }
  const where = conditions.join(' AND ');

  const [vector] = await embed([question]);

  if (vector) {
    const params = [...baseParams, vectorLiteral(vector), limit];
    const vecParam = `$${baseParams.length + 1}`;
    const rows = await prisma.$queryRawUnsafe<RetrievedChunk[]>(
      `SELECT id, "sourceType", "sourceId", title, content, url,
              1 - (vector <=> ${vecParam}::vector) AS score
       FROM "Embedding"
       WHERE ${where} AND vector IS NOT NULL
       ORDER BY vector <=> ${vecParam}::vector
       LIMIT $${params.length}`,
      ...params,
    );
    if (rows.length > 0) return rows;
  }

  // Keyword fallback — also what runs when GEMINI_API_KEY is absent.
  const terms = question
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 3)
    .slice(0, 6);
  if (terms.length === 0) return [];

  const params = [...baseParams, `%${terms.join('%')}%`, limit];
  const likeParam = `$${baseParams.length + 1}`;
  return prisma.$queryRawUnsafe<RetrievedChunk[]>(
    `SELECT id, "sourceType", "sourceId", title, content, url, 0.4 AS score
     FROM "Embedding"
     WHERE ${where} AND (lower(title) LIKE ${likeParam} OR lower(content) LIKE ${likeParam})
     ORDER BY "createdAt" DESC
     LIMIT $${params.length}`,
    ...params,
  );
}

export interface AskResult {
  answer: string;
  citations: { index: number; title: string; url: string | null; sourceType: string; sourceId: string }[];
  retrieved: number;
  model: string | null;
  restricted: boolean;
}

export async function askWorkspace(scope: Scope, question: string): Promise<AskResult> {
  const chunks = await retrieve(scope, question, 8);
  const restricted = scope.role === 'CLIENT';

  if (chunks.length === 0) {
    return {
      answer: restricted
        ? 'I could not find anything you have access to that answers that. Client accounts can only see shared documents and task progress.'
        : 'I could not find anything in this workspace that answers that yet.',
      citations: [],
      retrieved: 0,
      model: null,
      restricted,
    };
  }

  const context = chunks
    .map((c, i) => `[${i + 1}] (${c.sourceType}) ${c.title}\n${c.content.slice(0, 900)}`)
    .join('\n\n');

  if (!features.ai) {
    return {
      answer: `AI answering is not configured, but here is what matches in the workspace:\n\n${chunks
        .map((c, i) => `[${i + 1}] ${c.title}`)
        .join('\n')}`,
      citations: chunks.map((c, i) => ({ index: i + 1, title: c.title, url: c.url, sourceType: c.sourceType, sourceId: c.sourceId })),
      retrieved: chunks.length,
      model: null,
      restricted,
    };
  }

  const { text, model } = await complete({
    system:
      'You answer questions about a software project using only the numbered context supplied. ' +
      'Cite every claim with the bracketed number of the source it came from, like [2]. ' +
      'If the context does not contain the answer, say so plainly — never guess and never mention sources you were not given. ' +
      'Be concise: at most five sentences.',
    prompt: `Context:\n${context}\n\nQuestion: ${question}`,
    temperature: 0.2,
    maxTokens: 500,
  });

  return {
    answer: text,
    citations: chunks.map((c, i) => ({ index: i + 1, title: c.title, url: c.url, sourceType: c.sourceType, sourceId: c.sourceId })),
    retrieved: chunks.length,
    model,
    restricted,
  };
}

/** hnsw index cannot be expressed in the Prisma schema, so it is created at boot. */
export async function ensureVectorIndex(): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS embedding_vector_cosine_idx ON "Embedding" USING hnsw (vector vector_cosine_ops)`,
    );
  } catch (error: unknown) {
    logger.warn('vector index skipped', error instanceof Error ? error.message : error);
  }
}

/** Re-indexes a whole workspace. Used by the seed script and the admin panel. */
export async function reindexWorkspace(workspaceId: string): Promise<number> {
  const [tasks, pages, messages] = await Promise.all([
    prisma.task.findMany({ where: { workspaceId }, select: { id: true, projectId: true } }),
    prisma.wikiPage.findMany({ where: { workspaceId }, select: { id: true, projectId: true } }),
    prisma.message.findMany({ where: { workspaceId, deletedAt: null }, select: { id: true }, take: 300, orderBy: { createdAt: 'desc' } }),
  ]);

  const jobs: QueueInput[] = [
    ...tasks.map((t) => ({ workspaceId, projectId: t.projectId, sourceType: 'task' as const, sourceId: t.id })),
    ...pages.map((p) => ({ workspaceId, projectId: p.projectId, sourceType: 'wiki' as const, sourceId: p.id })),
    ...messages.map((m) => ({ workspaceId, sourceType: 'message' as const, sourceId: m.id })),
  ];

  for (const job of jobs) await queueEmbedding(job);
  return jobs.length;
}
