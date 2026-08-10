import { z } from 'zod';
import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, body, created, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ projectId: string }> };

export const GET = route(async (request: Request, { params }: Params) => {
  const { projectId } = await params;
  const { supabase } = await requireMember(request);

  const { data, error } = await supabase
    .from('project_members')
    .select('id, role, added_at, user:profiles (id, name, email, avatar_url, mascot)')
    .eq('project_id', projectId);

  assertOk(error, 'Project members');
  return ok(data ?? []);
});

const schema = z.object({
  userId: z.string().uuid(),
  role: z.string().trim().max(30).default('MEMBER'),
});

export const POST = route(async (request: Request, { params }: Params) => {
  const { projectId } = await params;
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'project.update');
  const input = await body(request, schema);

  const { data, error } = await ctx.supabase
    .from('project_members')
    .insert({ project_id: projectId, user_id: input.userId, role: input.role })
    .select('id, role, user:profiles (id, name, email, avatar_url)')
    .single();

  assertOk(error, 'Project member');
  return created(data);
});
