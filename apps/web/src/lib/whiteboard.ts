/**
 * Whiteboard scene model.
 *
 * Shared by the route handler and the canvas, so the shape the client draws is
 * the shape the server validates — there is no second definition to drift.
 */

export const NODE_COLOURS = ['ink', 'success', 'warning', 'danger', 'info'] as const;
export type NodeColour = (typeof NODE_COLOURS)[number];

export const NODE_SHAPES = ['rounded', 'pill', 'diamond'] as const;
export type NodeShape = (typeof NODE_SHAPES)[number];

export interface SceneNode {
  id: string;
  x: number;
  y: number;
  text: string;
  colour: NodeColour;
  shape: NodeShape;
}

export interface SceneEdge {
  from: string;
  to: string;
}

export interface Scene {
  nodes: SceneNode[];
  edges: SceneEdge[];
}

export const NODE_WIDTH = 148;
export const NODE_HEIGHT = 48;

export function emptyScene(kind: 'mindmap' | 'whiteboard'): Scene {
  // A mind map with nothing in it is not a blank page, it is a stuck user. The
  // root node gives the first drag something to come out of.
  if (kind === 'whiteboard') return { nodes: [], edges: [] };
  return {
    nodes: [{ id: 'root', x: 420, y: 220, text: 'Central idea', colour: 'ink', shape: 'pill' }],
    edges: [],
  };
}

/**
 * Coerces whatever came back from jsonb into a scene the canvas can render.
 *
 * The column is validated as an object by a check constraint but not by shape,
 * and a board written by an older build must not crash the newer canvas. Every
 * field is defaulted and unknown nodes on an edge are dropped, so the worst
 * case is a board that lost a stray arrow rather than a page that will not
 * open.
 */
export function normaliseScene(raw: unknown): Scene {
  const source = (raw ?? {}) as Partial<Scene>;
  const nodes: SceneNode[] = Array.isArray(source.nodes)
    ? source.nodes
        .filter((node): node is SceneNode => Boolean(node) && typeof (node as SceneNode).id === 'string')
        .map((node) => ({
          id: node.id,
          x: Number.isFinite(node.x) ? node.x : 0,
          y: Number.isFinite(node.y) ? node.y : 0,
          text: typeof node.text === 'string' ? node.text.slice(0, 280) : '',
          colour: NODE_COLOURS.includes(node.colour) ? node.colour : 'ink',
          shape: NODE_SHAPES.includes(node.shape) ? node.shape : 'rounded',
        }))
    : [];

  const known = new Set(nodes.map((node) => node.id));
  const edges: SceneEdge[] = Array.isArray(source.edges)
    ? source.edges
        .filter((edge): edge is SceneEdge => Boolean(edge) && typeof edge.from === 'string' && typeof edge.to === 'string')
        .filter((edge) => known.has(edge.from) && known.has(edge.to) && edge.from !== edge.to)
    : [];

  // The same pair twice draws two identical lines and doubles every hit test.
  const seen = new Set<string>();
  const unique = edges.filter((edge) => {
    const key = `${edge.from}->${edge.to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { nodes, edges: unique };
}

/** Where a fresh child sits relative to its parent, fanned so they do not stack. */
export function childPosition(parent: SceneNode, siblingCount: number): { x: number; y: number } {
  const angle = -0.6 + siblingCount * 0.45;
  return {
    x: parent.x + 210,
    y: parent.y + Math.sin(angle) * 120,
  };
}

export const CSS_COLOUR: Record<NodeColour, string> = {
  ink: 'var(--text)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
  info: 'var(--info)',
};
