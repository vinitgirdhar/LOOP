import { requireUser } from '@/lib/server/context';
import { ok, route } from '@/lib/server/http';

/** Whether the AI features have a key configured, so the UI can say so plainly. */
export const GET = route(async () => {
  await requireUser();

  const groq = Boolean(process.env.GROQ_API_KEY);
  const gemini = Boolean(process.env.GEMINI_API_KEY);

  return ok({
    available: groq || gemini,
    providers: { groq, gemini },
    model: process.env.GROQ_MODEL ?? null,
  });
});
