import { z } from 'zod';
import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, body, created, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ workspaceId: string }> };

export const GET = route(async (request: Request, { params }: Params) => {
  const { supabase, ws } = await requireMember(request, await params);

  const { data, error } = await supabase
    .from('departments')
    .select('*')
    .eq('workspace_id', ws.workspaceId)
    .order('name', { ascending: true });

  assertOk(error, 'Departments');
  return ok(data ?? []);
});

const schema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(300).optional(),
});

export const POST = route(async (request: Request, { params }: Params) => {
  const ctx = await requireMember(request, await params);
  await requirePermission(ctx, ctx.ws, 'workspace.department.manage');
  const input = await body(request, schema);

  const { data, error } = await ctx.supabase
    .from('departments')
    .insert({ workspace_id: ctx.ws.workspaceId, name: input.name, description: input.description ?? null })
    .select('*')
    .single();

  assertOk(error, 'Department');
  return created(data);
});
