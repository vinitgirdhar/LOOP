import 'server-only';

/**
 * The AI provider, kept behind one function.
 *
 * Groq is the default because it is fast and cheap; Gemini stands in when only
 * that key is present. Both keys are server-only — an API key in a client
 * bundle is a key that has been given away.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export const isAiConfigured = () => Boolean(process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY);

const TIMEOUT_MS = 25_000;

/** Kept as an alias so a retired version number cannot take the feature down. */
const GEMINI_FALLBACK_MODEL = 'gemini-flash-latest';

export type AiFailure = 'unconfigured' | 'rate_limited' | 'rejected' | 'unavailable';

/**
 * A provider failure the UI can act on.
 *
 * "The AI did not answer" is not a useful thing to tell somebody. A spent quota
 * and a wrong key need different responses, and both look identical once the
 * status code is thrown away.
 */
export class AiError extends Error {
  constructor(
    public reason: AiFailure,
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

const failureFor = (status: number): AiFailure =>
  status === 429 ? 'rate_limited' : status === 401 || status === 403 ? 'rejected' : 'unavailable';

/**
 * What to tell the person looking at the screen.
 *
 * "Something went wrong" is useless to a reader who could act on the real
 * reason. A spent free-tier quota is a wait-or-upgrade problem, a rejected key
 * is a configuration problem, and a retired model is a deploy problem — three
 * different next steps that a generic message throws away.
 */
const describe = (provider: string, status: number) => {
  const name = provider === 'groq' ? 'Groq' : provider === 'gemini' ? 'Gemini' : provider;
  if (status === 429) return `The free ${name} API quota has been used up. It resets on ${name}'s own schedule — try again shortly, or add a paid key.`;
  if (status === 401 || status === 403) return `${name} rejected the API key. Check it is correct and still active.`;
  if (status === 404) return `The configured ${name} model no longer exists. It has probably been retired.`;
  if (status >= 500) return `${name} is having an outage (${status}). This is on their side.`;
  return `${name} replied ${status}.`;
};

async function callGroq(messages: ChatMessage[], key: string, targetModel?: string): Promise<string> {
  const model = targetModel || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  // Fall back automatically if a specific Groq model version is unlisted or deprecated for this key
  if (response.status === 404 && model !== 'llama-3.1-8b-instant') {
    return callGroq(messages, key, 'llama-3.1-8b-instant');
  }

  if (!response.ok) throw new AiError(failureFor(response.status), describe('groq', response.status), response.status);

  const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  return payload.choices?.[0]?.message?.content ?? '';
}

async function callGemini(messages: ChatMessage[], key: string, targetModel?: string): Promise<string> {
  // A moving alias, not a pinned version. `gemini-2.0-flash` and `gemini-1.5-flash`
  // were both retired by Google while this code sat unchanged, and every AI
  // feature returned 404 until someone noticed. `-latest` cannot rot the same way.
  const model = targetModel || process.env.GEMINI_MODEL || 'gemini-flash-latest';
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const rest = messages.filter((m) => m.role !== 'system');

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents: rest.map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
      })),
      generationConfig: { temperature: 0.2 },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  // A 404 here means the configured model was retired, not that the key is bad.
  // Retry once against the alias, which Google keeps pointing at a live model.
  if (response.status === 404 && model !== GEMINI_FALLBACK_MODEL) {
    console.warn(`[ai] gemini model ${model} is unavailable, retrying with ${GEMINI_FALLBACK_MODEL}`);
    return callGemini(messages, key, GEMINI_FALLBACK_MODEL);
  }

  if (!response.ok) throw new AiError(failureFor(response.status), describe('gemini', response.status), response.status);

  const payload = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
}

export async function chat(messages: ChatMessage[]): Promise<string> {
  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  let first: unknown;

  if (groqKey) {
    try {
      return await callGroq(messages, groqKey);
    } catch (error) {
      // Fall through to Gemini rather than failing the request outright.
      console.error('[ai] groq failed', error);
      first = error;
      if (!geminiKey) throw error;
    }
  }

  if (geminiKey) {
    try {
      return await callGemini(messages, geminiKey);
    } catch (error) {
      console.error('[ai] gemini failed', error);
      // Report whichever failure explains it best: a spent quota is the useful
      // thing to say even when the second provider merely timed out.
      const spent = [first, error].find((candidate) => candidate instanceof AiError && candidate.reason === 'rate_limited');
      throw spent ?? error;
    }
  }

  throw new AiError('unconfigured', 'No AI provider is configured', undefined);
}

/**
 * A deliberately tiny live call to each configured provider.
 *
 * Whether a key is *present* and whether it still *works* are different
 * questions, and only the second one matters when the answers stop coming.
 * Kept off the normal status response because it costs a request per provider.
 */
export async function probeProviders(): Promise<{ provider: string; configured: boolean; ok: boolean; detail: string }[]> {
  const probe = async (provider: 'groq' | 'gemini', key: string | undefined) => {
    if (!key) return { provider, configured: false, ok: false, detail: 'No API key set' };
    try {
      const reply = provider === 'groq'
        ? await callGroq([{ role: 'user', content: 'ping' }], key)
        : await callGemini([{ role: 'user', content: 'ping' }], key);
      return { provider, configured: true, ok: true, detail: reply ? 'Answered' : 'Answered empty' };
    } catch (error) {
      const detail = error instanceof AiError ? error.message : error instanceof Error ? error.message : 'Failed';
      return { provider, configured: true, ok: false, detail };
    }
  };

  return Promise.all([probe('groq', process.env.GROQ_API_KEY), probe('gemini', process.env.GEMINI_API_KEY)]);
}
