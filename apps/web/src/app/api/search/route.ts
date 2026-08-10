import { requireMember } from '@/lib/server/context';
import { ok, route } from '@/lib/server/http';
import { withKeys } from '@/lib/server/tasks';

/**
 * Cross-entity search for the command palette.
 *
 * Each query is filtered by row level security independently, so results can
 * never include a project, page or task the caller could not already open.
 */
export const GET = route(async (request: Request) => {
  const { supabase, ws } = await requireMember(request);
  const url = new URL(request.url);
  const term = (url.searchParams.get('q') ?? '').trim();

  if (term.length < 2) return ok({ tasks: [], projects: [], wiki: [], people: [] });

  // PostgREST treats commas and parentheses as filter syntax, so they have to
  // go before the value is spliced into an `ilike` pattern.
  const like = `%${term.replace(/[,()]/g, ' ')}%`;

  const [tasks, projects, wiki, people] = await Promise.all([
    supabase
      .from('tasks')
      .select('id, number, title, status, priority, project_id, project:projects (id, name, key)')
      .eq('workspace_id', ws.workspaceId)
      .ilike('title', like)
      .limit(8),
    supabase.from('projects').select('id, name, key, status').eq('workspace_id', ws.workspaceId).ilike('name', like).limit(6),
    supabase.from('wiki_pages').select('id, title, slug, project_id').eq('workspace_id', ws.workspaceId).ilike('title', like).limit(6),
    supabase
      .from('workspace_members')
      .select('user:profiles (id, name, email, avatar_url, mascot)')
      .eq('workspace_id', ws.workspaceId)
      .limit(50),
  ]);

  const lowered = term.toLowerCase();
  const matchedPeople = (people.data ?? [])
    .map((row) => (row as unknown as { user: { id: string; name: string; email: string } | null }).user)
    .filter((person): person is { id: string; name: string; email: string } =>
      Boolean(person && (person.name.toLowerCase().includes(lowered) || person.email.toLowerCase().includes(lowered))),
    )
    .slice(0, 6);

  return ok({
    tasks: withKeys(tasks.data ?? []),
    projects: projects.data ?? [],
    wiki: wiki.data ?? [],
    people: matchedPeople,
  });
});
