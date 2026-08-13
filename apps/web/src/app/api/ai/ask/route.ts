import { z } from 'zod';
import { requireMember } from '@/lib/server/context';
import { badRequest, body, ok, route } from '@/lib/server/http';
import { enforceRateLimit } from '@/lib/server/rate-limit';
import { chat, isAiConfigured } from '@/lib/server/ai';

const schema = z.object({ question: z.string().trim().min(3, 'Ask a fuller question').max(500) });

const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'with', 'this', 'that', 'from', 'have', 'what', 'which', 'who', 'when', 'where', 'why', 'how',
  'does', 'did', 'is', 'was', 'were', 'will', 'would', 'about', 'into', 'over', 'tell', 'show', 'give', 'list', 'all', 'any',
  'can', 'our', 'your', 'their', 'been', 'being', 'they', 'them', 'there', 'here',
]);

/**
 * Significant, LIKE-safe words from a question, for keyword retrieval.
 *
 * The `[a-z0-9]{3,}` match drops punctuation, so the words are safe to drop
 * straight into a PostgREST `.or()` filter — a stray comma or parenthesis there
 * would be read as filter syntax, not text.
 */
function keywords(question: string): string[] {
  const words = question.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const word of words) {
    if (STOPWORDS.has(word) || seen.has(word)) continue;
    seen.add(word);
    out.push(word);
    if (out.length >= 8) break;
  }
  return out;
}

/**
 * Ask the Workspace.
 *
 * Context is gathered through the caller's own session, so retrieval is
 * permission-aware by construction: a CLIENT cannot be answered from a project
 * they were never added to, because those rows never reach the prompt.
 */
export const POST = route(async (request: Request) => {
  const { supabase, user, ws } = await requireMember(request);
  await enforceRateLimit(supabase, 'ai', user.id);
  const { question } = await body(request, schema);

  if (!isAiConfigured()) throw badRequest('AI is not configured on this deployment');

  // Keyword retrieval matches rows whose title or body contains *any*
  // significant word from the question. The previous version used the entire
  // question as one LIKE pattern, so it only ever matched a title that repeated
  // the question verbatim — tasks and docs almost never reached the context.
  const terms = keywords(question);
  const tasksQuery = supabase
    .from('tasks')
    .select('id, number, title, status, priority, due_date, project:projects (key, name)')
    .eq('workspace_id', ws.workspaceId)
    .limit(15);
  const wikiQuery = supabase.from('wiki_pages').select('id, title, content').eq('workspace_id', ws.workspaceId).limit(5);

  const [tasks, pages, projects] = await Promise.all([
    terms.length ? tasksQuery.or(terms.map((word) => `title.ilike.%${word}%,description.ilike.%${word}%`).join(',')) : tasksQuery,
    terms.length ? wikiQuery.or(terms.map((word) => `title.ilike.%${word}%,content.ilike.%${word}%`).join(',')) : wikiQuery,
    supabase.from('projects').select('name, key, status, deadline').eq('workspace_id', ws.workspaceId).limit(20),
  ]);

  const context = [
    'PROJECTS:',
    ...(projects.data ?? []).map((p) => `- ${p.key} ${p.name} (${p.status})${p.deadline ? `, due ${p.deadline.slice(0, 10)}` : ''}`),
    '',
    'TASKS:',
    ...(tasks.data ?? []).map((t) => {
      const project = (Array.isArray(t.project) ? t.project[0] : t.project) as { key?: string } | null;
      return `- ${project?.key ?? '?'}-${t.number} ${t.title} [${t.status}, ${t.priority}]`;
    }),
    '',
    'DOCS:',
    ...(pages.data ?? []).map((p) => `- ${p.title}: ${String(p.content ?? '').slice(0, 400)}`),
  ].join('\n');

  const answer = await chat([
    {
      role: 'system',
      content:
        'You answer questions about a project workspace using only the context provided. ' +
        'If the context does not contain the answer, say so plainly rather than guessing. Be concise.',
    },
    { role: 'user', content: `Context:\n${context}\n\nQuestion: ${question}` },
  ]);

  await supabase.from('ask_logs').insert({
    workspace_id: ws.workspaceId,
    user_id: user.id,
    question,
    answer,
  });

  // Citations the Ask page renders: tasks deep-link to their detail view; wiki
  // pages are named without a link (there is no per-page route yet).
  const taskCitations = (tasks.data ?? []).map((t) => {
    const project = (Array.isArray(t.project) ? t.project[0] : t.project) as { key?: string } | null;
    return {
      title: `${project?.key ?? '?'}-${t.number} ${t.title}`,
      url: `/w/${ws.workspaceId}/tasks/${t.id}`,
      sourceType: 'task',
      sourceId: t.id as string,
    };
  });
  const pageCitations = (pages.data ?? []).map((p) => ({
    title: p.title,
    url: null,
    sourceType: 'wiki',
    sourceId: p.id as string,
  }));
  const citations = [...taskCitations, ...pageCitations].map((citation, index) => ({ index: index + 1, ...citation }));

  // Which model the UI reports as having answered. It follows the same
  // primary→fallback order the request itself does.
  const model = process.env.GROQ_API_KEY
    ? process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile'
    : process.env.GEMINI_API_KEY
      ? process.env.GEMINI_MODEL ?? 'gemini-flash-latest'
      : null;

  return ok({
    answer,
    citations,
    retrieved: citations.length,
    model,
    // Retrieval is already RLS-filtered for everyone; the flag tells the reader
    // a client's answer was drawn from a deliberately narrower set.
    restricted: ws.role === 'CLIENT',
  });
});
