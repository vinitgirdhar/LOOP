import { z } from 'zod';
import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, body, created, ok, route } from '@/lib/server/http';

export const GET = route(async (request: Request) => {
  const { supabase, ws } = await requireMember(request);
  const url = new URL(request.url);

  let query = supabase.from('folders').select('*').eq('workspace_id', ws.workspaceId).order('name');
  const projectId = url.searchParams.get('projectId');
  if (projectId) query = query.eq('project_id', projectId);

  const { data, error } = await query;
  assertOk(error, 'Folders');
  return ok(data ?? []);
});

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  parentId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
});

export const POST = route(async (request: Request) => {
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'file.upload');
  const input = await body(request, schema);

  const { data, error } = await ctx.supabase
    .from('folders')
    .insert({
      workspace_id: ctx.ws.workspaceId,
      name: input.name,
      parent_id: input.parentId ?? null,
      project_id: input.projectId ?? null,
    })
    .select('*')
    .single();

  assertOk(error, 'Folder');
  return created(data);
});
