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

async function callGroq(messages: ChatMessage[], key: string): Promise<string> {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages,
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) throw new Error(`Groq replied ${response.status}`);

  const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  return payload.choices?.[0]?.message?.content ?? '';
}

async function callGemini(messages: ChatMessage[], key: string): Promise<string> {
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
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

  if (!response.ok) throw new Error(`Gemini replied ${response.status}`);

  const payload = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
}

export async function chat(messages: ChatMessage[]): Promise<string> {
  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (groqKey) {
    try {
      return await callGroq(messages, groqKey);
    } catch (error) {
      // Fall through to Gemini rather than failing the request outright.
      console.error('[ai] groq failed', error);
      if (!geminiKey) throw error;
    }
  }

  if (geminiKey) return callGemini(messages, geminiKey);
  throw new Error('No AI provider is configured');
}
