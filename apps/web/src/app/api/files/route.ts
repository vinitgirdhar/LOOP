import { ALLOWED_UPLOAD_MIME } from '@loop/shared';
import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, badRequest, created, ok, route } from '@/lib/server/http';

const MAX_BYTES = 25 * 1024 * 1024;

export const GET = route(async (request: Request) => {
  const { supabase, ws } = await requireMember(request);
  const url = new URL(request.url);

  let query = supabase
    .from('attachments')
    .select('*, uploadedBy:profiles (id, name, avatar_url)')
    .eq('workspace_id', ws.workspaceId)
    .order('created_at', { ascending: false });

  const folderId = url.searchParams.get('folderId');
  const projectId = url.searchParams.get('projectId');
  const taskId = url.searchParams.get('taskId');
  if (folderId) query = query.eq('folder_id', folderId);
  if (projectId) query = query.eq('project_id', projectId);
  if (taskId) query = query.eq('task_id', taskId);

  const { data, error } = await query;
  assertOk(error, 'Files');
  return ok(data ?? []);
});

/**
 * Uploads go to the private `attachments` bucket, and the row that records them
 * is what row level security filters on. The bytes are never public — reads go
 * back out through a signed URL issued only to someone who can already see the
 * row.
 */
export const POST = route(async (request: Request) => {
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'file.upload');

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw badRequest('Attach a file');
  if (file.size > MAX_BYTES) throw badRequest('Files must be 25MB or smaller');
  if (!ALLOWED_UPLOAD_MIME.includes(file.type)) throw badRequest(`${file.type || 'That file type'} is not allowed`);

  const asString = (key: string) => {
    const value = form.get(key);
    return typeof value === 'string' && value.length > 0 ? value : null;
  };

  const safeName = file.name.replace(/[^\w.\-]+/g, '_').slice(-120);
  const storagePath = `${ctx.ws.workspaceId}/${crypto.randomUUID()}-${safeName}`;

  const { error: uploadFailed } = await ctx.supabase.storage
    .from('attachments')
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (uploadFailed) throw badRequest(uploadFailed.message);

  const { data, error } = await ctx.supabase
    .from('attachments')
    .insert({
      workspace_id: ctx.ws.workspaceId,
      name: file.name,
      mime: file.type,
      size: file.size,
      storage_path: storagePath,
      uploaded_by_id: ctx.user.id,
      folder_id: asString('folderId'),
      project_id: asString('projectId'),
      task_id: asString('taskId'),
      wiki_page_id: asString('wikiPageId'),
      message_id: asString('messageId'),
      version: 1,
    })
    .select('*, uploadedBy:profiles (id, name, avatar_url)')
    .single();

  if (error) {
    // Do not leave bytes behind that no row points at.
    await ctx.supabase.storage.from('attachments').remove([storagePath]);
    assertOk(error, 'File');
  }

  return created(data);
});
