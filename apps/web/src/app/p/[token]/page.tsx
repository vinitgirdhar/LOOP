import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { Logo } from '@/components/marketing';
import { PublicProgress, PublicTasks } from '@/components/public-project';

export const dynamic = 'force-dynamic';

/*
  Guest view of one project.

  A server component on purpose: the reader has no session, no workspace and no
  reason to download the application shell, its providers or its socket client.
  This page is HTML with a stylesheet, and it renders the same on a link
  preview crawler as it does in a browser.
*/

export const metadata: Metadata = {
  title: 'Shared project',
  // A guest link is not something that should turn up in a search index.
  robots: { index: false, follow: false },
};

interface PublicPayload {
  label: string | null;
  workspace: string | null;
  project: { id: string; key: string; name: string; description: string | null; status: string; startDate: string | null; deadline: string | null; color: string };
  scopes: string[];
  progress: { total: number; done: number; percent: number; overdue: number };
  tasks: { id: string; key: string; title: string; status: string; priority: string; dueDate: string | null; startDate: string | null; completedAt: string | null; assignee: string | null }[];
  milestones: { id: string; title: string; dueDate: string | null; completedAt: string | null }[];
  docs: { id: string; title: string; slug: string; content: string; updatedAt: string }[];
}

async function load(token: string): Promise<{ data: PublicPayload | null; error: string | null }> {
  // Absolute URL: a route handler cannot be fetched with a relative path from
  // a server component, and the host has to come from the request itself so
  // this works on a preview deployment as well as production.
  const host = (await headers()).get('host');
  const protocol = host?.startsWith('localhost') || host?.startsWith('127.') ? 'http' : 'https';

  const response = await fetch(`${protocol}://${host}/api/public/projects/${encodeURIComponent(token)}`, {
    cache: 'no-store',
  });
  const envelope = (await response.json()) as { success: boolean; data?: PublicPayload; error?: string };

  if (!response.ok || !envelope.success) return { data: null, error: envelope.error ?? 'This link is not valid' };
  return { data: envelope.data ?? null, error: null };
}

export default async function PublicProjectPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data, error } = await load(token);

  if (!data) {
    return (
      <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <Logo size="lg" />
        <h1 className="text-2xl font-bold">{error}</h1>
        <p className="max-w-sm text-sm text-[var(--text-muted)]">
          Guest links can be revoked or given an expiry date by the team that created them. Ask them for a new one.
        </p>
        <Link href="/" className="btn btn-secondary btn-sm">
          Go to Loop
        </Link>
      </main>
    );
  }

  const { project, progress, scopes } = data;

  return (
    <div className="min-h-dvh bg-[var(--bg-subtle)]">
      <header className="border-b bg-[var(--bg)]">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" aria-label="Loop">
            <Logo size="sm" />
          </Link>
          <span className="badge bg-[var(--bg-inset)] text-[var(--text-muted)]">Read-only</span>
          <Link href="/welcome" className="btn btn-primary btn-sm ml-auto">
            Get started
          </Link>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex items-center gap-2.5">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: project.color }} />
          <span className="font-mono text-[11px] font-semibold text-[var(--text-muted)]">{project.key}</span>
          <span className="badge bg-[var(--bg-inset)] text-[var(--text-muted)]">{project.status.replace('_', ' ').toLowerCase()}</span>
        </div>

        <h1 className="mt-2 text-[26px] font-bold leading-tight sm:text-4xl">{project.name}</h1>
        {project.description && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-[var(--text-muted)]">{project.description}</p>}
        {data.workspace && <p className="mt-3 text-xs text-[var(--text-faint)]">Shared from the {data.workspace} workspace</p>}

        <PublicProgress progress={progress} deadline={project.deadline} />

        {scopes.includes('milestones') && data.milestones.length > 0 && (
          <section className="mt-8">
            <h2 className="text-[15px] font-semibold">Milestones</h2>
            <ol className="mt-3 space-y-2">
              {data.milestones.map((milestone) => (
                <li key={milestone.id} className="card flex items-center gap-3 p-3.5">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rotate-45"
                    style={{ background: milestone.completedAt ? 'var(--success)' : 'var(--border-strong)' }}
                  />
                  <span className={milestone.completedAt ? 'text-[14px] line-through opacity-60' : 'text-[14px]'}>{milestone.title}</span>
                  {milestone.dueDate && (
                    <span className="ml-auto text-xs text-[var(--text-faint)]">
                      {new Date(milestone.dueDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

        {scopes.includes('tasks') && <PublicTasks tasks={data.tasks} />}

        {scopes.includes('docs') && data.docs.length > 0 && (
          <section className="mt-8">
            <h2 className="text-[15px] font-semibold">Shared documents</h2>
            <div className="mt-3 space-y-3">
              {data.docs.map((doc) => (
                <article key={doc.id} className="card p-4">
                  <h3 className="text-[14px] font-semibold">{doc.title}</h3>
                  {/* Plain text on purpose. Rendering author-supplied markup on
                      an unauthenticated page is how a wiki becomes an XSS
                      vector for anyone holding a link. */}
                  <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--text-muted)]">
                    {doc.content.slice(0, 1200)}
                    {doc.content.length > 1200 ? '…' : ''}
                  </p>
                </article>
              ))}
            </div>
          </section>
        )}

        <footer className="mt-10 border-t pt-5 text-xs text-[var(--text-faint)]">
          This is a read-only view. Internal discussion, files and comments are not shared through a guest link.
        </footer>
      </main>
    </div>
  );
}
