import type { Metadata } from 'next';
import Link from 'next/link';
import spec from '@/lib/openapi.json';
import { Logo } from '@/components/marketing';

export const metadata: Metadata = {
  title: 'API reference',
  description: 'Every endpoint in the Loop API, generated from the route tree.',
  alternates: { canonical: '/docs/api' },
};

/*
  API reference.

  Rendered here rather than by pulling Swagger UI off a CDN: that is ~1.2 MB of
  JavaScript and a third-party origin, to display a document this page already
  has in memory at build time. This is a server component — the whole reference
  is HTML, searchable by the browser's own find, and ships no client bundle.
*/

const METHOD_TONE: Record<string, string> = {
  get: 'bg-[var(--info-soft)] text-[var(--info)]',
  post: 'bg-[var(--success-soft)] text-[var(--success)]',
  patch: 'bg-[var(--warning-soft)] text-[var(--warning)]',
  put: 'bg-[var(--warning-soft)] text-[var(--warning)]',
  delete: 'bg-[var(--danger-soft)] text-[var(--danger)]',
};

interface Operation {
  tags?: string[];
  summary?: string;
  description?: string;
  security?: unknown[];
  parameters?: { name: string; in: string; required?: boolean; description?: string }[];
}

type Paths = Record<string, Record<string, Operation>>;

export default function ApiDocsPage() {
  const paths = spec.paths as unknown as Paths;

  // Grouped by the first path segment, which the generator also uses as the tag.
  const groups = new Map<string, { path: string; method: string; operation: Operation }[]>();
  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      const tag = operation.tags?.[0] ?? 'other';
      groups.set(tag, [...(groups.get(tag) ?? []), { path, method, operation }]);
    }
  }
  const sorted = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  const operationCount = [...groups.values()].reduce((sum, rows) => sum + rows.length, 0);

  return (
    <div className="min-h-dvh bg-[var(--bg-subtle)]">
      <header className="sticky top-0 z-40 border-b bg-[var(--bg)]/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" aria-label="Loop">
            <Logo size="sm" />
          </Link>
          <span className="text-[13px] font-semibold">API reference</span>
          <a href="/api/openapi.json" className="btn btn-secondary btn-sm ml-auto">
            openapi.json
          </a>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <h1 className="text-[26px] font-bold sm:text-4xl">Loop API</h1>
        <p className="mt-3 max-w-2xl whitespace-pre-line text-[14px] leading-relaxed text-[var(--text-muted)]">
          {spec.info.description}
        </p>
        <p className="mt-4 text-xs text-[var(--text-faint)]">
          {Object.keys(paths).length} paths · {operationCount} operations · OpenAPI {spec.openapi}
        </p>

        {/* Index */}
        <nav className="mt-6 flex flex-wrap gap-1.5" aria-label="Resources">
          {sorted.map(([tag, rows]) => (
            <a key={tag} href={`#${tag}`} className="chip text-xs">
              {tag} <span className="opacity-55">{rows.length}</span>
            </a>
          ))}
        </nav>

        {sorted.map(([tag, rows]) => (
          <section key={tag} id={tag} className="mt-10 scroll-mt-20">
            <h2 className="text-lg font-bold capitalize">{tag}</h2>
            <div className="mt-3 space-y-2">
              {rows
                .sort((a, b) => a.path.localeCompare(b.path))
                .map(({ path, method, operation }) => (
                  <details key={`${method}-${path}`} className="card overflow-hidden p-0">
                    <summary className="flex cursor-pointer flex-wrap items-center gap-2.5 px-3.5 py-3">
                      <span className={`badge shrink-0 font-mono uppercase ${METHOD_TONE[method] ?? ''}`}>{method}</span>
                      <code className="min-w-0 truncate font-mono text-[12px]">{path}</code>
                      {operation.security?.length === 0 && (
                        <span className="badge bg-[var(--bg-inset)] text-[var(--text-muted)]">public</span>
                      )}
                      <span className="ml-auto hidden max-w-[46%] truncate text-[11px] text-[var(--text-muted)] sm:block">
                        {operation.summary}
                      </span>
                    </summary>

                    <div className="border-t px-3.5 py-3">
                      <p className="text-[13px] font-medium">{operation.summary}</p>
                      {operation.description && (
                        <p className="mt-2 whitespace-pre-line text-[12.5px] leading-relaxed text-[var(--text-muted)]">
                          {operation.description}
                        </p>
                      )}

                      {(operation.parameters?.length ?? 0) > 0 && (
                        <div className="mt-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">Parameters</p>
                          <ul className="mt-1.5 space-y-1">
                            {operation.parameters!.map((parameter) => (
                              <li key={`${parameter.in}-${parameter.name}`} className="text-[12px]">
                                <code className="font-mono text-[11px] text-[var(--text)]">{parameter.name}</code>
                                <span className="ml-1.5 text-[var(--text-faint)]">
                                  in {parameter.in}
                                  {parameter.required ? ' · required' : ''}
                                </span>
                                {parameter.description && (
                                  <span className="ml-1.5 text-[var(--text-muted)]">— {parameter.description}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </details>
                ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
