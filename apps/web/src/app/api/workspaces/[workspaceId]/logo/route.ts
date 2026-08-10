import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, badRequest, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ workspaceId: string }> };

const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
const MAX_BYTES = 2 * 1024 * 1024;

/** Logos live in the public `avatars` bucket — they are shown before sign-in. */
export const POST = route(async (request: Request, { params }: Params) => {
  const ctx = await requireMember(request, await params);
  await requirePermission(ctx, ctx.ws, 'workspace.update');

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw badRequest('Attach an image');
  if (file.size > MAX_BYTES) throw badRequest('Logos must be 2MB or smaller');
  if (!ALLOWED.includes(file.type)) throw badRequest('Use a PNG, JPEG, WebP or SVG');

  const path = `workspaces/${ctx.ws.workspaceId}-${Date.now()}`;
  const { error: uploadFailed } = await ctx.supabase.storage
    .from('avatars')
    .upload(path, file, { contentType: file.type, upsert: true });

  if (uploadFailed) throw badRequest(uploadFailed.message);

  const { data: published } = ctx.supabase.storage.from('avatars').getPublicUrl(path);

  const { data, error } = await ctx.supabase
    .from('workspaces')
    .update({ logo_url: published.publicUrl })
    .eq('id', ctx.ws.workspaceId)
    .select('id, name, logo_url')
    .single();

  assertOk(error, 'Workspace');
  return ok(data);
});
