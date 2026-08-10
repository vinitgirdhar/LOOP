import { requireMember } from '@/lib/server/context';
import { assertOk, ok, route } from '@/lib/server/http';

type Params = { params: Promise<{ pageId: string }> };

export const GET = route(async (request: Request, { params }: Params) => {
  const { pageId } = await params;
  const { supabase } = await requireMember(request);

  const { data, error } = await supabase
    .from('wiki_versions')
    .select('id, version, title, created_at, author:profiles (id, name, avatar_url)')
    .eq('page_id', pageId)
    .order('version', { ascending: false });

  assertOk(error, 'Versions');
  return ok(data ?? []);
});
