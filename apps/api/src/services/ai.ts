import type { ZodSchema } from 'zod';
import { env, features } from '../env.js';
import { logger } from '../lib/logger.js';

/**
 * One server-side gateway for every model call.
 *
 * Frontier  = Groq  (fast, used first)
 * Fallback  = Gemini (used when Groq is missing, rate limited or errors)
 * Embeddings = Gemini only — Groq does not serve an embeddings endpoint.
 *
 * Hard rule enforced by callers: model output is only ever a *proposal*.
 * Nothing here writes to the database.
 */

export interface CompleteOptions {
  system: string;
  prompt: string;
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface CompletionResult {
  text: string;
  provider: 'groq' | 'gemini';
  model: string;
}

export class AiUnavailableError extends Error {
  constructor() {
    super('No AI provider is configured. Set GROQ_API_KEY or GEMINI_API_KEY.');
    this.name = 'AiUnavailableError';
  }
}

async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function callGroq(opts: CompleteOptions): Promise<CompletionResult> {
  const res = await withTimeout(opts.timeoutMs ?? 30_000, (signal) =>
    fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal,
      headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env.GROQ_MODEL,
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens ?? 1024,
        ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.prompt },
        ],
      }),
    }),
  );

  if (!res.ok) throw new Error(`groq ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('groq returned an empty completion');
  return { text, provider: 'groq', model: env.GROQ_MODEL };
}

async function callGemini(opts: CompleteOptions): Promise<CompletionResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
  const res = await withTimeout(opts.timeoutMs ?? 30_000, (signal) =>
    fetch(url, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.system }] },
        contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
        generationConfig: {
          temperature: opts.temperature ?? 0.2,
          maxOutputTokens: opts.maxTokens ?? 1024,
          ...(opts.json ? { responseMimeType: 'application/json' } : {}),
        },
      }),
    }),
  );

  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim();
  if (!text) throw new Error('gemini returned an empty completion');
  return { text, provider: 'gemini', model: env.GEMINI_MODEL };
}

export async function complete(opts: CompleteOptions): Promise<CompletionResult> {
  if (!features.ai) throw new AiUnavailableError();

  if (features.groq) {
    try {
      return await callGroq(opts);
    } catch (error: unknown) {
      logger.warn('groq failed, falling back to gemini', error instanceof Error ? error.message : error);
      if (!features.gemini) throw error;
    }
  }
  return callGemini(opts);
}

/** Strips markdown fences some models add around JSON. */
function unfence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced?.[1] ?? text).trim();
  const start = body.search(/[[{]/);
  if (start === -1) return body;
  const end = Math.max(body.lastIndexOf('}'), body.lastIndexOf(']'));
  return end > start ? body.slice(start, end + 1) : body.slice(start);
}

/**
 * Model output is validated against a Zod schema. One retry with the parse
 * error fed back, then we give up — a malformed suggestion is dropped, never
 * guessed at.
 */
export async function completeJson<T>(schema: ZodSchema<T>, opts: CompleteOptions): Promise<{ data: T } & Omit<CompletionResult, 'text'>> {
  let last: unknown;
  let prompt = opts.prompt;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await complete({ ...opts, prompt, json: true });
    const parsed = schema.safeParse(safeJson(unfence(result.text)));
    if (parsed.success) return { data: parsed.data, provider: result.provider, model: result.model };
    last = parsed.error;
    prompt = `${opts.prompt}\n\nYour previous answer did not match the schema. Errors:\n${parsed.error.issues
      .map((i) => `- ${i.path.join('.')}: ${i.message}`)
      .join('\n')}\nReturn valid JSON only.`;
  }
  throw new Error(`AI returned invalid JSON: ${String(last)}`);
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const EMBED_DIMS = 768;

/** Gemini batch embeddings. Returns [] when embeddings are not configured. */
export async function embed(texts: string[]): Promise<number[][]> {
  if (!features.embeddings || texts.length === 0) return [];
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_EMBED_MODEL}:batchEmbedContents?key=${env.GEMINI_API_KEY}`;

  const out: number[][] = [];
  // The batch endpoint caps at 100 requests per call.
  for (let i = 0; i < texts.length; i += 100) {
    const slice = texts.slice(i, i + 100);
    const res = await withTimeout(30_000, (signal) =>
      fetch(url, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: slice.map((text) => ({
            model: `models/${env.GEMINI_EMBED_MODEL}`,
            content: { parts: [{ text: text.slice(0, 8000) }] },
          })),
        }),
      }),
    );
    if (!res.ok) {
      logger.warn(`embedding batch failed ${res.status}`, (await res.text()).slice(0, 200));
      return out;
    }
    const data = (await res.json()) as { embeddings?: { values: number[] }[] };
    out.push(...(data.embeddings ?? []).map((e) => e.values));
  }
  return out;
}

export const aiStatus = () => ({
  enabled: features.ai,
  frontier: features.groq ? env.GROQ_MODEL : null,
  fallback: features.gemini ? env.GEMINI_MODEL : null,
  embeddings: features.embeddings ? env.GEMINI_EMBED_MODEL : null,
});
