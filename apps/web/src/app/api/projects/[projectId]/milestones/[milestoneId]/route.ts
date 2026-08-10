import { z } from 'zod';
import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, body, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ projectId: string; milestoneId: string }> };

const schema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  completed: z.boolean().optional(),
});

export const PATCH = route(async (request: Request, { params }: Params) => {
  const { projectId, milestoneId } = await params;
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'project.update');
  const input = await body(request, schema);

  const { data, error } = await ctx.supabase
    .from('milestones')
    .update({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.dueDate !== undefined ? { due_date: input.dueDate } : {}),
      ...(input.completed !== undefined ? { completed_at: input.completed ? new Date().toISOString() : null } : {}),
    })
    .eq('id', milestoneId)
    .eq('project_id', projectId)
    .select('*')
    .single();

  assertOk(error, 'Milestone');
  return ok(data);
});

export const DELETE = route(async (request: Request, { params }: Params) => {
  const { projectId, milestoneId } = await params;
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'project.update');

  const { error } = await ctx.supabase.from('milestones').delete().eq('id', milestoneId).eq('project_id', projectId);
  assertOk(error, 'Milestone');
  return ok({ deleted: true });
});
