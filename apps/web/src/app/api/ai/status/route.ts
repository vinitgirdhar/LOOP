import { requireUser } from '@/lib/server/context';
import { ok, route } from '@/lib/server/http';
import { probeProviders } from '@/lib/server/ai';

/** Whether the AI features have a key configured, so the UI can say so plainly. */
export const GET = route(async (request: Request) => {
  await requireUser();

  const groq = Boolean(process.env.GROQ_API_KEY);
  const gemini = Boolean(process.env.GEMINI_API_KEY);

  // `?probe=1` actually calls each provider, so "configured" can be told apart
  // from "still answering". Opt-in: it costs a request per provider.
  const probes = new URL(request.url).searchParams.get('probe') === '1' ? await probeProviders() : undefined;

  // Field names match what the Ask page renders; `available` and `providers`
  // were read by nothing.
  return ok({
    enabled: groq || gemini,
    frontier: groq ? process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile' : null,
    fallback: gemini ? process.env.GEMINI_MODEL ?? 'gemini-2.0-flash' : null,
    embeddings: gemini ? process.env.GEMINI_EMBED_MODEL ?? 'text-embedding-004' : null,
    ...(probes ? { probes } : {}),
  });
});
