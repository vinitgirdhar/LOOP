'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, apiErrorMessage } from '@/lib/api';
import { useToast } from '@/components/providers/toast';
import { Button } from '@/components/ui';
import { Icon } from '@/components/icons';
import { cx } from '@/lib/format';
import {
  CSS_COLOUR,
  NODE_COLOURS,
  NODE_HEIGHT,
  NODE_WIDTH,
  childPosition,
  normaliseScene,
  type NodeColour,
  type Scene,
  type SceneNode,
} from '@/lib/whiteboard';

type Pointer =
  | { kind: 'node'; id: string; offsetX: number; offsetY: number }
  | { kind: 'pan'; startX: number; startY: number; originX: number; originY: number }
  | null;

const AUTOSAVE_MS = 900;

export function WhiteboardCanvas({ boardId, initial, title }: { boardId: string; initial: Scene; title: string }) {
  const toast = useToast();
  const [scene, setScene] = useState<Scene>(() => normaliseScene(initial));
  const [selected, setSelected] = useState<string | null>(null);
  const [linking, setLinking] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle');

  const pointer = useRef<Pointer>(null);
  const surface = useRef<SVGSVGElement>(null);
  const dirty = useRef(false);

  /**
   * Debounced autosave.
   *
   * A whiteboard is dragged continuously, so saving per change would be a
   * request per animation frame. The timer restarts on every edit and only
   * fires once the board has been still for a moment.
   */
  useEffect(() => {
    if (!dirty.current) return;
    setSaving('saving');
    const timer = setTimeout(async () => {
      try {
        await api.patch(`/api/whiteboards/${boardId}`, { scene });
        dirty.current = false;
        setSaving('saved');
      } catch (caught: unknown) {
        setSaving('idle');
        toast.error(apiErrorMessage(caught));
      }
    }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [scene, boardId, toast]);

  const edit = useCallback((next: (current: Scene) => Scene) => {
    dirty.current = true;
    setScene(next);
  }, []);

  /** Screen pixels → scene coordinates, so a drag tracks the cursor at any zoom. */
  const toScene = useCallback(
    (clientX: number, clientY: number) => {
      const box = surface.current?.getBoundingClientRect();
      if (!box) return { x: 0, y: 0 };
      return {
        x: (clientX - box.left - view.x) / view.zoom,
        y: (clientY - box.top - view.y) / view.zoom,
      };
    },
    [view],
  );

  const commitText = useCallback(
    (id: string, text: string) => {
      edit((current) => ({
        ...current,
        nodes: current.nodes.map((node) => (node.id === id ? { ...node, text: text.slice(0, 280) } : node)),
      }));
    },
    [edit],
  );

  const addNode = (parent?: SceneNode) => {
    const id = `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const siblings = parent ? scene.edges.filter((edge) => edge.from === parent.id).length : 0;
    const position = parent ? childPosition(parent, siblings) : { x: 200 - view.x / view.zoom, y: 160 - view.y / view.zoom };

    edit((current) => ({
      nodes: [...current.nodes, { id, ...position, text: 'New idea', colour: 'ink', shape: 'rounded' }],
      edges: parent ? [...current.edges, { from: parent.id, to: id }] : current.edges,
    }));
    setSelected(id);
    setEditing(id);
  };

  const removeNode = (id: string) => {
    edit((current) => ({
      nodes: current.nodes.filter((node) => node.id !== id),
      // Edges to a removed node have to go with it or the scene normaliser
      // silently drops them on the next load and the board changes shape.
      edges: current.edges.filter((edge) => edge.from !== id && edge.to !== id),
    }));
    setSelected(null);
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.target === surface.current) {
      setSelected(null);
      setLinking(null);
      pointer.current = { kind: 'pan', startX: event.clientX, startY: event.clientY, originX: view.x, originY: view.y };
    }
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const active = pointer.current;
    if (!active) return;

    if (active.kind === 'pan') {
      setView((current) => ({ ...current, x: active.originX + (event.clientX - active.startX), y: active.originY + (event.clientY - active.startY) }));
      return;
    }

    const point = toScene(event.clientX, event.clientY);
    edit((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === active.id ? { ...node, x: point.x - active.offsetX, y: point.y - active.offsetY } : node,
      ),
    }));
  };

  const selectedNode = scene.nodes.find((node) => node.id === selected) ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ── toolbar ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <span className="truncate text-[13px] font-semibold">{title}</span>

        <Button size="sm" icon={<Icon.plus width={14} height={14} />} onClick={() => addNode()}>
          Node
        </Button>

        {selectedNode && (
          <>
            <Button size="sm" icon={<Icon.sparkles width={14} height={14} />} onClick={() => addNode(selectedNode)}>
              Child
            </Button>
            <Button
              size="sm"
              variant={linking === selectedNode.id ? 'primary' : undefined}
              icon={<Icon.link width={14} height={14} />}
              onClick={() => setLinking((current) => (current === selectedNode.id ? null : selectedNode.id))}
            >
              {linking === selectedNode.id ? 'Pick a target' : 'Connect'}
            </Button>

            <div className="flex items-center gap-1">
              {NODE_COLOURS.map((colour) => (
                <button
                  key={colour}
                  type="button"
                  aria-label={`Colour ${colour}`}
                  onClick={() =>
                    edit((current) => ({
                      ...current,
                      nodes: current.nodes.map((node) => (node.id === selectedNode.id ? { ...node, colour: colour as NodeColour } : node)),
                    }))
                  }
                  className={cx(
                    'h-5 w-5 rounded-full border-2 transition-transform',
                    selectedNode.colour === colour ? 'scale-110 border-[var(--text)]' : 'border-transparent',
                  )}
                  style={{ background: CSS_COLOUR[colour] }}
                />
              ))}
            </div>

            <Button size="sm" variant="danger" icon={<Icon.trash width={14} height={14} />} onClick={() => removeNode(selectedNode.id)}>
              Delete
            </Button>
          </>
        )}

        <div className="ml-auto flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
          <span aria-live="polite">{saving === 'saving' ? 'Saving…' : saving === 'saved' ? 'Saved' : ''}</span>
          <Button size="sm" onClick={() => setView({ x: 0, y: 0, zoom: 1 })}>
            Reset view
          </Button>
        </div>
      </div>

      {/* ── canvas ───────────────────────────────────────────────────── */}
      <svg
        ref={surface}
        className="min-h-0 flex-1 touch-none bg-[var(--bg-subtle)]"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => {
          pointer.current = null;
        }}
        onPointerLeave={() => {
          pointer.current = null;
        }}
        onWheel={(event) => {
          // Ctrl+wheel is the pinch gesture a trackpad sends; plain wheel keeps
          // scrolling the page so the board never traps the reader.
          if (!event.ctrlKey) return;
          setView((current) => ({ ...current, zoom: Math.min(2.5, Math.max(0.35, current.zoom - event.deltaY * 0.002)) }));
        }}
      >
        <defs>
          <pattern id="wb-grid" width={24} height={24} patternUnits="userSpaceOnUse">
            <circle cx={1} cy={1} r={1} fill="var(--border)" />
          </pattern>
          <marker id="wb-arrow" viewBox="0 0 8 8" refX={7} refY={4} markerWidth={5} markerHeight={5} orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="var(--border-strong)" />
          </marker>
        </defs>
        <rect width="100%" height="100%" fill="url(#wb-grid)" />

        <g transform={`translate(${view.x}, ${view.y}) scale(${view.zoom})`}>
          {scene.edges.map((edge) => {
            const from = scene.nodes.find((node) => node.id === edge.from);
            const to = scene.nodes.find((node) => node.id === edge.to);
            if (!from || !to) return null;
            const x1 = from.x + NODE_WIDTH / 2;
            const y1 = from.y + NODE_HEIGHT / 2;
            const x2 = to.x + NODE_WIDTH / 2;
            const y2 = to.y + NODE_HEIGHT / 2;
            const mid = (x1 + x2) / 2;
            return (
              <path
                key={`${edge.from}-${edge.to}`}
                d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`}
                fill="none"
                stroke="var(--border-strong)"
                strokeWidth={1.6}
                markerEnd="url(#wb-arrow)"
              />
            );
          })}

          {scene.nodes.map((node) => {
            const isSelected = node.id === selected;
            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  if (linking && linking !== node.id) {
                    edit((current) => ({ ...current, edges: [...current.edges, { from: linking, to: node.id }] }));
                    setLinking(null);
                    return;
                  }
                  const point = toScene(event.clientX, event.clientY);
                  pointer.current = { kind: 'node', id: node.id, offsetX: point.x - node.x, offsetY: point.y - node.y };
                  setSelected(node.id);
                }}
                onDoubleClick={() => setEditing(node.id)}
                style={{ cursor: 'grab' }}
              >
                <rect
                  width={NODE_WIDTH}
                  height={NODE_HEIGHT}
                  rx={node.shape === 'pill' ? NODE_HEIGHT / 2 : 12}
                  fill="var(--surface)"
                  stroke={isSelected ? 'var(--text)' : CSS_COLOUR[node.colour]}
                  strokeWidth={isSelected ? 2.5 : 1.6}
                />
                <rect width={5} height={NODE_HEIGHT} rx={2.5} fill={CSS_COLOUR[node.colour]} />
                {editing === node.id ? (
                  <foreignObject x={10} y={8} width={NODE_WIDTH - 20} height={NODE_HEIGHT - 16}>
                    <input
                      autoFocus
                      defaultValue={node.text}
                      maxLength={280}
                      aria-label="Node text"
                      onPointerDown={(event) => event.stopPropagation()}
                      onBlur={(event) => {
                        commitText(node.id, event.target.value);
                        setEditing(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') event.currentTarget.blur();
                        // Escape abandons the edit rather than saving it.
                        if (event.key === 'Escape') {
                          event.currentTarget.value = node.text;
                          event.currentTarget.blur();
                        }
                      }}
                      className="h-full w-full rounded border-0 bg-transparent p-0 text-[12px] font-medium text-[var(--text)] outline-none"
                    />
                  </foreignObject>
                ) : (
                  <text x={16} y={NODE_HEIGHT / 2 + 4} fontSize={12} fill="var(--text)" fontWeight={550}>
                    {node.text.length > 20 ? `${node.text.slice(0, 19)}…` : node.text}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      <p className="border-t px-3 py-1.5 text-[11px] text-[var(--text-muted)]">
        Drag the background to pan · Ctrl+scroll to zoom · double-click a node to rename
      </p>
    </div>
  );
}
