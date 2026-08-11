import { z } from 'zod';
import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, body, notFound, ok, route } from '@/lib/server/http';
import { NODE_COLOURS, NODE_SHAPES, normaliseScene } from '@/lib/whiteboard';

type Params = { params: Promise<{ boardId: string }> };

export const GET = route(async (request: Request, { params }: Params) => {
  const { boardId } = await params;
  const { supabase, ws } = await requireMember(request);

  const { data, error } = await supabase
    .from('whiteboards')
    .select('id, title, kind, project_id, scene, created_at, updated_at')
    .eq('id', boardId)
    .eq('workspace_id', ws.workspaceId)
    .maybeSingle();

  assertOk(error, 'Whiteboard');
  if (!data) throw notFound('Board not found');

  return ok({ ...data, scene: normaliseScene((data as { scene: unknown }).scene) });
});

/**
 * The scene is validated field by field rather than accepted as free jsonb.
 *
 * The column has a size ceiling and an "is an object" check, but Postgres will
 * happily store `{"nodes":[{"text":"<script>…"}]}` — so the shape is pinned
 * here, node text is capped, and coordinates must be finite. A canvas that
 * renders text as SVG `<text>` is not an injection route, but the next reader
 * of this data might not render it the same way.
 */
const sceneSchema = z.object({
  nodes: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        x: z.number().finite(),
        y: z.number().finite(),
        text: z.string().max(280),
        colour: z.enum(NODE_COLOURS),
        shape: z.enum(NODE_SHAPES),
      }),
    )
    .max(500),
  edges: z.array(z.object({ from: z.string().max(64), to: z.string().max(64) })).max(1000),
});

const patchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  scene: sceneSchema.optional(),
});

export const PATCH = route(async (request: Request, { params }: Params) => {
  const { boardId } = await params;
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'wiki.write');
  const input = await body(request, patchSchema);

  const { data, error } = await ctx.supabase
    .from('whiteboards')
    .update({
      ...(input.title !== undefined ? { title: input.title } : {}),
      // Normalised again on the way in: dangling edges from a client that
      // deleted a node mid-save would otherwise be persisted.
      ...(input.scene !== undefined ? { scene: normaliseScene(input.scene) } : {}),
      updated_by: ctx.user.id,
    })
    .eq('id', boardId)
    .eq('workspace_id', ctx.ws.workspaceId)
    .select('id, title, updated_at')
    .single();

  assertOk(error, 'Whiteboard');
  return ok(data);
});

export const DELETE = route(async (request: Request, { params }: Params) => {
  const { boardId } = await params;
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'wiki.write');

  const { error } = await ctx.supabase
    .from('whiteboards')
    .delete()
    .eq('id', boardId)
    .eq('workspace_id', ctx.ws.workspaceId);

  assertOk(error, 'Whiteboard');
  return ok({ id: boardId });
});
