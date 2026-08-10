import { z } from 'zod';
import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, body, created, ok, route } from '@/lib/server/http';

/** `secret` is never selected — it exists to verify webhooks, not to be read back. */
const SAFE = 'id, provider, enabled, config, project_id, created_at';

export const GET = route(async (request: Request) => {
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'workspace.integration.manage');

  const { data, error } = await ctx.supabase
    .from('integrations')
    .select(SAFE)
    .eq('workspace_id', ctx.ws.workspaceId)
    .order('created_at', { ascending: false });

  assertOk(error, 'Integrations');
  return ok(data ?? []);
});

const schema = z.object({
  provider: z.string().trim().min(1).max(40),
  projectId: z.string().uuid().nullable().optional(),
  config: z.record(z.string(), z.unknown()).default({}),
  secret: z.string().trim().max(200).nullable().optional(),
  enabled: z.boolean().default(true),
});

export const POST = route(async (request: Request) => {
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'workspace.integration.manage');
  const input = await body(request, schema);

  const { data, error } = await ctx.supabase
    .from('integrations')
    .insert({
      workspace_id: ctx.ws.workspaceId,
      provider: input.provider,
      project_id: input.projectId ?? null,
      config: input.config,
      secret: input.secret ?? null,
      enabled: input.enabled,
    })
    .select(SAFE)
    .single();

  assertOk(error, 'Integration');
  return created(data);
});
