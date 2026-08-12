import assert from 'node:assert/strict';
import { ASSEMBLY_END, FADE, WINDOWS, beatState } from './scrollytelling';

/*
  The bug this guards against is silent: the cube and the copy still animate,
  they are just scheduled against each other wrongly, and nobody notices until
  somebody scrolls the page and says the text is late.
*/

const opacity = (progress: number) => WINDOWS.map((_, index) => Number(beatState(progress, index).opacity.toFixed(3)));

// ── the cube finishes exactly as the last beat lands ──────────────────────
{
  // Floating point: 0.64 + 0.06 lands a whisker under 1, which is invisible.
  assert.ok(beatState(ASSEMBLY_END, 2).opacity > 0.999, 'the third beat is fully readable the moment the block completes');
  assert.ok(beatState(ASSEMBLY_END - FADE, 2).opacity < 1, 'and was still arriving a moment earlier');
  assert.ok(ASSEMBLY_END < 1, 'scroll is left over afterwards, so the finished block is held rather than snapped past');
  assert.ok(1 - ASSEMBLY_END >= 0.25, 'the hold is long enough to read the last point');
}

// ── one beat at a time ────────────────────────────────────────────────────
{
  assert.deepEqual(opacity(0), [1, 0, 0], 'the section pins on a readable first beat, not a blank one');
  assert.deepEqual(opacity(0.15), [1, 0, 0]);
  assert.deepEqual(opacity(0.45), [0, 1, 0]);
  assert.deepEqual(opacity(1), [0, 0, 1]);

  // Beats share a grid cell, so two of them visible at once is two paragraphs
  // printed on top of each other.
  for (let progress = 0; progress <= 1; progress += 0.01) {
    const visible = opacity(progress).filter((value) => value > 0.5).length;
    assert.ok(visible <= 1, `at ${progress.toFixed(2)} at most one beat is legible, saw ${visible}`);
  }
}

// ── nothing overshoots its window ─────────────────────────────────────────
{
  for (let progress = -0.2; progress <= 1.2; progress += 0.01) {
    for (let index = 0; index < WINDOWS.length; index += 1) {
      const state = beatState(progress, index);
      assert.ok(state.opacity >= 0 && state.opacity <= 1, `opacity stays in range at ${progress.toFixed(2)}`);
      assert.ok(Math.abs(state.y) <= 20.0001, `travel stays bounded at ${progress.toFixed(2)}`);
    }
  }

  assert.equal(beatState(1, 2).y, 0, 'the held beat rests at its final position');
}

console.log('scrollytelling: all checks passed');
