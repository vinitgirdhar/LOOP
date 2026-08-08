import Link from 'next/link';
import type { Metadata } from 'next';
import { MarketingFooter, MarketingNav } from '@/components/marketing';
import { POSTS } from '@/lib/blog';
import { formatDate } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Notes on keeping a project board honest: explainable scoring, evidence-backed automation and permission-aware retrieval.',
  alternates: { canonical: '/blog' },
};

export default function BlogIndex() {
  return (
    <div className="min-h-dvh">
      <MarketingNav />
      <main id="main" className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="text-2xl font-bold tracking-[-0.02em] sm:text-3xl">Blog</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">How Loop is built, and why the AI parts are deliberately boring.</p>

        <div className="mt-8 space-y-3">
          {POSTS.map((post) => (
            <Link key={post.slug} href={`/blog/${post.slug}`} className="card block p-5 transition-colors hover:border-[var(--border-strong)]">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-faint)]">
                <span className="badge bg-[var(--accent-soft)] text-[var(--accent)]">{post.tag}</span>
                <span>{formatDate(post.date)}</span>
                <span>·</span>
                <span>{post.readingMinutes} min read</span>
              </div>
              <h2 className="mt-2 text-base font-semibold tracking-[-0.01em]">{post.title}</h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-muted)]">{post.excerpt}</p>
              <p className="mt-3 text-xs font-medium text-[var(--accent)]">Read more →</p>
            </Link>
          ))}
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
