'use client';

import { useLayoutEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useMediaQuery } from '@/lib/hooks';
import { cx } from '@/lib/format';

/*
  The scrollytelling beat.

  A tall track holds a `position: sticky` viewport — CSS does the pinning,
  which behaves far better on iOS Safari than a JavaScript pin does, and
  survives a resize or an address-bar collapse without a refresh. GSAP is left
  to do the one thing CSS cannot: report how far through the track we are.

  Scroll progress lands in a ref, never in state. The frame loop reads it, so
  dragging a finger down the page does not re-render a single React component.
*/

const AssemblyScene = dynamic(() => import('@/components/three/assembly'), {
  ssr: false,
  loading: () => <div className="h-full w-full" />,
});

const BEATS = [
  {
    step: '01',
    title: 'Six tools, none of them talking',
    body: 'The board lives in one place, the discussion in another, the code in a third. Every status update is somebody manually copying between them — which is why it stops happening by Wednesday.',
  },
  {
    step: '02',
    title: 'Loop reads the activity itself',
    body: 'Commits, pull requests, chat, task events and time entries all land in one workspace. A rules engine watches them and matches what happened to what the board claims.',
  },
  {
    step: '03',
    title: 'One board that stays true',
    body: 'When the two disagree Loop proposes the fix, attaches the evidence and waits. You accept or reject. The board ends up current without anybody maintaining it.',
  },
];

export function AssemblySection() {
  const track = useRef<HTMLElement>(null);
  const progress = useRef(0);
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');

  useLayoutEffect(() => {
    if (reduced) {
      // Show the finished block and let the beats simply stack down the page.
      progress.current = 1;
      return;
    }

    gsap.registerPlugin(ScrollTrigger);

    const context = gsap.context(() => {
      ScrollTrigger.create({
        trigger: track.current,
        start: 'top top',
        end: 'bottom bottom',
        // 0.4s of catch-up turns a jumpy trackpad into a smooth assembly.
        scrub: 0.4,
        onUpdate: (self) => {
          progress.current = self.progress;
        },
      });

      // Beats cross-fade against the same track, so copy and cube stay in step.
      const beats = gsap.utils.toArray<HTMLElement>('[data-beat]');
      beats.forEach((beat, index) => {
        const span = 1 / beats.length;
        const enter = index * span;
        gsap.fromTo(
          beat,
          { opacity: index === 0 ? 1 : 0, y: index === 0 ? 0 : 24 },
          {
            opacity: 1,
            y: 0,
            ease: 'none',
            scrollTrigger: {
              trigger: track.current,
              start: `top+=${enter * 100}% top`,
              end: `top+=${(enter + span * 0.45) * 100}% top`,
              scrub: 0.4,
            },
          },
        );
        if (index < beats.length - 1) {
          gsap.to(beat, {
            opacity: 0,
            y: -24,
            ease: 'none',
            scrollTrigger: {
              trigger: track.current,
              start: `top+=${(enter + span * 0.62) * 100}% top`,
              end: `top+=${(enter + span) * 100}% top`,
              scrub: 0.4,
            },
          });
        }
      });

      // The progress rail under the copy.
      gsap.to('[data-beat-rail]', {
        scaleX: 1,
        ease: 'none',
        scrollTrigger: { trigger: track.current, start: 'top top', end: 'bottom bottom', scrub: 0.4 },
      });
    }, track);

    return () => context.revert();
  }, [reduced]);

  return (
    <section
      ref={track}
      id="how"
      className={cx('relative scroll-mt-16 border-b bg-[var(--bg-subtle)]', !reduced && 'h-[300vh]')}
    >
      <div className={cx('flex flex-col', !reduced && 'sticky top-0 h-dvh overflow-hidden')}>
        <div className="mx-auto flex w-full max-w-6xl 2xl:max-w-7xl 3xl:max-w-[88rem] flex-1 flex-col px-4 py-3 pb-6 sm:px-6 sm:py-6 lg:grid lg:grid-cols-2 lg:items-center lg:gap-12 2xl:gap-20 lg:py-12">
          {/*
            Cube first on a phone, copy underneath. Fills the screen height proportionally without empty space at the bottom.
          */}
          <div className="relative order-1 min-h-0 flex-1 lg:order-2 lg:h-[62vh] 2xl:h-[68vh]">
            <AssemblyScene progress={progress} />
          </div>

          <div className="order-2 shrink-0 lg:order-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-faint)] 2xl:text-xs">How it works</p>

            {/* Beats are stacked in one grid cell so the block does not jump
                height as they swap; reduced motion unstacks them. */}
            <div className={cx('mt-2 sm:mt-3', !reduced && 'grid [&>*]:col-start-1 [&>*]:row-start-1')}>
              {BEATS.map((beat) => (
                <div key={beat.step} data-beat className={cx(reduced && 'mb-8')}>
                  <p className="text-[12px] sm:text-[13px] font-bold tabular-nums text-[var(--text-faint)] 2xl:text-sm">{beat.step}</p>
                  <h2 className="mt-0.5 text-[22px] sm:text-3xl lg:text-4xl 2xl:text-5xl font-bold leading-[1.12]">{beat.title}</h2>
                  <p className="mt-2 sm:mt-3 max-w-lg text-[13px] sm:text-[15px] 2xl:text-lg 2xl:max-w-xl leading-relaxed text-[var(--text-muted)]">{beat.body}</p>
                </div>
              ))}
            </div>

            {!reduced && (
              <div className="mt-3 sm:mt-6 h-0.5 w-full max-w-lg 2xl:max-w-xl overflow-hidden rounded-full bg-[var(--border)]">
                <div data-beat-rail className="h-full origin-left scale-x-0 rounded-full bg-[var(--text)]" />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
