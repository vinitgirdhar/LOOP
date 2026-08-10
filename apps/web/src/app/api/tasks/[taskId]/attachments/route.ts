import { requireMember } from '@/lib/server/context';
import { assertOk, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ taskId: string }> };

/**
 * Files attached to a task, each with a short-lived signed URL.
 *
 * The bucket is private, so the link is minted per request for someone who can
 * already read the row — the URL is the grant, and it expires.
 */
export const GET = route(async (request: Request, { params }: Params) => {
  const { taskId } = await params;
  const { supabase, ws } = await requireMember(request);

  const { data, error } = await supabase
    .from('attachments')
    .select('*, uploadedBy:profiles (id, name, avatar_url)')
    .eq('task_id', taskId)
    .eq('workspace_id', ws.workspaceId)
    .order('created_at', { ascending: false });

  assertOk(error, 'Attachments');

  const rows = data ?? [];
  if (rows.length === 0) return ok([]);

  const { data: signed } = await supabase.storage
    .from('attachments')
    .createSignedUrls(rows.map((row) => row.storage_path), 60 * 10);

  const urlByPath = new Map((signed ?? []).map((entry) => [entry.path, entry.signedUrl]));
  return ok(rows.map((row) => ({ ...row, url: urlByPath.get(row.storage_path) ?? null })));
});
