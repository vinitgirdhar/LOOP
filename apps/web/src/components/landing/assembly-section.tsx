'use client';

import { useLayoutEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useMediaQuery } from '@/lib/hooks';
import { cx } from '@/lib/format';
import { beatState } from '@/lib/scrollytelling';

/*
  The scrollytelling beat.

  A tall track holds a `position: sticky` viewport — CSS does the pinning,
  which behaves far better on iOS Safari than a JavaScript pin does, and
  survives a resize or an address-bar collapse without a refresh. GSAP is left
  to do the one thing CSS cannot: report how far through the track we are.

  One scroll fraction drives everything. It reaches the cube through a ref and
  the copy through quickSetters, so a finger dragging down the page moves both
  from the same number and re-renders no React at all. Beat timing lives in
  lib/scrollytelling.ts, which explains why the two used to disagree.

  Heights are in `svh`, not `vh`/`dvh`. On a phone `vh` is the tall viewport and
  `dvh` changes as the address bar collapses, so a `300vh` track over a `dvh`
  sticky pane measured two different screens and the scrub drifted mid-scroll.
  `svh` is the one unit that holds still while the reader is scrolling.
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

    // Queried outside the context because quickSetter writes straight to
    // `style` and is not something `revert()` knows to undo; the teardown has
    // to clear them itself or a beat left at opacity 0 stays invisible.
    const beats = gsap.utils.toArray<HTMLElement>('[data-beat]', track.current);

    const context = gsap.context(() => {
      gsap.set(beats, { willChange: 'opacity, transform' });

      const setters = beats.map((beat) => ({
        opacity: gsap.quickSetter(beat, 'opacity') as (value: number) => void,
        y: gsap.quickSetter(beat, 'y', 'px') as (value: number) => void,
      }));
      const rails = gsap.utils.toArray<HTMLElement>('[data-beat-rail]', track.current);
      const setRail = rails[0] ? (gsap.quickSetter(rails[0], 'scaleX') as (value: number) => void) : null;

      /** The single write of the frame: same fraction to the cube and the copy. */
      const paint = (fraction: number) => {
        progress.current = fraction;
        setters.forEach((set, index) => {
          const state = beatState(fraction, index);
          set.opacity(state.opacity);
          set.y(state.y);
        });
        setRail?.(fraction);
      };

      // Scrubbing a plain object rather than reading ScrollTrigger.progress
      // directly: `scrub` smooths the tween, not the trigger, so this is what
      // turns a jumpy trackpad into a smooth assembly — and both the cube and
      // the copy get the smoothed value instead of one of each.
      const scrubbed = { fraction: 0 };
      gsap.to(scrubbed, {
        fraction: 1,
        ease: 'none',
        onUpdate: () => paint(scrubbed.fraction),
        scrollTrigger: {
          trigger: track.current,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 0.4,
          invalidateOnRefresh: true,
        },
      });

      paint(0);
    }, track);

    return () => {
      context.revert();
      gsap.set(beats, { clearProps: 'opacity,transform,willChange' });
    };
  }, [reduced]);

  return (
    <section
      ref={track}
      id="how"
      className={cx('relative scroll-mt-16 border-b bg-[var(--bg-subtle)]', !reduced && 'h-[300svh]')}
    >
      <div className={cx('flex flex-col', !reduced && 'sticky top-0 h-[100svh] overflow-hidden')}>
        <div className="mx-auto flex w-full max-w-6xl 2xl:max-w-7xl 3xl:max-w-[88rem] flex-1 flex-col gap-3 px-4 py-3 pb-6 sm:gap-5 sm:px-6 sm:py-6 lg:grid lg:grid-cols-2 lg:items-center lg:gap-12 2xl:gap-20 lg:py-12">
          {/* Cube first on a phone, copy underneath. It takes whatever height
              the copy does not, so neither is cropped on a short screen. */}
          <div className="relative order-1 min-h-0 flex-1 lg:order-2 lg:h-[62svh] 2xl:h-[68svh]">
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
                  <h2 className="mt-0.5 text-[21px] sm:text-3xl lg:text-4xl 2xl:text-5xl font-bold leading-[1.12]">{beat.title}</h2>
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
