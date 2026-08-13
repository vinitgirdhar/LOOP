import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

export interface AuditEntry {
  /** Null for platform-level events that belong to no single workspace. */
  workspaceId: string | null;
  actorId: string;
  /** Dotted verb, e.g. `suggestion.accepted`, `project.created`. */
  action: string;
  /** The kind of thing acted on, e.g. `ai_suggestion`, `project`, `task`. */
  entity: string;
  entityId?: string | null;
  meta?: Record<string, unknown>;
}

/**
 * Append one entry to the audit log.
 *
 * Written with the service role on purpose: `audit_log` has a SELECT-only RLS
 * policy (owners and platform admins read it; nothing writes it through a user
 * session), so an ordinary client insert is denied by design.
 *
 * Fire-and-forget: a failed audit write must never fail the action that caused
 * it, so this logs and swallows its own errors rather than throwing into the
 * request.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from('audit_log').insert({
      workspace_id: entry.workspaceId,
      actor_id: entry.actorId,
      action: entry.action,
      entity: entry.entity,
      entity_id: entry.entityId ?? null,
      meta: entry.meta ?? {},
    });
    if (error) console.error('[audit] write failed:', entry.action, error.message);
  } catch (error) {
    console.error('[audit] write threw:', error);
  }
}
