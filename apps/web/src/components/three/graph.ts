import * as THREE from 'three';

/*
  The shape of the hero constellation, as plain maths.

  Kept out of the component so it is a pure function of its constants: it can
  be reasoned about, and rendered to a flat projection offline, without pulling
  in React or a WebGL context.
*/

export const NODE_COUNT = 22;
export const RADIUS = 2.6;
/** Every third node is a tool rather than a person. */
export const isTool = (index: number) => index % 3 === 1;

export interface NodeSpec {
  base: THREE.Vector3;
  phase: number;
  speed: number;
  tool: boolean;
  /** Index within this node's own instanced mesh. */
  slot: number;
}

export interface Graph {
  nodes: NodeSpec[];
  edges: [number, number][];
  peopleCount: number;
  toolCount: number;
}

export function buildGraph(): Graph {
  const nodes: NodeSpec[] = [];
  let people = 0;
  let tools = 0;

  // Golden-angle spiral: even coverage of the sphere without clumping.
  for (let i = 0; i < NODE_COUNT; i += 1) {
    const y = 1 - (i / (NODE_COUNT - 1)) * 2;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const tool = isTool(i);
    nodes.push({
      base: new THREE.Vector3(Math.cos(theta) * ring, y, Math.sin(theta) * ring).multiplyScalar(RADIUS),
      phase: (i * 12.9898) % (Math.PI * 2),
      speed: 0.35 + ((i * 7) % 5) * 0.09,
      tool,
      slot: tool ? tools++ : people++,
    });
  }

  // Link each node to its two nearest neighbours, de-duplicated.
  const seen = new Set<string>();
  const edges: [number, number][] = [];
  nodes.forEach((node, i) => {
    nodes
      .map((other, j) => ({ j, d: node.base.distanceTo(other.base) }))
      .filter((entry) => entry.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, 2)
      .forEach(({ j }) => {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (seen.has(key)) return;
        seen.add(key);
        edges.push([i, j]);
      });
  });

  return { nodes, edges, peopleCount: people, toolCount: tools };
}
