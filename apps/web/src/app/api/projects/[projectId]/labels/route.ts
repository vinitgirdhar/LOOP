import { z } from 'zod';
import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, body, created, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ projectId: string }> };

export const GET = route(async (request: Request, { params }: Params) => {
  const { projectId } = await params;
  const { supabase } = await requireMember(request);

  const { data, error } = await supabase.from('labels').select('*').eq('project_id', projectId).order('name');
  assertOk(error, 'Labels');
  return ok(data ?? []);
});

const schema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z.string().trim().max(20).optional(),
});

export const POST = route(async (request: Request, { params }: Params) => {
  const { projectId } = await params;
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'project.update');
  const input = await body(request, schema);

  const { data, error } = await ctx.supabase
    .from('labels')
    .insert({
      workspace_id: ctx.ws.workspaceId,
      project_id: projectId,
      name: input.name,
      ...(input.color ? { color: input.color } : {}),
    })
    .select('*')
    .single();

  assertOk(error, 'Label');
  return created(data);
});
