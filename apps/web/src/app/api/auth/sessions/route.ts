import { requireUser } from '@/lib/server/context';
import { ok, route } from '@/lib/server/http';

/**
 * Supabase does not expose per-session listing to a client, so this reports the
 * session making the request rather than pretending to enumerate the others.
 * "Sign out everywhere" still works and is the control that actually matters.
 */
export const GET = route(async (request: Request) => {
  const { user } = await requireUser();

  return ok([
    {
      id: 'current',
      current: true,
      userId: user.id,
      userAgent: request.headers.get('user-agent') ?? 'Unknown device',
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      createdAt: null,
      lastUsedAt: new Date().toISOString(),
    },
  ]);
});
