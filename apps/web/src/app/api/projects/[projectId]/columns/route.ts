import { z } from 'zod';
import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, body, created, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ projectId: string }> };

export const GET = route(async (request: Request, { params }: Params) => {
  const { projectId } = await params;
  const { supabase } = await requireMember(request);

  const { data, error } = await supabase.from('board_columns').select('*').eq('project_id', projectId).order('order');
  assertOk(error, 'Columns');
  return ok(data ?? []);
});

const schema = z.object({
  name: z.string().trim().min(1).max(40),
  key: z.string().trim().regex(/^[a-z0-9_]+$/, 'Lowercase letters, digits and underscores').max(30).optional(),
  order: z.number().int().min(0).optional(),
  isDone: z.boolean().default(false),
  color: z.string().trim().max(20).optional(),
  wipLimit: z.number().int().min(1).max(50).nullable().optional(),
});

export const POST = route(async (request: Request, { params }: Params) => {
  const { projectId } = await params;
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'project.update');
  const input = await body(request, schema);

  const { count } = await ctx.supabase
    .from('board_columns')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId);

  const { data, error } = await ctx.supabase
    .from('board_columns')
    .insert({
      project_id: projectId,
      name: input.name,
      key: input.key ?? input.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30),
      order: input.order ?? (count ?? 0),
      is_done: input.isDone,
      ...(input.color ? { color: input.color } : {}),
      wip_limit: input.wipLimit ?? null,
    })
    .select('*')
    .single();

  assertOk(error, 'Column');
  return created(data);
});
