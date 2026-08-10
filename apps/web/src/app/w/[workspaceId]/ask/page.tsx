'use client';

import { use, useRef, useState } from 'react';
import Link from 'next/link';
import { ROLE_LABELS } from '@loop/shared';
import { useQuery } from '@/lib/hooks';
import { Page, PageHeader } from '@/components/page';
import { Badge, Button, Card, Spinner } from '@/components/ui';
import { Icon } from '@/components/icons';
import { useAuth } from '@/components/providers/auth';
import { api, apiErrorMessage } from '@/lib/api';
import { relativeTime } from '@/lib/format';

interface Citation {
  index: number;
  title: string;
  url: string | null;
  sourceType: string;
  sourceId: string;
}

interface Answer {
  answer: string;
  citations: Citation[];
  retrieved: number;
  model: string | null;
  restricted: boolean;
}

interface Turn {
  question: string;
  answer: Answer | null;
  error?: string;
}

const SUGGESTIONS = [
  'What is blocking the sprint?',
  'Who wrote the auth spec?',
  'What changed on the payments project this week?',
  'Which tasks are overdue and why?',
];

export default function AskPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = use(params);
  const { role } = useAuth();
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const { data: status } = useQuery<{ enabled: boolean; frontier: string | null; fallback: string | null; embeddings: string | null }>('/api/ai/status', []);
  const { data: history } = useQuery<{ id: string; question: string; createdAt: string }[]>('/api/ai/ask/history', [workspaceId]);

  const ask = async (text: string) => {
    if (text.trim().length < 4 || loading) return;
    setQuestion('');
    setTurns((current) => [...current, { question: text, answer: null }]);
    setLoading(true);
    try {
      const { data } = await api.post<Answer>('/api/ai/ask', { question: text.trim() });
      setTurns((current) => current.map((turn, index) => (index === current.length - 1 ? { ...turn, answer: data } : turn)));
    } catch (caught: unknown) {
      const message = apiErrorMessage(caught);
      setTurns((current) => current.map((turn, index) => (index === current.length - 1 ? { ...turn, error: message } : turn)));
    } finally {
      setLoading(false);
      requestAnimationFrame(() => bottom.current?.scrollIntoView({ behavior: 'smooth' }));
    }
  };

  return (
    <Page className="max-w-4xl">
      <PageHeader
        title="Ask the workspace"
        subtitle="Answers come from your tasks, docs, chat and commits — with the sources attached."
        meta={
          <>
            <Badge tone="neutral">You are asking as {role ? ROLE_LABELS[role] : 'a member'}</Badge>
            {status?.frontier && <Badge tone="accent">frontier {status.frontier}</Badge>}
            {status?.fallback && <Badge tone="info">fallback {status.fallback}</Badge>}
          </>
        }
      />

      <Card className="mb-4 border-[var(--accent)]/30 bg-[var(--accent-soft)]/40">
        <div className="flex items-start gap-2.5">
          <Icon.shield width={17} height={17} className="mt-0.5 shrink-0 text-[var(--accent)]" />
          <p className="text-[13px] leading-relaxed">
            Retrieval is filtered by your role <em>before</em> the search runs, not after. A client account can only reach shared documents and task progress, so
            internal chat can never enter the answer — sign in as <span className="font-mono">client@loop.dev</span> and ask the same question to see the
            difference.
          </p>
        </div>
      </Card>

      {turns.length === 0 && (
        <div className="mb-4 grid gap-2 sm:grid-cols-2">
          {SUGGESTIONS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => void ask(prompt)}
              className="card p-3 text-left text-[13px] transition-colors hover:border-[var(--accent)]"
            >
              <Icon.sparkles width={14} height={14} className="mb-1.5 text-[var(--accent)]" />
              <span className="block">{prompt}</span>
            </button>
          ))}
        </div>
      )}

      <div className="space-y-4">
        {turns.map((turn, index) => (
          <div key={index} className="space-y-2">
            <div className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-[var(--accent)] px-3.5 py-2 text-[13px] text-[var(--accent-text)]">{turn.question}</p>
            </div>

            {turn.error ? (
              <p className="rounded-xl bg-[var(--danger-soft)] px-3.5 py-2 text-[13px] text-[var(--danger)]">{turn.error}</p>
            ) : !turn.answer ? (
              <div className="flex items-center gap-2 text-[13px] text-[var(--text-muted)]">
                <Spinner size={14} /> Searching what you are allowed to see…
              </div>
            ) : (
              <Card>
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{turn.answer.answer}</p>

                {turn.answer.citations.length > 0 && (
                  <div className="mt-3 border-t pt-3">
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
                      Sources ({turn.answer.retrieved} retrieved)
                    </p>
                    <ul className="space-y-1">
                      {turn.answer.citations.map((citation) => (
                        <li key={citation.index}>
                          {citation.url ? (
                            <Link href={citation.url} className="flex items-start gap-2 rounded-lg px-1.5 py-1 text-[12px] hover:bg-[var(--bg-inset)]">
                              <span className="mt-px shrink-0 font-mono text-[10px] text-[var(--accent)]">[{citation.index}]</span>
                              <span className="min-w-0 flex-1 truncate">{citation.title}</span>
                              <span className="shrink-0 text-[10px] text-[var(--text-faint)]">{citation.sourceType}</span>
                            </Link>
                          ) : (
                            <span className="flex items-start gap-2 px-1.5 py-1 text-[12px]">
                              <span className="mt-px shrink-0 font-mono text-[10px] text-[var(--accent)]">[{citation.index}]</span>
                              <span className="min-w-0 flex-1 truncate">{citation.title}</span>
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <p className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-[var(--text-faint)]">
                  {turn.answer.model ? `answered by ${turn.answer.model}` : 'keyword search — no model configured'}
                  {turn.answer.restricted && <Badge tone="warning">client-restricted retrieval</Badge>}
                </p>
              </Card>
            )}
          </div>
        ))}
        <div ref={bottom} />
      </div>

      <form
        className="sticky bottom-20 mt-4 flex gap-2 lg:bottom-4"
        onSubmit={(event) => {
          event.preventDefault();
          void ask(question);
        }}
      >
        <input
          className="input shadow-[var(--shadow)]"
          placeholder="Ask anything about this workspace…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={loading}
        />
        <Button type="submit" variant="primary" loading={loading} disabled={question.trim().length < 4}>
          Ask
        </Button>
      </form>

      {history && history.length > 0 && turns.length === 0 && (
        <Card className="mt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">Your recent questions</p>
          <ul className="space-y-1">
            {history.slice(0, 6).map((entry) => (
              <li key={entry.id}>
                <button type="button" onClick={() => void ask(entry.question)} className="w-full truncate rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-[var(--bg-inset)]">
                  {entry.question}
                  <span className="ml-2 text-[10px] text-[var(--text-faint)]">{relativeTime(entry.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Page>
  );
}
