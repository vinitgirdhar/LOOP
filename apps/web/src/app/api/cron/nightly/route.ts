import { createAdminClient } from '@/lib/supabase/admin';
import { ok, route, unauthorized } from '@/lib/server/http';
import { computeHealth, persistHealth } from '@/lib/server/health';

/**
 * The nightly job.
 *
 * Three things that the schema always claimed happened and nothing actually
 * did: health snapshots, burndown points and rate-limit pruning. Without this
 * the trend chart and the burndown are only as real as whatever the seed
 * script wrote, which is the definition of a static demo.
 *
 * Runs with the service role because there is no user to act for — a scheduled
 * job has no session, and every project in every workspace is in scope. That
 * makes the authorisation check below the only thing standing in front of it.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Vercel signs cron invocations with `authorization: Bearer $CRON_SECRET`.
 *
 * Compared with a constant-time-ish check and refused outright when the secret
 * is not configured — an unset secret must fail closed, or deploying without
 * one silently publishes a button that rewrites every project's history.
 */
function assertScheduled(request: Request): void {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw unauthorized('Scheduled jobs are not configured');

  const header = request.headers.get('authorization');
  if (header !== `Bearer ${secret}`) throw unauthorized('Not a scheduled invocation');
}

interface ProjectRow {
  id: string;
  workspace_id: string;
}

interface SprintRow {
  id: string;
  project_id: string;
  workspace_id: string;
}

export const GET = route(async (request: Request) => {
  assertScheduled(request);
  const admin = createAdminClient();
  const startedAt = Date.now();

  const errors: string[] = [];

  // ── health snapshots ────────────────────────────────────────────────────
  const { data: projects } = await admin
    .from('projects')
    .select('id, workspace_id')
    .eq('status', 'ACTIVE')
    .is('archived_at', null);

  let snapshots = 0;
  for (const project of (projects ?? []) as ProjectRow[]) {
    try {
      const result = await computeHealth(admin, project.workspace_id, project.id);
      await persistHealth(admin, project.workspace_id, project.id, result);
      snapshots += 1;
    } catch (error: unknown) {
      // One bad project must not cost every project after it its snapshot.
      errors.push(`health ${project.id}: ${error instanceof Error ? error.message : 'failed'}`);
    }
  }

  // ── burndown points ─────────────────────────────────────────────────────
  const { data: sprints } = await admin
    .from('sprints')
    .select('id, project_id, workspace_id')
    .eq('status', 'ACTIVE');

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const date = today.toISOString().slice(0, 10);

  let points = 0;
  for (const sprint of (sprints ?? []) as SprintRow[]) {
    try {
      const { data: tasks } = await admin
        .from('tasks')
        .select('story_points, completed_at')
        .eq('sprint_id', sprint.id);

      const rows = (tasks ?? []) as { story_points: number | null; completed_at: string | null }[];
      const remainingPts = rows.filter((task) => !task.completed_at).reduce((sum, task) => sum + (task.story_points ?? 0), 0);
      const completedPts = rows.filter((task) => task.completed_at).reduce((sum, task) => sum + (task.story_points ?? 0), 0);

      // One row per sprint per day — the unique constraint makes a re-run a
      // correction rather than a duplicate.
      const { error } = await admin.from('burndown_points').upsert(
        {
          sprint_id: sprint.id,
          date,
          remaining_pts: remainingPts,
          completed_pts: completedPts,
          remaining_tasks: rows.filter((task) => !task.completed_at).length,
        },
        { onConflict: 'sprint_id,date' },
      );
      if (error) throw new Error(error.message);
      points += 1;
    } catch (error: unknown) {
      errors.push(`burndown ${sprint.id}: ${error instanceof Error ? error.message : 'failed'}`);
    }
  }

  // ── housekeeping ────────────────────────────────────────────────────────
  const { data: pruned } = await admin.rpc('app_prune_rate_limits');

  const summary = {
    snapshots,
    burndownPoints: points,
    rateLimitRowsPruned: pruned ?? 0,
    durationMs: Date.now() - startedAt,
    errors,
  };

  // Surfaced in the function log so a silently failing night is visible.
  if (errors.length > 0) console.error('[cron] nightly finished with errors', summary);
  else console.log('[cron] nightly', summary);

  return ok(summary);
});
