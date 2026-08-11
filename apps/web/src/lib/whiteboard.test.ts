import assert from 'node:assert/strict';
import { emptyScene, normaliseScene } from './whiteboard';

/*
  The normaliser is the only thing standing between a jsonb column and the
  renderer, and it runs on both the way in and the way out. Everything it is
  supposed to survive is listed here.
*/

// ── defaults ──────────────────────────────────────────────────────────────
{
  assert.deepEqual(normaliseScene(null), { nodes: [], edges: [] }, 'null is an empty board, not a crash');
  assert.deepEqual(normaliseScene({}), { nodes: [], edges: [] });
  assert.deepEqual(normaliseScene('nonsense'), { nodes: [], edges: [] }, 'a non-object column never throws');

  const map = emptyScene('mindmap');
  assert.equal(map.nodes.length, 1, 'a new mind map starts from one central idea');
  assert.equal(emptyScene('whiteboard').nodes.length, 0, 'a new whiteboard starts blank');
}

// ── node coercion ─────────────────────────────────────────────────────────
{
  const scene = normaliseScene({
    nodes: [
      { id: 'a', x: 1, y: 2, text: 'ok', colour: 'success', shape: 'pill' },
      { id: 'b', x: Number.NaN, y: 5, text: 'bad coords', colour: 'nope', shape: 'nope' },
      { x: 3, y: 3 },
      null,
    ],
    edges: [],
  });

  assert.equal(scene.nodes.length, 2, 'nodes without an id are dropped');
  assert.equal(scene.nodes[1]!.x, 0, 'a non-finite coordinate falls back to 0 instead of vanishing off-canvas');
  assert.equal(scene.nodes[1]!.colour, 'ink', 'an unknown colour falls back to the default');
  assert.equal(scene.nodes[1]!.shape, 'rounded', 'so does an unknown shape');

  const long = normaliseScene({ nodes: [{ id: 'a', x: 0, y: 0, text: 'x'.repeat(500), colour: 'ink', shape: 'rounded' }], edges: [] });
  assert.equal(long.nodes[0]!.text.length, 280, 'node text is capped');
}

// ── edge integrity ────────────────────────────────────────────────────────
{
  const scene = normaliseScene({
    nodes: [
      { id: 'a', x: 0, y: 0, text: 'a', colour: 'ink', shape: 'rounded' },
      { id: 'b', x: 0, y: 0, text: 'b', colour: 'ink', shape: 'rounded' },
    ],
    edges: [
      { from: 'a', to: 'b' },
      { from: 'a', to: 'b' },
      { from: 'a', to: 'ghost' },
      { from: 'a', to: 'a' },
      { from: 'a' },
    ],
  });

  assert.equal(scene.edges.length, 1, 'duplicates, dangling ends, self-links and malformed edges all go');
  assert.deepEqual(scene.edges[0], { from: 'a', to: 'b' });
}

console.log('whiteboard: all checks passed');
