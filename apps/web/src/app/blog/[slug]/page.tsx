import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { MarketingFooter, MarketingNav } from '@/components/marketing';
import { POSTS, findPost } from '@/lib/blog';
import { formatDate } from '@/lib/format';

export function generateStaticParams() {
  return POSTS.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = findPost(slug);
  if (!post) return { title: 'Not found' };
  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: { title: post.title, description: post.excerpt, type: 'article', publishedTime: post.date },
  };
}

export default async function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = findPost(slug);
  if (!post) notFound();

  return (
    <div className="min-h-dvh">
      <MarketingNav />
      <main id="main" className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
        <Link href="/blog" className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]">
          ← All posts
        </Link>

        <article className="mt-5">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-faint)]">
            <span className="badge bg-[var(--accent-soft)] text-[var(--accent)]">{post.tag}</span>
            <span>{formatDate(post.date)}</span>
            <span>·</span>
            <span>{post.readingMinutes} min read</span>
            <span>·</span>
            <span>{post.author}</span>
          </div>

          <h1 className="mt-3 text-2xl font-bold leading-tight tracking-[-0.025em] sm:text-3xl">{post.title}</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-[var(--text-muted)]">{post.excerpt}</p>

          <div className="prose-loop mt-8">
            {post.body.map((block, index) => {
              if (block.h) return <h2 key={index}>{block.h}</h2>;
              if (block.list)
                return (
                  <ul key={index}>
                    {block.list.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                );
              if (block.quote) return <blockquote key={index}>{block.quote}</blockquote>;
              return <p key={index}>{block.p}</p>;
            })}
          </div>
        </article>

        <div className="mt-10 rounded-xl border bg-[var(--bg-subtle)] p-5 text-center">
          <p className="text-sm font-semibold">See it on a real board</p>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]">Demo accounts for every role, no card needed.</p>
          <Link href="/register" className="btn btn-primary mt-3">
            Create a workspace
          </Link>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
