import { createAdminClient } from '@/lib/supabase/admin';
import { notFound, ok, route } from '@/lib/server/http';
import { callerIp, enforceRateLimit } from '@/lib/server/rate-limit';
import { hashToken, linkRejection, type ShareLinkRow } from '@/lib/server/share';

type Params = { params: Promise<{ token: string }> };

/**
 * The only unauthenticated data route in the product.
 *
 * It runs with the service role, which bypasses RLS entirely, so every
 * restriction here is written out by hand and must stay that way:
 *
 *   1. the token is hashed and looked up by unique index — no scanning,
 *   2. revocation and expiry are re-checked on every request, not at mint,
 *   3. each field returned is named explicitly. There is no `select *` below,
 *      because a column added to `tasks` next month must not silently start
 *      appearing on a public web page,
 *   4. scopes gate whole sections, so a "progress" link cannot be edited in
 *      the URL into a "docs" one,
 *   5. nothing here exposes an email address, a comment, a chat message or an
 *      internal note. Assignees are reduced to a display name.
 *
 * A bad token gets the same 404 as a revoked one, so the endpoint cannot be
 * used to test whether a link ever existed.
 */
export const GET = route(async (request: Request, { params }: Params) => {
  const { token } = await params;
  const admin = createAdminClient();

  // Limited before the token is even looked at, and keyed on the caller rather
  // than the token: otherwise every guess gets its own fresh quota, which is
  // exactly the budget an enumeration attack wants.
  await enforceRateLimit(admin, 'publicLink', callerIp(request));

  if (!token || token.length < 20) throw notFound('This link is not valid');

  const { data: link } = await admin
    .from('project_share_links')
    .select('id, project_id, workspace_id, token_hash, scopes, expires_at, revoked_at, label')
    .eq('token_hash', hashToken(token))
    .maybeSingle();

  const rejection = linkRejection(link as ShareLinkRow | null);
  if (rejection || !link) throw notFound(rejection ?? 'This link is not valid');

  const scopes = new Set((link.scopes ?? []) as string[]);
  const projectId = link.project_id as string;

  const { data: project } = await admin
    .from('projects')
    .select('id, key, name, description, status, start_date, deadline, color')
    .eq('id', projectId)
    .maybeSingle();

  if (!project) throw notFound('This link is not valid');

  const [tasks, milestones, docs, workspace] = await Promise.all([
    // Progress needs counts; the task scope needs the rows themselves. Read
    // once and derive both rather than querying twice.
    admin
      .from('tasks')
      .select('id, number, title, status, priority, due_date, start_date, completed_at, assignee:profiles!tasks_assignee_id_fkey (name)')
      .eq('project_id', projectId)
      .order('order', { ascending: true }),
    scopes.has('milestones')
      ? admin.from('milestones').select('id, title, due_date, completed_at').eq('project_id', projectId).order('due_date', { ascending: true })
      : Promise.resolve({ data: [] }),
    scopes.has('docs')
      // `is_shared` is the author's existing opt-in — the same flag a CLIENT
      // account's read policy keys off. A docs-scoped link therefore reaches
      // exactly the pages already marked shareable, and marking a page private
      // pulls it out of every public link at once.
      ? admin
          .from('wiki_pages')
          .select('id, title, slug, content, updated_at')
          .eq('project_id', projectId)
          .eq('is_shared', true)
          .order('updated_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    admin.from('workspaces').select('name').eq('id', link.workspace_id as string).maybeSingle(),
  ]);

  const rows = (tasks.data ?? []) as unknown as Record<string, unknown>[];
  const done = rows.filter((task) => task.completed_at).length;

  // Fire and forget: a failed counter must never fail the page.
  void admin.rpc('app_touch_share_link', { p_id: link.id });

  return ok({
    label: link.label,
    workspace: (workspace.data as { name?: string } | null)?.name ?? null,
    project: {
      ...project,
      key: `${project.key}`,
    },
    scopes: [...scopes],
    progress: {
      total: rows.length,
      done,
      percent: rows.length === 0 ? 0 : Math.round((done / rows.length) * 100),
      overdue: rows.filter(
        (task) => !task.completed_at && task.due_date && new Date(task.due_date as string).getTime() < Date.now(),
      ).length,
    },
    tasks: scopes.has('tasks')
      ? rows.map((task) => ({
          id: task.id,
          key: `${project.key}-${task.number}`,
          title: task.title,
          status: task.status,
          priority: task.priority,
          dueDate: task.due_date,
          startDate: task.start_date,
          completedAt: task.completed_at,
          assignee: (task.assignee as { name?: string } | null)?.name ?? null,
        }))
      : [],
    milestones: milestones.data ?? [],
    docs: docs.data ?? [],
  });
});
