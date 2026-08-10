import { z } from 'zod';
import { requireMember } from '@/lib/server/context';
import { badRequest, body, ok, route } from '@/lib/server/http';
import { chat, isAiConfigured } from '@/lib/server/ai';

const schema = z.object({ question: z.string().trim().min(3, 'Ask a fuller question').max(500) });

/**
 * Ask the Workspace.
 *
 * Context is gathered through the caller's own session, so retrieval is
 * permission-aware by construction: a CLIENT cannot be answered from a project
 * they were never added to, because those rows never reach the prompt.
 */
export const POST = route(async (request: Request) => {
  const { supabase, user, ws } = await requireMember(request);
  const { question } = await body(request, schema);

  if (!isAiConfigured()) throw badRequest('AI is not configured on this deployment');

  const like = `%${question.replace(/[,()]/g, ' ').slice(0, 60)}%`;
  const [tasks, pages, projects] = await Promise.all([
    supabase
      .from('tasks')
      .select('number, title, status, priority, due_date, project:projects (key, name)')
      .eq('workspace_id', ws.workspaceId)
      .ilike('title', like)
      .limit(15),
    supabase.from('wiki_pages').select('title, content').eq('workspace_id', ws.workspaceId).ilike('title', like).limit(5),
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

  return ok({
    answer,
    sources: {
      tasks: tasks.data ?? [],
      pages: (pages.data ?? []).map((page) => page.title),
    },
  });
});
