import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, badRequest, notFound, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ fileId: string }> };

/** Returns a short-lived signed URL rather than the bytes themselves. */
export const GET = route(async (request: Request, { params }: Params) => {
  const { fileId } = await params;
  const { supabase, ws } = await requireMember(request);

  const { data: file } = await supabase
    .from('attachments')
    .select('*, uploadedBy:profiles (id, name, avatar_url)')
    .eq('id', fileId)
    .eq('workspace_id', ws.workspaceId)
    .maybeSingle();

  if (!file) throw notFound('File not found');

  const { data: signed, error } = await supabase.storage.from('attachments').createSignedUrl(file.storage_path, 60 * 10);
  if (error) throw badRequest(error.message);

  return ok({ ...file, url: signed.signedUrl });
});

export const DELETE = route(async (request: Request, { params }: Params) => {
  const { fileId } = await params;
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'file.delete');

  const { data: file } = await ctx.supabase
    .from('attachments')
    .select('storage_path')
    .eq('id', fileId)
    .eq('workspace_id', ctx.ws.workspaceId)
    .maybeSingle();

  const { error } = await ctx.supabase.from('attachments').delete().eq('id', fileId).eq('workspace_id', ctx.ws.workspaceId);
  assertOk(error, 'File');

  if (file) await ctx.supabase.storage.from('attachments').remove([file.storage_path]);
  return ok({ deleted: true });
});
