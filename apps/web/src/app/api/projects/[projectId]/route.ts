import { z } from 'zod';
import { PRIORITIES, PROJECT_STATUSES } from '@loop/shared';
import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, body, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ projectId: string }> };

export const GET = route(async (request: Request, { params }: Params) => {
  const { projectId } = await params;
  const { supabase, ws } = await requireMember(request);

  const { data, error } = await supabase
    .from('projects')
    .select('*, columns:board_columns (*), milestones (*), labels (*), members:project_members (id, role, user:profiles (id, name, email, avatar_url, mascot))')
    .eq('id', projectId)
    .eq('workspace_id', ws.workspaceId)
    .single();

  assertOk(error, 'Project');
  return ok(data);
});

const patchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  color: z.string().trim().max(20).optional(),
  startDate: z.string().datetime().nullable().optional(),
  deadline: z.string().datetime().nullable().optional(),
  autoApply: z.boolean().optional(),
});

export const PATCH = route(async (request: Request, { params }: Params) => {
  const { projectId } = await params;
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'project.update');
  const input = await body(request, patchSchema);

  const { data, error } = await ctx.supabase
    .from('projects')
    .update({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.startDate !== undefined ? { start_date: input.startDate } : {}),
      ...(input.deadline !== undefined ? { deadline: input.deadline } : {}),
      ...(input.autoApply !== undefined ? { auto_apply: input.autoApply } : {}),
      ...(input.status === 'ARCHIVED' ? { archived_at: new Date().toISOString() } : {}),
    })
    .eq('id', projectId)
    .eq('workspace_id', ctx.ws.workspaceId)
    .select('*')
    .single();

  assertOk(error, 'Project');
  return ok(data);
});

export const DELETE = route(async (request: Request, { params }: Params) => {
  const { projectId } = await params;
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'project.delete');

  const { error } = await ctx.supabase.from('projects').delete().eq('id', projectId).eq('workspace_id', ctx.ws.workspaceId);
  assertOk(error, 'Project');
  return ok({ deleted: true });
});
