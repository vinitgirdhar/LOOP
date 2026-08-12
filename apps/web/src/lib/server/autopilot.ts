import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The Auto-Pilot rules engine.
 *
 * Deterministic on purpose. The product claim is that a suggestion names its
 * trigger, quotes its evidence and scores its own confidence — none of which a
 * language model can be trusted to do reproducibly. So the mapping from a
 * repository event to a proposed board change is a table, and the model is
 * never consulted here at all.
 *
 * Confidence values are the ceiling for auto-apply: a project with auto_apply
 * on takes anything above 0.9, which is why "pull request opened" scores higher
 * than "somebody pushed a commit" — one is an explicit act of finishing work,
 * the other happens fifty times a day.
 */

export const GITHUB_EVENTS = ['branch_created', 'push', 'pull_request_opened', 'pull_request_merged'] as const;
export type GithubEvent = (typeof GITHUB_EVENTS)[number];

interface Rule {
  /** Board column key the task should move to. */
  status: string;
  confidence: number;
  label: string;
  describe: (reference: string, repo: string) => string;
}

const RULES: Record<GithubEvent, Rule> = {
  branch_created: {
    status: 'in_progress',
    confidence: 0.88,
    label: 'branch created',
    describe: (reference, repo) => `${repo} — branch \`${reference}\` created`,
  },
  push: {
    status: 'in_progress',
    confidence: 0.9,
    label: 'commit pushed',
    describe: (reference, repo) => `${repo} — ${reference}`,
  },
  pull_request_opened: {
    status: 'code_review',
    confidence: 0.94,
    label: 'pull request opened',
    describe: (reference, repo) => `${repo} — pull request "${reference}" opened`,
  },
  pull_request_merged: {
    status: 'testing',
    confidence: 0.92,
    label: 'pull request merged',
    describe: (reference, repo) => `${repo} — pull request "${reference}" merged`,
  },
};

/**
 * Pulls every task key out of a branch name or pull request title.
 *
 * `feat/PAY-4-refund-flow` yields PAY-4. Deliberately greedy about separators
 * because real branch names use all of them, and deliberately case-insensitive
 * because nobody types the key in caps at 2am.
 */
export function extractTaskKeys(reference: string): { projectKey: string; number: number }[] {
  const found = new Map<string, { projectKey: string; number: number }>();
  for (const match of reference.matchAll(/\b([A-Za-z][A-Za-z0-9]{1,9})[-_ ]?(\d{1,6})\b/g)) {
    const projectKey = match[1]!.toUpperCase();
    const number = Number(match[2]);
    if (!Number.isInteger(number) || number <= 0) continue;
    found.set(`${projectKey}-${number}`, { projectKey, number });
  }
  return [...found.values()];
}

export interface SuggestionOutcome {
  created: number;
  skipped: string[];
  matched: string[];
}

/**
 * Turns one repository event into suggestions for every task it references.
 *
 * Returns what happened rather than throwing, because a webhook that 500s
 * because one branch name mentioned a deleted ticket is a webhook GitHub will
 * eventually stop calling.
 */
export async function suggestFromGithubEvent(
  supabase: SupabaseClient,
  options: { workspaceId: string; actorId: string; event: GithubEvent; reference: string; repo: string },
): Promise<SuggestionOutcome> {
  const rule = RULES[options.event];
  const keys = extractTaskKeys(options.reference);

  const outcome: SuggestionOutcome = { created: 0, skipped: [], matched: [] };
  if (keys.length === 0) return outcome;

  for (const { projectKey, number } of keys) {
    const { data: project } = await supabase
      .from('projects')
      .select('id, key, auto_apply')
      .eq('workspace_id', options.workspaceId)
      .eq('key', projectKey)
      .maybeSingle();

    if (!project) {
      outcome.skipped.push(`${projectKey}-${number} (no project with key ${projectKey})`);
      continue;
    }

    const { data: task } = await supabase
      .from('tasks')
      .select('id, number, title, status')
      .eq('project_id', project.id)
      .eq('number', number)
      .maybeSingle();

    if (!task) {
      outcome.skipped.push(`${projectKey}-${number} (no such task)`);
      continue;
    }

    const taskKey = `${projectKey}-${number}`;
    outcome.matched.push(taskKey);

    // Already where the rule wants it: proposing a no-op change is noise, and
    // an inbox full of noise is an inbox nobody reads.
    if (task.status === rule.status) {
      outcome.skipped.push(`${taskKey} (already in ${rule.status})`);
      continue;
    }

    // One pending proposal per task per kind. A branch pushed to ten times
    // must not produce ten identical cards.
    const { data: existing } = await supabase
      .from('ai_suggestions')
      .select('id')
      .eq('workspace_id', options.workspaceId)
      .eq('task_id', task.id)
      .eq('kind', 'MOVE_STATUS')
      .eq('status', 'PENDING')
      .maybeSingle();

    if (existing) {
      outcome.skipped.push(`${taskKey} (already proposed)`);
      continue;
    }

    const evidence = [
      {
        type: 'github',
        label: rule.label,
        url: null,
        quote: rule.describe(options.reference, options.repo),
      },
    ];

    const { error } = await supabase.from('ai_suggestions').insert({
      workspace_id: options.workspaceId,
      project_id: project.id,
      task_id: task.id,
      kind: 'MOVE_STATUS',
      title: `Move ${taskKey} to ${rule.status.replace('_', ' ')}`,
      rationale: `A ${rule.label} on ${options.repo} references ${taskKey}, which is still in ${task.status.replace('_', ' ')}.`,
      evidence,
      confidence: rule.confidence,
      // The decide route reads `status` off this object directly, so the field
      // name here is a contract with it, not free-form JSON.
      proposed_change: { field: 'status', from: task.status, status: rule.status },
      source: 'rules',
      status: 'PENDING',
    });

    if (error) {
      outcome.skipped.push(`${taskKey} (${error.message})`);
      continue;
    }

    outcome.created += 1;

    // Activity is what the health score's "silent task" signal reads, so an
    // event that produced a suggestion must also count as the task moving.
    await supabase
      .from('activity_log')
      .insert({
        workspace_id: options.workspaceId,
        project_id: project.id,
        task_id: task.id,
        actor_id: options.actorId,
        type: 'INTEGRATION',
        message: `GitHub ${rule.label}: ${options.reference}`,
        meta: { provider: 'github', event: options.event, repo: options.repo, simulated: true },
      });

    await supabase.from('tasks').update({ last_activity_at: new Date().toISOString() }).eq('id', task.id);
  }

  return outcome;
}
