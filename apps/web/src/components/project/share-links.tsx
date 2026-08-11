'use client';

import { useState } from 'react';
import { useQuery } from '@/lib/hooks';
import { api, apiErrorMessage } from '@/lib/api';
import { useToast } from '@/components/providers/toast';
import { Button, Card, Confirm, CopyButton, Field, SectionTitle } from '@/components/ui';
import { Icon } from '@/components/icons';
import { cx, formatShortDate } from '@/lib/format';

const SCOPES = [
  { key: 'progress', label: 'Progress', hint: 'Percent complete, task counts, target date' },
  { key: 'tasks', label: 'Task list', hint: 'Titles, status and due dates — no comments' },
  { key: 'milestones', label: 'Milestones', hint: 'Names and target dates' },
  { key: 'docs', label: 'Shared docs', hint: 'Only wiki pages already marked shared' },
] as const;

interface ShareLink {
  id: string;
  label: string | null;
  scopes: string[];
  tokenHint: string;
  expiresAt: string | null;
  revokedAt: string | null;
  viewCount: number;
  lastSeenAt: string | null;
  createdAt: string;
  createdBy: { id: string; name: string } | null;
}

export function ShareLinks({ projectId }: { projectId: string }) {
  const toast = useToast();
  const { data, loading, refetch } = useQuery<ShareLink[]>(`/api/projects/${projectId}/share`, [projectId]);

  const [label, setLabel] = useState('');
  const [scopes, setScopes] = useState<string[]>(['progress']);
  const [expiry, setExpiry] = useState('30');
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<ShareLink | null>(null);
  /**
   * The one and only time this token is visible.
   *
   * Only its hash is stored, so if the reader navigates away without copying
   * it, it is genuinely gone and they mint another. The UI has to be blunt
   * about that rather than implying it can be looked up later.
   */
  const [freshToken, setFreshToken] = useState<string | null>(null);

  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const links = data ?? [];

  const create = async () => {
    setCreating(true);
    try {
      const { data: created } = await api.post<{ token: string }>(`/api/projects/${projectId}/share`, {
        ...(label.trim() ? { label: label.trim() } : {}),
        scopes,
        expiresInDays: expiry === 'never' ? null : Number(expiry),
      });
      setFreshToken(created.token);
      setLabel('');
      void refetch();
    } catch (caught: unknown) {
      toast.error(apiErrorMessage(caught));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card>
      <SectionTitle
        title="Public link"
        subtitle="Give a client or a stakeholder read-only access to this project without an account."
      />

      {freshToken && (
        <div className="mt-4 rounded-[var(--radius)] border border-[var(--success)] bg-[var(--success-soft)] p-3.5">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--success)]">
            <Icon.check width={14} height={14} /> Link created — copy it now
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            This is the only time the full link is shown. It is stored hashed, so it cannot be recovered later.
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <code className="scroll-thin min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-lg bg-[var(--bg)] px-2.5 py-2 font-mono text-[11px]">
              {origin}/p/{freshToken}
            </code>
            <CopyButton value={`${origin}/p/${freshToken}`} />
          </div>
          <button type="button" className="mt-2 text-xs underline opacity-70" onClick={() => setFreshToken(null)}>
            I have copied it
          </button>
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Label" hint="So you can tell your links apart later.">
          <input className="input" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Acme Corp — weekly update" />
        </Field>
        <Field label="Expires">
          <select className="select" value={expiry} onChange={(event) => setExpiry(event.target.value)}>
            <option value="7">In 7 days</option>
            <option value="30">In 30 days</option>
            <option value="90">In 90 days</option>
            <option value="never">Never</option>
          </select>
        </Field>
      </div>

      <fieldset className="mt-3">
        <legend className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">What the link shows</legend>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {SCOPES.map((scope) => {
            const on = scopes.includes(scope.key);
            return (
              <label
                key={scope.key}
                className={cx(
                  'flex cursor-pointer items-start gap-2.5 rounded-[var(--radius)] border p-2.5 transition-colors',
                  on ? 'border-[var(--text)] bg-[var(--bg-inset)]' : 'hover:border-[var(--border-strong)]',
                )}
              >
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={on}
                  onChange={(event) =>
                    setScopes((current) =>
                      event.target.checked ? [...current, scope.key] : current.filter((key) => key !== scope.key),
                    )
                  }
                />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium">{scope.label}</span>
                  <span className="block text-[11px] leading-snug text-[var(--text-muted)]">{scope.hint}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <Button variant="primary" className="mt-3" loading={creating} disabled={scopes.length === 0} onClick={create}>
        Create link
      </Button>

      <div className="mt-6">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
          Existing links {links.length > 0 && `· ${links.length}`}
        </p>

        {loading && links.length === 0 ? (
          <p className="mt-2 text-xs text-[var(--text-muted)]">Loading…</p>
        ) : links.length === 0 ? (
          <p className="mt-2 text-xs text-[var(--text-muted)]">No links yet. Nothing about this project is public.</p>
        ) : (
          <ul className="mt-2 divide-y overflow-hidden rounded-[var(--radius)] border">
            {links.map((link) => {
              const expired = link.expiresAt !== null && new Date(link.expiresAt).getTime() < Date.now();
              const dead = Boolean(link.revokedAt) || expired;
              return (
                <li key={link.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">
                      {link.label ?? 'Untitled link'}{' '}
                      <span className="font-mono text-[10px] text-[var(--text-faint)]">{link.tokenHint}…</span>
                    </span>
                    <span className="block text-[11px] text-[var(--text-muted)]">
                      {link.scopes.join(' · ')} · {link.viewCount} view{link.viewCount === 1 ? '' : 's'}
                      {link.expiresAt && ` · expires ${formatShortDate(link.expiresAt)}`}
                    </span>
                  </span>

                  {dead ? (
                    <span className="badge bg-[var(--bg-inset)] text-[var(--text-muted)]">
                      {link.revokedAt ? 'Revoked' : 'Expired'}
                    </span>
                  ) : (
                    <Button size="sm" variant="danger" onClick={() => setRevoking(link)}>
                      Revoke
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Confirm
        open={revoking !== null}
        title="Revoke this link"
        message="Anyone holding it loses access immediately. The link cannot be reactivated — mint a new one instead."
        confirmLabel="Revoke"
        onCancel={() => setRevoking(null)}
        onConfirm={async () => {
          if (!revoking) return;
          try {
            await api.del(`/api/projects/${projectId}/share/${revoking.id}`);
            toast.success('Link revoked');
            void refetch();
          } catch (caught: unknown) {
            toast.error(apiErrorMessage(caught));
          } finally {
            setRevoking(null);
          }
        }}
      />
    </Card>
  );
}
