import { z } from 'zod';
import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, body, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ integrationId: string }> };

const SAFE = 'id, provider, enabled, config, project_id, created_at';

const schema = z.object({
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  secret: z.string().trim().max(200).nullable().optional(),
});

export const PATCH = route(async (request: Request, { params }: Params) => {
  const { integrationId } = await params;
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'workspace.integration.manage');
  const input = await body(request, schema);

  const { data, error } = await ctx.supabase
    .from('integrations')
    .update({
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.config !== undefined ? { config: input.config } : {}),
      ...(input.secret !== undefined ? { secret: input.secret } : {}),
    })
    .eq('id', integrationId)
    .eq('workspace_id', ctx.ws.workspaceId)
    .select(SAFE)
    .single();

  assertOk(error, 'Integration');
  return ok(data);
});

export const DELETE = route(async (request: Request, { params }: Params) => {
  const { integrationId } = await params;
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'workspace.integration.manage');

  const { error } = await ctx.supabase
    .from('integrations')
    .delete()
    .eq('id', integrationId)
    .eq('workspace_id', ctx.ws.workspaceId);

  assertOk(error, 'Integration');
  return ok({ deleted: true });
});
