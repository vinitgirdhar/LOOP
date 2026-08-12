/*
  Timing for the pinned "How it works" beat.

  The cube and the copy used to be scheduled against two different rulers. The
  scene read `ScrollTrigger.progress`, which runs 0 -> 1 across the *scrollable*
  distance (track height minus one viewport), while each beat was placed with
  `start: 'top+=62% top'`, and a percentage there is a fraction of the *whole*
  track. On a 300vh track those are 200vh and 300vh respectively, so a beat
  written at 0.62 actually landed where the cube was already at 0.93: the block
  finished assembling well before the sentence describing it arrived.

  Everything now comes from one scroll fraction, and lives here so the scene and
  the section cannot drift apart again.
*/

/** Length of a beat's cross-fade, as a fraction of the track. */
export const FADE = 0.06;

/** How far a beat travels while fading, in pixels. */
export const BEAT_SHIFT = 20;

/**
 * When each beat owns the copy slot.
 *
 * The gaps between windows are deliberate: beats share one grid cell, so
 * letting two sit at half opacity would print one paragraph over another.
 */
export const WINDOWS = [
  { enter: 0, exit: 0.3 },
  { enter: 0.32, exit: 0.62 },
  { enter: 0.64, exit: 1 },
] as const;

/**
 * Scroll fraction at which the block finishes assembling.
 *
 * Set to the moment the third beat has fully arrived (0.64 + FADE) — that beat
 * claims the board ends up current, so it should land *as* the cube completes.
 * The remaining third of the track holds both, which is the pause that lets the
 * last point be read before the section unpins.
 */
export const ASSEMBLY_END = WINDOWS[2].enter + FADE;

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

export interface BeatState {
  opacity: number;
  /** Pixels, positive means still below its resting place. */
  y: number;
}

/** Where beat `index` should be drawn at scroll fraction `progress`. */
export function beatState(progress: number, index: number): BeatState {
  const window = WINDOWS[index] ?? WINDOWS[WINDOWS.length - 1];
  const last = index === WINDOWS.length - 1;

  // The first beat is already on screen when the section pins; fading it up
  // would flash the section blank at the top of the track.
  const rise = index === 0 ? 1 : clamp01((progress - window.enter) / FADE);
  // The last beat holds to the end rather than leaving on an empty screen.
  const fall = last ? 1 : 1 - clamp01((progress - (window.exit - FADE)) / FADE);

  return { opacity: Math.min(rise, fall), y: (1 - rise) * BEAT_SHIFT - (1 - fall) * BEAT_SHIFT };
}
