'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mascot, type MascotId } from '@/components/mascots';
import { useAuth } from '@/components/providers/auth';
import { Logo } from '@/components/marketing';
import { cx } from '@/lib/format';

/**
 * Onboarding. Three cards, one mascot each, swipeable on a phone and
 * clickable everywhere else. Seen once — the flag lets `/` and the marketing
 * CTA send repeat visitors straight on.
 */

const SEEN_KEY = 'loop-welcome-seen';

interface Slide {
  mascot: MascotId;
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    mascot: 'ava',
    title: 'Everything the team needs, carried in one place',
    body: 'Projects, sprints, docs, files and chat share a single workspace — so context stops living in five other tabs.',
  },
  {
    mascot: 'ben',
    title: 'Your board stays honest without the standup',
    body: 'Loop reads what actually happened — commits, messages, time — and keeps status current instead of a week behind.',
  },
  {
    mascot: 'cleo',
    title: 'Every AI action shows its evidence',
    body: 'Each suggestion arrives with the activity behind it. Accept it or reject it — nothing moves until you say so.',
  },
];

const SWIPE_THRESHOLD = 48;

export default function WelcomePage() {
  const router = useRouter();
  const { user, ready } = useAuth();
  const [index, setIndex] = useState(0);
  const touchStart = useRef<number | null>(null);

  // Someone already signed in has no use for the tour.
  useEffect(() => {
    if (ready && user) router.replace('/app');
  }, [ready, user, router]);

  const finish = useCallback(
    (href: string) => {
      try {
        localStorage.setItem(SEEN_KEY, '1');
      } catch {
        /* private mode — the tour just shows again */
      }
      router.push(href);
    },
    [router],
  );

  const slide = SLIDES[index];
  const last = index === SLIDES.length - 1;

  const go = useCallback((next: number) => {
    setIndex(Math.min(SLIDES.length - 1, Math.max(0, next)));
  }, []);

  // Arrow keys for anyone on a keyboard; the swipe below covers touch.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') go(index + 1);
      if (event.key === 'ArrowLeft') go(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, go]);

  return (
    <div
      className="flex min-h-dvh flex-col bg-[var(--bg)]"
      style={{
        paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))',
      }}
      onTouchStart={(event) => {
        touchStart.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        const start = touchStart.current;
        touchStart.current = null;
        if (start === null) return;
        const delta = (event.changedTouches[0]?.clientX ?? start) - start;
        if (Math.abs(delta) < SWIPE_THRESHOLD) return;
        go(delta < 0 ? index + 1 : index - 1);
      }}
    >
      <header className="flex items-center justify-between px-4">
        <Link href="/" aria-label="Loop home">
          <Logo size="md" />
        </Link>
        <button type="button" onClick={() => finish('/login')} className="btn btn-ghost btn-sm">
          Skip
        </button>
      </header>

      <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col px-6">
        {/* The illustration gets the room it needs but never pushes the CTA
            off a short phone — it shrinks before the copy does. */}
        <div className="flex min-h-0 flex-1 items-center justify-center py-4">
          <div
            key={slide.mascot}
            className="slide-up flex aspect-square w-full max-w-[19rem] items-center justify-center rounded-[2rem] bg-[var(--bg-subtle)] p-6"
            style={{ ['--mascot-paper' as string]: 'var(--bg-subtle)' }}
          >
            <Mascot id={slide.mascot} size="100%" className="h-full w-full text-[var(--text)]" />
          </div>
        </div>

        <div key={`copy-${index}`} className="fade-in">
          <h1 className="text-[27px] font-bold leading-[1.13]">{slide.title}</h1>
          <p className="mt-3 text-[14.5px] leading-relaxed text-[var(--text-muted)]">{slide.body}</p>
        </div>

        <div className="mt-6 flex items-center gap-2" role="tablist" aria-label="Onboarding progress">
          {SLIDES.map((item, position) => (
            <button
              key={item.mascot}
              type="button"
              role="tab"
              aria-selected={position === index}
              aria-label={`Step ${position + 1} of ${SLIDES.length}`}
              onClick={() => go(position)}
              className="py-2"
            >
              <span
                className={cx(
                  'block h-1.5 rounded-full transition-all duration-300',
                  position === index ? 'w-7 bg-[var(--text)]' : 'w-1.5 bg-[var(--border-strong)]',
                )}
              />
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          <button
            type="button"
            className="btn btn-primary btn-hero"
            onClick={() => (last ? finish('/register') : go(index + 1))}
          >
            {last ? 'Get started' : 'Next'}
          </button>
          {last && (
            <button type="button" className="btn btn-ghost btn-hero" onClick={() => finish('/login')}>
              I already have an account
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
