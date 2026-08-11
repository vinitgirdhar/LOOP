import { z } from 'zod';
import { requireMember, requirePermission } from '@/lib/server/context';
import { assertOk, body, created, ok, route } from '@/lib/server/http';

export const GET = route(async (request: Request) => {
  const { supabase, ws } = await requireMember(request);
  const url = new URL(request.url);

  let query = supabase.from('folders').select('*').eq('workspace_id', ws.workspaceId).order('name');
  const projectId = url.searchParams.get('projectId');
  if (projectId) query = query.eq('project_id', projectId);

  const { data, error } = await query;
  assertOk(error, 'Folders');

  const folders = data ?? [];
  const ids = folders.map((folder: { id: string }) => folder.id);
  if (ids.length === 0) return ok([]);

  const [{ data: files }, { data: children }] = await Promise.all([
    supabase.from('attachments').select('folder_id').in('folder_id', ids),
    supabase.from('folders').select('parent_id').in('parent_id', ids),
  ]);

  const fileCount = new Map<string, number>();
  for (const row of (files ?? []) as { folder_id: string | null }[]) {
    if (row.folder_id) fileCount.set(row.folder_id, (fileCount.get(row.folder_id) ?? 0) + 1);
  }
  const childCount = new Map<string, number>();
  for (const row of (children ?? []) as { parent_id: string | null }[]) {
    if (row.parent_id) childCount.set(row.parent_id, (childCount.get(row.parent_id) ?? 0) + 1);
  }

  return ok(
    folders.map((folder: Record<string, unknown>) => ({
      ...folder,
      _count: { files: fileCount.get(folder.id as string) ?? 0, children: childCount.get(folder.id as string) ?? 0 },
    })),
  );
});

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  parentId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
});

export const POST = route(async (request: Request) => {
  const ctx = await requireMember(request);
  await requirePermission(ctx, ctx.ws, 'file.upload');
  const input = await body(request, schema);

  const { data, error } = await ctx.supabase
    .from('folders')
    .insert({
      workspace_id: ctx.ws.workspaceId,
      name: input.name,
      parent_id: input.parentId ?? null,
      project_id: input.projectId ?? null,
    })
    .select('*')
    .single();

  assertOk(error, 'Folder');
  return created(data);
});
