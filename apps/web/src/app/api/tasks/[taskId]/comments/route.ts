import { z } from 'zod';
import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, body, created, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ taskId: string }> };

export const GET = route(async (request: Request, { params }: Params) => {
  const { taskId } = await params;
  const { supabase, ws } = await requireMember(request);

  const { data, error } = await supabase
    .from('comments')
    .select('*, author:profiles (id, name, avatar_url, mascot)')
    .eq('task_id', taskId)
    .eq('workspace_id', ws.workspaceId)
    .order('created_at', { ascending: true });

  assertOk(error, 'Comments');
  return ok(data ?? []);
});

const schema = z.object({
  body: z.string().trim().min(1, 'Write something first').max(5000),
  mentions: z.array(z.string().uuid()).max(20).default([]),
});

export const POST = route(async (request: Request, { params }: Params) => {
  const { taskId } = await params;
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'task.comment');
  const input = await body(request, schema);

  const { data, error } = await ctx.supabase
    .from('comments')
    .insert({
      workspace_id: ctx.ws.workspaceId,
      task_id: taskId,
      author_id: ctx.user.id,
      body: input.body,
      mentions: input.mentions,
    })
    .select('*, author:profiles (id, name, avatar_url, mascot)')
    .single();

  assertOk(error, 'Comment');
  return created(data);
});
