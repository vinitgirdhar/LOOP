'use client';

import { useLayoutEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import gsap from 'gsap';
import { useT } from '@/components/providers/locale';

/*
  Hero.

  Stacked on a phone — copy first, then the graph in its own square — and two
  columns from `lg` up. The 3D never sits behind the text: ink nodes under ink
  type is unreadable, and a canvas that has to stay faint is not worth the
  battery.
*/

const NetworkScene = dynamic(() => import('@/components/three/network'), {
  ssr: false,
  loading: () => <SceneSkeleton />,
});

function SceneSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <span className="h-24 w-24 animate-pulse rounded-full bg-[var(--bg-inset)]" />
    </div>
  );
}

export function Hero() {
  const t = useT();
  const root = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const context = gsap.context(() => {
      const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } });
      timeline
        .from('[data-hero-badge]', { opacity: 0, y: 12, duration: 0.5 })
        .from('[data-hero-line]', { opacity: 0, yPercent: 108, duration: 0.85, stagger: 0.1 }, '-=0.25')
        .from('[data-hero-copy]', { opacity: 0, y: 16, duration: 0.6 }, '-=0.45')
        .from('[data-hero-cta]', { opacity: 0, y: 14, duration: 0.5 }, '-=0.35')
        .from('[data-hero-note]', { opacity: 0, duration: 0.4 }, '-=0.2')
        .from('[data-hero-scene]', { opacity: 0, scale: 0.95, duration: 0.9 }, '-=0.6');
    }, root);

    return () => context.revert();
  }, []);

  return (
    <section ref={root} className="relative overflow-hidden border-b">
      <div className="mx-auto grid max-w-6xl 2xl:max-w-7xl 3xl:max-w-[88rem] items-center gap-5 px-4 pb-8 pt-6 sm:gap-6 sm:px-6 sm:pb-16 sm:pt-12 lg:grid-cols-[1.05fr_1fr] lg:gap-8 2xl:gap-14 lg:pb-24 lg:pt-20">
        <div className="lg:pr-4">
          <span data-hero-badge className="badge bg-[var(--accent-soft)] text-[var(--accent)] 2xl:text-xs">
            {t('hero.badge')}
          </span>

          {/* Each line clips its own overflow so the rise reads as type
              coming up from behind a mask rather than sliding on the page. */}
          <h1 className="mt-4 text-[29px] font-bold leading-[1.05] min-[390px]:text-[34px] sm:text-5xl lg:text-6xl 2xl:text-7xl">
            <span className="block overflow-hidden pb-[0.08em]">
              <span data-hero-line className="block">
                {t('hero.titleLine1')}
              </span>
            </span>
            <span className="block overflow-hidden pb-[0.08em]">
              <span data-hero-line className="block">
                {t('hero.titleLine2')}
              </span>
            </span>
            <span className="block overflow-hidden pb-[0.08em]">
              <span data-hero-line className="block">
                {t('hero.titleLine3')}
              </span>
            </span>
          </h1>

          <p data-hero-copy className="mt-4 max-w-xl text-[15px] leading-relaxed text-[var(--text-muted)] sm:text-base 2xl:text-lg 2xl:max-w-2xl">
{t('hero.body')}
          </p>

          <div data-hero-cta className="mt-6 flex flex-col gap-2.5 sm:flex-row">
            <Link href="/welcome" className="btn btn-primary btn-hero sm:w-auto sm:px-7 2xl:px-9 2xl:text-base">
              {t('hero.createWorkspace')}
            </Link>
            <Link href="/login" className="btn btn-secondary btn-hero sm:w-auto sm:px-7 2xl:px-9 2xl:text-base">
              {t('hero.tryDemo')}
            </Link>
          </div>

          <p data-hero-note className="mt-3 text-xs text-[var(--text-faint)] 2xl:text-sm">
            {t('hero.note')}
          </p>
        </div>

        {/* The graph. Aspect-ratio optimized on mobile so there's no huge vertical whitespace gap. */}
        <div data-hero-scene className="relative mt-2 lg:mt-0">
          <div className="relative mx-auto aspect-[5/4] w-full max-w-[26rem] sm:aspect-square lg:max-w-none lg:aspect-[4/5]">
            <NetworkScene />
          </div>
          <p className="mt-1 text-center text-[11px] leading-relaxed text-[var(--text-faint)] lg:text-left 2xl:text-xs">
            <span className="font-semibold text-[var(--text-muted)]">Live:</span> people, tools and the events moving between them — one workspace at the centre
          </p>
        </div>
      </div>
    </section>
  );
}
