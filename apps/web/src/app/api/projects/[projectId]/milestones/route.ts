import { z } from 'zod';
import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, body, created, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ projectId: string }> };

export const GET = route(async (request: Request, { params }: Params) => {
  const { projectId } = await params;
  const { supabase } = await requireMember(request);

  const { data, error } = await supabase
    .from('milestones')
    .select('*')
    .eq('project_id', projectId)
    .order('due_date', { ascending: true, nullsFirst: false });

  assertOk(error, 'Milestones');
  return ok(data ?? []);
});

const schema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
});

export const POST = route(async (request: Request, { params }: Params) => {
  const { projectId } = await params;
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'project.update');
  const input = await body(request, schema);

  const { data, error } = await ctx.supabase
    .from('milestones')
    .insert({
      workspace_id: ctx.ws.workspaceId,
      project_id: projectId,
      title: input.title,
      description: input.description ?? null,
      due_date: input.dueDate ?? null,
    })
    .select('*')
    .single();

  assertOk(error, 'Milestone');
  return created(data);
});
