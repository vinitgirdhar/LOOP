import { z } from 'zod';
import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, body, created, ok, route } from '@/lib/server/http';
import { emptyScene } from '@/lib/whiteboard';

/** Boards in this workspace, newest first. Scenes are omitted from the list. */
export const GET = route(async (request: Request) => {
  const { supabase, ws } = await requireMember(request);
  const projectId = new URL(request.url).searchParams.get('projectId');

  let query = supabase
    .from('whiteboards')
    .select('id, title, kind, project_id, created_at, updated_at, updatedBy:profiles!whiteboards_updated_by_fkey (id, name)')
    .eq('workspace_id', ws.workspaceId)
    .order('updated_at', { ascending: false });

  if (projectId) query = query.eq('project_id', projectId);

  const { data, error } = await query;
  assertOk(error, 'Whiteboards');
  return ok(data ?? []);
});

const createSchema = z.object({
  title: z.string().trim().min(1).max(120).default('Untitled board'),
  kind: z.enum(['mindmap', 'whiteboard']).default('mindmap'),
  projectId: z.string().uuid().nullable().optional(),
});

export const POST = route(async (request: Request) => {
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'wiki.write');
  const input = await body(request, createSchema);

  const { data, error } = await ctx.supabase
    .from('whiteboards')
    .insert({
      workspace_id: ctx.ws.workspaceId,
      project_id: input.projectId ?? null,
      title: input.title,
      kind: input.kind,
      scene: emptyScene(input.kind),
      created_by: ctx.user.id,
      updated_by: ctx.user.id,
    })
    .select('id, title, kind, project_id, scene, created_at, updated_at')
    .single();

  assertOk(error, 'Whiteboard');
  return created(data);
});
