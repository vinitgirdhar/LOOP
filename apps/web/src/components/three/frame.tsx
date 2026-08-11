'use client';

import { Canvas, useThree, type CanvasProps } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { useTheme } from '@/components/providers/theme';
import { useMediaQuery } from '@/lib/hooks';
import { cx } from '@/lib/format';

export const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/*
  Shared plumbing for every 3D scene on the site.

  Three rules the scenes themselves never have to think about:

  1. A canvas that is not on screen does not render. `frameloop` flips to
     'never' the moment the section scrolls away, so a phone is not spinning a
     GPU for a hero the reader has already passed.
  2. Reduced motion means one static frame, not a paused animation — the scene
     still draws, it simply stops moving.
  3. Colours come from the CSS token layer, so the geometry re-themes with the
     rest of the app instead of hard-coding black.
*/

/** Reads the palette out of the token layer so 3D matches the DOM around it. */
/**
 * Draws a few frames right after mount.
 *
 * A scene that is off screen — or that belongs to a reader who has asked for
 * reduced motion — runs on `demand`, which means `useFrame` never fires and
 * every instanced matrix is still the identity: the whole model collapses to a
 * single blob at the origin. These ticks give the scene its opening pose, and
 * cover the case where a parent writes the scroll progress just after the
 * child has mounted.
 */
export function useSettleFrames(layout: () => void) {
  const invalidate = useThree((state) => state.invalidate);
  const saved = useRef(layout);
  saved.current = layout;

  useEffect(() => {
    let frame = 0;
    let handle = 0;
    const tick = () => {
      saved.current();
      invalidate();
      frame += 1;
      if (frame < 3) handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [invalidate]);
}

/**
 * The two grounds a scene can sit on.
 *
 * `page` is the ordinary document surface. `ink` is the inverted panel the auth
 * screens use, where the page tokens would draw dark geometry on a dark field
 * and disappear — so the whole palette flips with the surface rather than each
 * scene hard-coding a colour for it.
 */
export type SceneSurface = 'page' | 'ink';

const SURFACE_TOKENS: Record<SceneSurface, { ink: [string, string]; ground: [string, string]; line: [string, string]; faint: [string, string] }> = {
  page: {
    ink: ['--text', '#101011'],
    ground: ['--bg', '#ffffff'],
    line: ['--border-strong', '#d3d3d7'],
    faint: ['--text-faint', '#9b9ba1'],
  },
  ink: {
    ink: ['--ink-text', '#f6f6f7'],
    ground: ['--ink', '#131314'],
    line: ['--ink-muted', '#a0a0a6'],
    faint: ['--ink-faint', '#77777d'],
  },
};

/** Reads the palette out of the token layer so 3D matches the DOM around it. */
export function useSceneColors(surface: SceneSurface = 'page') {
  const { theme } = useTheme();

  return useMemo(() => {
    const read = ([token, fallback]: [string, string]) => {
      if (typeof window === 'undefined') return fallback;
      const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
      return value || fallback;
    };
    const tokens = SURFACE_TOKENS[surface];
    return {
      ink: new THREE.Color(read(tokens.ink)),
      ground: new THREE.Color(read(tokens.ground)),
      line: new THREE.Color(read(tokens.line)),
      faint: new THREE.Color(read(tokens.faint)),
      // `theme` is the dependency that matters — the tokens change with it.
      key: theme,
    };
  }, [surface, theme]);
}

interface SceneFrameProps extends Omit<CanvasProps, 'children' | 'frameloop'> {
  children: ReactNode;
  className?: string;
  /** Keep rendering while off screen. Only for scenes driven by page scroll. */
  alwaysOn?: boolean;
}

export function SceneFrame({
  children,
  className,
  alwaysOn,
  camera = { fov: 45, position: [0, 0, 8] },
  ...rest
}: SceneFrameProps) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const reduced = useMediaQuery(REDUCED_MOTION);

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting)), {
      // Start a beat before it arrives so the first frame is never blank.
      rootMargin: '200px 0px',
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const running = (visible || alwaysOn) && !reduced;

  return (
    <div ref={host} className={cx('h-full w-full', className)}>
      <Canvas
        frameloop={running ? 'always' : 'demand'}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        camera={camera}
        // The scene is decoration; the copy beside it carries the meaning.
        aria-hidden
        {...rest}
      >
        {children}
      </Canvas>
    </div>
  );
}
