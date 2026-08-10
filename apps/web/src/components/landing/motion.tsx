'use client';

import { useLayoutEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/*
  One motion controller for the whole marketing page.

  Rather than wrapping every block in an animated component, this scans for
  two data attributes and drives them in a single batch. That keeps the page
  itself a server component — the markup stays plain HTML that renders and
  reads fine with no JavaScript at all, and the motion is layered on top.

    data-reveal          fade and rise into view
    data-reveal-group    stagger the element's children instead of itself
    data-count="120"     count a number up when it arrives

  Nothing is hidden in CSS: the initial state is set here, after hydration, so
  a failed bundle leaves a readable page rather than an invisible one.
*/

export function ScrollMotion() {
  useLayoutEffect(() => {
    // Honour the OS setting: everything lands in its final state, instantly.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    gsap.registerPlugin(ScrollTrigger);

    const context = gsap.context(() => {
      const targets = gsap.utils.toArray<HTMLElement>('[data-reveal], [data-reveal-group] > *');
      gsap.set(targets, { opacity: 0, y: 26 });

      ScrollTrigger.batch(targets, {
        start: 'top 88%',
        once: true,
        onEnter: (batch) =>
          gsap.to(batch, {
            opacity: 1,
            y: 0,
            duration: 0.75,
            ease: 'power3.out',
            stagger: 0.07,
            overwrite: true,
          }),
      });

      gsap.utils.toArray<HTMLElement>('[data-count]').forEach((element) => {
        const target = Number(element.dataset.count ?? '0');
        const suffix = element.dataset.countSuffix ?? '';
        const counter = { value: 0 };
        gsap.to(counter, {
          value: target,
          duration: 1.2,
          ease: 'power2.out',
          scrollTrigger: { trigger: element, start: 'top 90%', once: true },
          onUpdate: () => {
            element.textContent = `${Math.round(counter.value)}${suffix}`;
          },
        });
      });
    });

    // Fonts and images settling can move every trigger point down the page.
    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener('load', refresh);

    return () => {
      window.removeEventListener('load', refresh);
      context.revert();
    };
  }, []);

  return null;
}
