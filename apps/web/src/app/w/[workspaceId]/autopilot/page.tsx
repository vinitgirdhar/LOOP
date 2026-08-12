'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@/lib/hooks';
import { Page, PageHeader } from '@/components/page';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Modal, Skeleton, Tabs } from '@/components/ui';
import { Icon } from '@/components/icons';
import { useAuth } from '@/components/providers/auth';
import { useToast } from '@/components/providers/toast';
import { useSocketEvent } from '@/components/providers/socket';
import { api, apiErrorMessage } from '@/lib/api';
import { relativeTime } from '@/lib/format';

interface Evidence {
  type: string;
  label: string;
  url: string | null;
  quote?: string;
}

interface Suggestion {
  id: string;
  kind: string;
  title: string;
  rationale: string;
  evidence: Evidence[];
  confidence: number;
  proposedChange: Record<string, unknown>;
  status: string;
  source: string;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: { id: string; name: string } | null;
  task: { id: string; number: number; title: string; status: string; isBlocked: boolean; project: { key: string; name: string } } | null;
  project: { id: string; key: string; name: string; autoApply: boolean } | null;
}

const KIND_LABEL: Record<string, string> = {
  MOVE_STATUS: 'Move status',
  FLAG_BLOCKED: 'Flag blocked',
  ASSIGN: 'Assign',
  LINK_COMMIT: 'Link commit',
  SPRINT_PLAN: 'Sprint plan',
  ESTIMATE: 'Estimate',
};

const TABS = [
  { key: 'PENDING', label: 'Inbox' },
  { key: 'ACCEPTED', label: 'Accepted' },
  { key: 'AUTO_APPLIED', label: 'Auto-applied' },
  { key: 'REJECTED', label: 'Rejected' },
];

export default function AutoPilotPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = use(params);
  const { can } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState('PENDING');
  const [busy, setBusy] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);

  const { data, loading, error, refetch } = useQuery<{ items: Suggestion[]; pending: number }>(`/api/ai/suggestions?status=${status}`, [status, workspaceId]);

  useSocketEvent('suggestion:new', () => void refetch());

  const decide = async (id: string, decision: 'accept' | 'reject') => {
    setBusy(id);
    try {
      await api.post(`/api/ai/suggestions/${id}/${decision}`);
      toast.success(decision === 'accept' ? 'Applied and written to the audit log' : 'Suggestion dismissed');
      void refetch();
    } catch (caught: unknown) {
      toast.error(apiErrorMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Page>
      <PageHeader
        title="Auto-Pilot"
        subtitle="Proposals from commits, pull requests and chat. Nothing moves until a human accepts it."
        actions={
          <Button size="sm" onClick={() => setSimulating(true)} icon={<Icon.github width={14} height={14} />}>
            Simulate a GitHub event
          </Button>
        }
      />

      <Card className="mb-4 border-[var(--accent)]/30 bg-[var(--accent-soft)]/40">
        <div className="flex items-start gap-2.5">
          <Icon.bolt width={17} height={17} className="mt-0.5 shrink-0 text-[var(--accent)]" />
          <p className="text-[13px] leading-relaxed">
            Rules run first and are deterministic — a pull request naming <span className="font-mono">PAY-12</span> is matched by a regular expression, not a model.
            The model is only asked to resolve genuinely ambiguous chat, and those proposals are capped below the auto-apply threshold on purpose.
            Every accept writes the change <em>and</em> an audit entry.
          </p>
        </div>
      </Card>

      <Tabs tabs={TABS.map((tab) => ({ ...tab, count: tab.key === 'PENDING' ? data?.pending : undefined }))} active={status} onChange={setStatus} />

      <div className="mt-4 space-y-3">
        {error && <ErrorState message={error} onRetry={refetch} />}
        {loading && !data ? (
          <>
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </>
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            title={status === 'PENDING' ? 'Inbox is clear' : 'Nothing here'}
            description={
              status === 'PENDING'
                ? 'When someone opens a pull request on a branch named after a task, or says they are stuck in chat, a proposal will appear here.'
                : undefined
            }
            icon={<Icon.bolt width={26} height={26} />}
          />
        ) : (
          data.items.map((suggestion) => (
            <Card key={suggestion.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone="accent">{KIND_LABEL[suggestion.kind] ?? suggestion.kind}</Badge>
                    <Badge tone={suggestion.source === 'rules' ? 'neutral' : 'info'}>{suggestion.source === 'rules' ? 'rule' : 'AI matched'}</Badge>
                    {suggestion.project && <span className="text-[11px] text-[var(--text-muted)]">{suggestion.project.name}</span>}
                  </div>
                  <h2 className="mt-1.5 text-sm font-semibold">{suggestion.title}</h2>
                  <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-muted)]">{suggestion.rationale}</p>
                </div>
                <ConfidenceBadge value={suggestion.confidence} />
              </div>

              <div className="mt-3 space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">Evidence</p>
                {suggestion.evidence.map((item, index) => (
                  <div key={index} className="rounded-lg border-l-2 border-[var(--accent)] bg-[var(--bg-inset)] px-3 py-2">
                    <p className="text-[11px] font-medium text-[var(--text-muted)]">
                      {item.type.replace('_', ' ')} · {item.label}
                    </p>
                    {item.quote && <p className="mt-1 text-[13px] italic leading-relaxed">“{item.quote}”</p>}
                    {item.url && (
                      <a href={item.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--accent)] hover:underline">
                        <Icon.link width={11} height={11} /> Open source
                      </a>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-[var(--bg-subtle)] px-3 py-2 text-[12px]">
                <span className="font-semibold">Proposed change</span>
                {Object.entries(suggestion.proposedChange).map(([key, value]) => (
                  <span key={key} className="font-mono text-[11px] text-[var(--text-muted)]">
                    {key} → {String(value)}
                  </span>
                ))}
                {suggestion.task && (
                  <Link href={`/w/${workspaceId}/tasks/${suggestion.task.id}`} className="ml-auto text-[11px] font-medium text-[var(--accent)] hover:underline">
                    {suggestion.task.project.key}-{suggestion.task.number} ↗
                  </Link>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
                <span className="text-[11px] text-[var(--text-faint)]">
                  {relativeTime(suggestion.createdAt)}
                  {suggestion.decidedBy && ` · decided by ${suggestion.decidedBy.name}`}
                </span>
                {suggestion.status === 'PENDING' && can('ai.suggestion.decide') && (
                  <div className="ml-auto flex gap-2">
                    <Button size="sm" onClick={() => void decide(suggestion.id, 'reject')} disabled={busy === suggestion.id}>
                      Reject
                    </Button>
                    <Button size="sm" variant="primary" loading={busy === suggestion.id} onClick={() => void decide(suggestion.id, 'accept')}>
                      Accept
                    </Button>
                  </div>
                )}
                {suggestion.status !== 'PENDING' && (
                  <Badge className="ml-auto" tone={suggestion.status === 'REJECTED' ? 'danger' : 'success'}>
                    {suggestion.status.replace('_', ' ').toLowerCase()}
                  </Badge>
                )}
              </div>
            </Card>
          ))
        )}
      </div>

      <SimulateModal open={simulating} onClose={() => setSimulating(false)} onDone={() => { setSimulating(false); void refetch(); }} />
    </Page>
  );
}

function ConfidenceBadge({ value }: { value: number }) {
  const percent = Math.round(value * 100);
  const tone = percent >= 90 ? 'var(--success)' : percent >= 70 ? 'var(--warning)' : 'var(--text-muted)';
  return (
    <span className="shrink-0 text-right">
      <span className="block text-lg font-bold tabular-nums leading-none" style={{ color: tone }}>
        {percent}%
      </span>
      <span className="block text-[10px] text-[var(--text-faint)]">confidence</span>
    </span>
  );
}

/** Lets the demo produce a real suggestion without a public webhook tunnel. */
function SimulateModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [kind, setKind] = useState('pull_request_opened');
  const [reference, setReference] = useState('feat/PAY-4-refund-flow');
  const [repo, setRepo] = useState('northwind/payments');
  const [loading, setLoading] = useState(false);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Simulate a GitHub event"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={loading}
            onClick={async () => {
              setLoading(true);
              try {
                const { data } = await api.post<{ suggestions: number; matched: string[]; skipped: string[] }>(
                  '/api/webhooks/github/simulate',
                  { repo, kind, reference },
                );
                // Say why nothing happened. "No suggestions" with no reason is
                // indistinguishable from the feature being broken.
                if (data.suggestions > 0) {
                  toast.success(`${data.suggestions} suggestion${data.suggestions === 1 ? '' : 's'} created for ${data.matched.join(', ')}`);
                } else {
                  toast.info(data.skipped[0] ? `No suggestion created — ${data.skipped[0]}` : 'No task key matched that reference');
                }
                onDone();
              } catch (caught: unknown) {
                toast.error(apiErrorMessage(caught));
              } finally {
                setLoading(false);
              }
            }}
          >
            Send event
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[13px] text-[var(--text-muted)]">
          In production this arrives from a signed GitHub webhook. The same rules engine runs either way — the reference must contain a task key such as{' '}
          <span className="font-mono">PAY-4</span>.
        </p>
        <Field label="Event">
          <select className="select" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="branch_created">Branch created → In Progress</option>
            <option value="push">Push → In Progress</option>
            <option value="pull_request_opened">Pull request opened → Code Review</option>
            <option value="pull_request_merged">Pull request merged → Testing</option>
          </select>
        </Field>
        <Field label="Repository">
          <input className="input font-mono text-[13px]" value={repo} onChange={(e) => setRepo(e.target.value)} />
        </Field>
        <Field label="Branch or title" hint="Must contain a task key, for example PAY-4.">
          <input className="input font-mono text-[13px]" value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

