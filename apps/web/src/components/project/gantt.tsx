'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useQuery } from '@/lib/hooks';
import { api, apiErrorMessage } from '@/lib/api';
import { useToast } from '@/components/providers/toast';
import { Button, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { Icon } from '@/components/icons';
import { cx } from '@/lib/format';
import {
  BAR_HEIGHT,
  DAY_MS,
  DAY_WIDTH,
  ROW_HEIGHT,
  addDays,
  barFor,
  criticalPath,
  daysBetween,
  isWeekend,
  monthBands,
  startOfDay,
  timelineRange,
  type GanttDependency,
  type GanttMilestone,
  type GanttSprint,
  type GanttTask,
  type Zoom,
} from '@/lib/gantt';

interface GanttPayload {
  project: { id: string; key: string; name: string; deadline: string | null; color: string };
  tasks: GanttTask[];
  dependencies: GanttDependency[];
  milestones: GanttMilestone[];
  sprints: GanttSprint[];
}

/** What the pointer is currently doing to a bar. */
type Drag =
  | { taskId: string; mode: 'move' | 'start' | 'end'; originX: number; start: number; end: number }
  | null;

const LABEL_WIDTH = 232;

export function ProjectGantt({ projectId }: { projectId: string }) {
  const toast = useToast();
  const { data, loading, error, refetch, setData } = useQuery<GanttPayload>(`/api/projects/${projectId}/gantt`, [projectId]);

  const [zoom, setZoom] = useState<Zoom>('week');
  const [showCritical, setShowCritical] = useState(true);
  const [drag, setDrag] = useState<Drag>(null);
  const surface = useRef<HTMLDivElement>(null);

  const dayWidth = DAY_WIDTH[zoom];
  const tasks = useMemo(() => data?.tasks ?? [], [data]);
  const milestones = useMemo(() => data?.milestones ?? [], [data]);
  const sprints = useMemo(() => data?.sprints ?? [], [data]);
  const dependencies = useMemo(() => data?.dependencies ?? [], [data]);

  const scheduled = useMemo(() => tasks.filter((task) => barFor(task) !== null), [tasks]);
  const unscheduled = useMemo(() => tasks.filter((task) => barFor(task) === null), [tasks]);

  const { from, to } = useMemo(() => timelineRange(scheduled, milestones, sprints), [scheduled, milestones, sprints]);
  const totalDays = Math.max(1, daysBetween(from, to));
  const width = totalDays * dayWidth;
  const height = Math.max(scheduled.length, 1) * ROW_HEIGHT;

  const critical = useMemo(
    () => (showCritical ? criticalPath(scheduled, dependencies) : new Set<string>()),
    [scheduled, dependencies, showCritical],
  );

  const rowIndex = useMemo(() => new Map(scheduled.map((task, index) => [task.id, index])), [scheduled]);

  /** Live geometry: the dragged bar follows the pointer before the server agrees. */
  const geometry = useCallback(
    (task: GanttTask) => {
      const bar = barFor(task);
      if (!bar) return null;
      if (drag?.taskId !== task.id) return bar;
      return { start: drag.start, end: drag.end, inferred: bar.inferred };
    },
    [drag],
  );

  const onPointerDown = (event: React.PointerEvent, task: GanttTask, mode: 'move' | 'start' | 'end') => {
    const bar = barFor(task);
    if (!bar) return;
    event.preventDefault();
    event.stopPropagation();
    (event.target as Element).setPointerCapture?.(event.pointerId);
    setDrag({ taskId: task.id, mode, originX: event.clientX, start: bar.start, end: bar.end });
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag) return;
    const bar = barFor(tasks.find((task) => task.id === drag.taskId)!);
    if (!bar) return;

    // Snap to whole days. A timeline that lets a bar land mid-day writes a
    // timestamp nobody asked for and makes two identical bars look misaligned.
    const shift = Math.round((event.clientX - drag.originX) / dayWidth);
    if (drag.mode === 'move') {
      setDrag({ ...drag, start: addDays(bar.start, shift), end: addDays(bar.end, shift) });
    } else if (drag.mode === 'start') {
      setDrag({ ...drag, start: Math.min(addDays(bar.start, shift), bar.end), end: bar.end });
    } else {
      setDrag({ ...drag, start: bar.start, end: Math.max(addDays(bar.end, shift), bar.start) });
    }
  };

  const commit = async () => {
    if (!drag) return;
    const pending = drag;
    setDrag(null);

    const task = tasks.find((row) => row.id === pending.taskId);
    if (!task) return;
    const bar = barFor(task)!;
    if (bar.start === pending.start && bar.end === pending.end) return;

    const startDate = new Date(pending.start).toISOString();
    const dueDate = new Date(pending.end).toISOString();

    // Optimistic: the bar has already moved under the pointer, so snapping it
    // back for the length of a round trip would read as the drag failing.
    setData((current) =>
      current
        ? { ...current, tasks: current.tasks.map((row) => (row.id === task.id ? { ...row, startDate, dueDate } : row)) }
        : (current as unknown as GanttPayload),
    );

    try {
      await api.patch(`/api/tasks/${task.id}`, { startDate, dueDate });
    } catch (caught: unknown) {
      toast.error(apiErrorMessage(caught));
      void refetch();
    }
  };

  if (loading && !data) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-8" />
        ))}
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={refetch} />;

  if (scheduled.length === 0 && unscheduled.length === 0) {
    return <EmptyState title="Nothing to schedule yet" description="Tasks appear on the timeline once they have a start or a due date." />;
  }

  const todayX = daysBetween(from, startOfDay(Date.now())) * dayWidth;
  const bands = monthBands(from, to, dayWidth);

  return (
    <div className="flex flex-col gap-3">
      {/* ── controls ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="segmented w-auto">
          {(['day', 'week', 'month'] as Zoom[]).map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => setZoom(level)}
              className={cx('segmented-item', zoom === level && 'segmented-item-active')}
            >
              {level[0]!.toUpperCase() + level.slice(1)}
            </button>
          ))}
        </div>

        <Button
          size="sm"
          variant={showCritical ? 'primary' : undefined}
          icon={<Icon.bolt width={14} height={14} />}
          onClick={() => setShowCritical((on) => !on)}
        >
          Critical path
        </Button>

        <p className="ml-auto text-[11px] text-[var(--text-muted)]">
          Drag a bar to reschedule · drag its edge to change duration
        </p>
      </div>

      {/* ── chart ────────────────────────────────────────────────────── */}
      <div className="card overflow-hidden p-0">
        <div className="flex">
          {/* Fixed label column — the reason this is not one wide SVG. */}
          <div className="shrink-0 border-r bg-[var(--bg-subtle)]" style={{ width: LABEL_WIDTH }}>
            <div className="flex h-11 items-end border-b px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
              Task
            </div>
            {scheduled.map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-2 border-b px-3 text-[12px] last:border-b-0"
                style={{ height: ROW_HEIGHT }}
              >
                {task.key && <span className="shrink-0 font-mono text-[10px] text-[var(--text-faint)]">{task.key}</span>}
                <span className={cx('truncate', task.completedAt && 'line-through opacity-55')}>{task.title}</span>
              </div>
            ))}
          </div>

          {/* Scrolling timeline */}
          <div ref={surface} className="scroll-thin flex-1 overflow-x-auto">
            <svg
              width={width}
              height={height + 44}
              role="img"
              aria-label={`Gantt chart, ${scheduled.length} scheduled tasks`}
              onPointerMove={onPointerMove}
              onPointerUp={() => void commit()}
              onPointerLeave={() => void commit()}
              style={{ touchAction: drag ? 'none' : undefined }}
            >
              {/* month bands + day grid */}
              <g>
                {bands.map((band) => (
                  <g key={band.label}>
                    <rect x={band.x} y={0} width={band.width} height={26} fill="var(--bg-subtle)" />
                    <text x={band.x + 6} y={17} fontSize={10} fill="var(--text-muted)" fontWeight={600}>
                      {band.label}
                    </text>
                  </g>
                ))}
                {Array.from({ length: totalDays }).map((_, index) => {
                  const time = addDays(from, index);
                  return (
                    <g key={index}>
                      {isWeekend(time) && (
                        <rect x={index * dayWidth} y={26} width={dayWidth} height={height + 18} fill="var(--bg-subtle)" opacity={0.7} />
                      )}
                      {(zoom === 'day' || index % 7 === 0) && (
                        <line x1={index * dayWidth} y1={26} x2={index * dayWidth} y2={height + 44} stroke="var(--border)" strokeWidth={1} />
                      )}
                      {zoom === 'day' && (
                        <text x={index * dayWidth + dayWidth / 2} y={40} fontSize={9} textAnchor="middle" fill="var(--text-faint)">
                          {new Date(time).getUTCDate()}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>

              {/* sprint bands, behind everything */}
              {sprints.map((sprint) => {
                const x = daysBetween(from, startOfDay(sprint.startDate)) * dayWidth;
                const w = Math.max(1, daysBetween(startOfDay(sprint.startDate), startOfDay(sprint.endDate)) + 1) * dayWidth;
                return (
                  <g key={sprint.id}>
                    <rect x={x} y={44} width={w} height={height} fill="var(--accent-soft)" opacity={0.5} />
                    <text x={x + 5} y={56} fontSize={9} fill="var(--text-faint)" fontWeight={600}>
                      {sprint.name}
                    </text>
                  </g>
                );
              })}

              {/* dependency arrows: blocker finish → blocked start */}
              <defs>
                <marker id="gantt-arrow" viewBox="0 0 8 8" refX={7} refY={4} markerWidth={6} markerHeight={6} orient="auto">
                  <path d="M0,0 L8,4 L0,8 z" fill="var(--text-faint)" />
                </marker>
              </defs>
              {dependencies.map((edge) => {
                const blocker = scheduled.find((task) => task.id === edge.blockerId);
                const blocked = scheduled.find((task) => task.id === edge.blockedId);
                if (!blocker || !blocked) return null;
                const a = geometry(blocker);
                const b = geometry(blocked);
                if (!a || !b) return null;

                const fromX = (daysBetween(from, a.end) + 1) * dayWidth;
                const fromY = 44 + rowIndex.get(blocker.id)! * ROW_HEIGHT + ROW_HEIGHT / 2;
                const toX = daysBetween(from, b.start) * dayWidth;
                const toY = 44 + rowIndex.get(blocked.id)! * ROW_HEIGHT + ROW_HEIGHT / 2;
                // Elbow out and back, so an arrow to a task that starts before
                // its blocker ends still reads as a link rather than a scribble.
                const mid = Math.max(fromX + 10, toX - 10);

                return (
                  <path
                    key={`${edge.blockerId}-${edge.blockedId}`}
                    d={`M${fromX},${fromY} H${mid} V${toY} H${toX}`}
                    fill="none"
                    stroke="var(--text-faint)"
                    strokeWidth={1.2}
                    strokeDasharray="3 3"
                    markerEnd="url(#gantt-arrow)"
                  />
                );
              })}

              {/* bars */}
              {scheduled.map((task, index) => {
                const bar = geometry(task);
                if (!bar) return null;
                const x = daysBetween(from, bar.start) * dayWidth;
                const w = Math.max(dayWidth * 0.6, (daysBetween(bar.start, bar.end) + 1) * dayWidth - 2);
                const y = 44 + index * ROW_HEIGHT + (ROW_HEIGHT - BAR_HEIGHT) / 2;
                const done = Boolean(task.completedAt);
                const onCritical = critical.has(task.id);

                return (
                  <g key={task.id}>
                    <rect
                      x={x}
                      y={y}
                      width={w}
                      height={BAR_HEIGHT}
                      rx={5}
                      fill={done ? 'var(--success)' : task.isBlocked ? 'var(--danger)' : onCritical ? 'var(--warning)' : 'var(--text)'}
                      opacity={bar.inferred ? 0.45 : 1}
                      cursor="grab"
                      onPointerDown={(event) => onPointerDown(event, task, 'move')}
                    >
                      <title>
                        {task.key ? `${task.key} · ` : ''}{task.title}
                        {'\n'}
                        {new Date(bar.start).toLocaleDateString(undefined, { timeZone: 'UTC' })} → {new Date(bar.end).toLocaleDateString(undefined, { timeZone: 'UTC' })}
                        {bar.inferred ? '\nOnly one date set — drag an edge to give it a duration' : ''}
                        {onCritical ? '\nOn the critical path' : ''}
                      </title>
                    </rect>

                    {/* resize handles */}
                    <rect
                      x={x - 3}
                      y={y}
                      width={7}
                      height={BAR_HEIGHT}
                      fill="transparent"
                      cursor="ew-resize"
                      onPointerDown={(event) => onPointerDown(event, task, 'start')}
                    />
                    <rect
                      x={x + w - 4}
                      y={y}
                      width={7}
                      height={BAR_HEIGHT}
                      fill="transparent"
                      cursor="ew-resize"
                      onPointerDown={(event) => onPointerDown(event, task, 'end')}
                    />

                    {w > 46 && (
                      <text x={x + 6} y={y + 14} fontSize={10} fill="var(--bg)" fontWeight={600} pointerEvents="none">
                        {task.storyPoints ? `${task.storyPoints} pt` : task.key ?? ''}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* milestones as diamonds on their due date */}
              {milestones.map((milestone) => {
                if (!milestone.dueDate) return null;
                const x = daysBetween(from, startOfDay(milestone.dueDate)) * dayWidth;
                return (
                  <g key={milestone.id} transform={`translate(${x}, 34)`}>
                    <path
                      d="M0,-6 L6,0 L0,6 L-6,0 Z"
                      fill={milestone.completedAt ? 'var(--success)' : 'var(--accent)'}
                      stroke="var(--bg)"
                      strokeWidth={1.5}
                    >
                      <title>{milestone.title}</title>
                    </path>
                    <line x1={0} y1={6} x2={0} y2={height + 10} stroke="var(--accent)" strokeWidth={1} strokeDasharray="2 4" opacity={0.5} />
                  </g>
                );
              })}

              {/* today */}
              {todayX >= 0 && todayX <= width && (
                <g>
                  <line x1={todayX} y1={26} x2={todayX} y2={height + 44} stroke="var(--danger)" strokeWidth={1.5} />
                  <text x={todayX + 4} y={36} fontSize={9} fill="var(--danger)" fontWeight={700}>
                    today
                  </text>
                </g>
              )}
            </svg>
          </div>
        </div>
      </div>

      {/* Unscheduled tasks are the reason most Gantt views get abandoned: they
          vanish. Listed here with a one-click way onto the timeline instead. */}
      {unscheduled.length > 0 && (
        <div className="card p-4">
          <p className="text-[13px] font-semibold">Not on the timeline ({unscheduled.length})</p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">These have no start or due date yet.</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {unscheduled.map((task) => (
              <button
                key={task.id}
                type="button"
                className="chip text-xs"
                onClick={async () => {
                  const today = startOfDay(Date.now());
                  const startDate = new Date(today).toISOString();
                  const dueDate = new Date(today + 2 * DAY_MS).toISOString();
                  try {
                    await api.patch(`/api/tasks/${task.id}`, { startDate, dueDate });
                    void refetch();
                  } catch (caught: unknown) {
                    toast.error(apiErrorMessage(caught));
                  }
                }}
              >
                <Icon.plus width={12} height={12} />
                {task.key ?? task.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
