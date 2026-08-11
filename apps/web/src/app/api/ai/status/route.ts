import { requireUser } from '@/lib/server/context';
import { ok, route } from '@/lib/server/http';

/** Whether the AI features have a key configured, so the UI can say so plainly. */
export const GET = route(async () => {
  await requireUser();

  const groq = Boolean(process.env.GROQ_API_KEY);
  const gemini = Boolean(process.env.GEMINI_API_KEY);

  // Field names match what the Ask page renders; `available` and `providers`
  // were read by nothing.
  return ok({
    enabled: groq || gemini,
    frontier: groq ? process.env.GROQ_MODEL ?? 'groq' : null,
    fallback: gemini ? process.env.GEMINI_MODEL ?? 'gemini' : null,
    embeddings: gemini ? process.env.GEMINI_EMBED_MODEL ?? 'text-embedding-004' : null,
  });
});
