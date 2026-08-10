'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { SOCKET_EVENTS } from '@loop/shared';
import { Avatar, Badge, Button, Menu, MenuItem, MenuLabel, Skeleton } from '@/components/ui';
import { Icon } from '@/components/icons';
import { useQuery } from '@/lib/hooks';
import { api, apiErrorMessage } from '@/lib/api';
import { useToast } from '@/components/providers/toast';
import { useRoom, useSocketEvent } from '@/components/providers/socket';
import { useAuth } from '@/components/providers/auth';
import { PRIORITY_STYLE, cx, formatShortDate, isOverdue } from '@/lib/format';

export interface BoardColumn {
  id: string;
  key: string;
  name: string;
  order: number;
  isDone: boolean;
  wipLimit: number | null;
  color: string;
}

export interface BoardTask {
  id: string;
  number: number;
  title: string;
  status: string;
  priority: string;
  storyPoints: number | null;
  dueDate: string | null;
  isBlocked: boolean;
  completedAt: string | null;
  order: number;
  assignee: { id: string; name: string; avatarUrl: string | null } | null;
  labels: { id: string; name: string; color: string }[];
  checklistDone: number;
  checklistTotal: number;
  _count: { comments: number; subtasks: number; attachments: number; children: number };
}

interface BoardData {
  columns: BoardColumn[];
  tasks: BoardTask[];
}

/**
 * Kanban board.
 *
 * Desktop uses native HTML5 drag and drop. Touch devices do not fire those
 * events at all, so every card also carries a "Move to" menu — that is the
 * mobile-first path, not an afterthought.
 */
export function KanbanBoard({
  workspaceId,
  projectId,
  projectKey,
  sprintFilter,
  assigneeFilter,
  onCreate,
}: {
  workspaceId: string;
  projectId: string;
  projectKey: string;
  sprintFilter?: string;
  assigneeFilter?: string;
  onCreate?: (columnKey: string) => void;
}) {
  const toast = useToast();
  const { can, user } = useAuth();
  const query = new URLSearchParams();
  if (sprintFilter) query.set('sprintId', sprintFilter);
  if (assigneeFilter) query.set('assigneeId', assigneeFilter);

  const { data, loading, error, refetch, setData } = useQuery<BoardData>(
    `/api/projects/${projectId}/board${query.toString() ? `?${query}` : ''}`,
    [projectId, sprintFilter, assigneeFilter],
  );

  const [dragging, setDragging] = useState<string | null>(null);
  const [dropColumn, setDropColumn] = useState<string | null>(null);
  const pending = useRef(new Set<string>());

  useRoom('project', projectId);

  useSocketEvent<BoardTask & { projectId?: string }>(SOCKET_EVENTS.taskUpdate, (task) => {
    if (pending.current.has(task.id)) return; // our own optimistic write
    setData((current) => {
      if (!current) return current as never;
      const exists = current.tasks.some((t) => t.id === task.id);
      return {
        ...current,
        tasks: exists ? current.tasks.map((t) => (t.id === task.id ? { ...t, ...task } : t)) : [...current.tasks, task],
      };
    });
  });

  useSocketEvent<BoardTask>(SOCKET_EVENTS.taskCreate, (task) => {
    setData((current) => (current && !current.tasks.some((t) => t.id === task.id) ? { ...current, tasks: [...current.tasks, task] } : (current as never)));
  });

  useSocketEvent<{ id: string }>(SOCKET_EVENTS.taskDelete, ({ id }) => {
    setData((current) => (current ? { ...current, tasks: current.tasks.filter((t) => t.id !== id) } : (current as never)));
  });

  const grouped = useMemo(() => {
    const map = new Map<string, BoardTask[]>();
    for (const column of data?.columns ?? []) map.set(column.key, []);
    for (const task of data?.tasks ?? []) {
      if (!map.has(task.status)) map.set(task.status, []);
      map.get(task.status)!.push(task);
    }
    for (const list of map.values()) list.sort((a, b) => a.order - b.order);
    return map;
  }, [data]);

  const move = useCallback(
    async (taskId: string, columnKey: string, index: number) => {
      const task = data?.tasks.find((t) => t.id === taskId);
      if (!task || (task.status === columnKey && index < 0)) return;

      const mayMove = can('task.update.any') || (can('task.update.own') && task.assignee?.id === user?.id);
      if (!mayMove) {
        toast.error('You can only move tasks assigned to you');
        return;
      }

      pending.current.add(taskId);
      setData((current) => (current ? { ...current, tasks: current.tasks.map((t) => (t.id === taskId ? { ...t, status: columnKey } : t)) } : (current as never)));

      try {
        await api.post(`/api/tasks/${taskId}/move`, { status: columnKey, index: Math.max(0, index) });
      } catch (caught: unknown) {
        toast.error(apiErrorMessage(caught));
        void refetch();
      } finally {
        setTimeout(() => pending.current.delete(taskId), 400);
      }
    },
    [data, can, user, toast, setData, refetch],
  );

  if (loading && !data) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-72 w-[17rem] shrink-0" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)]">
        {error}
        <button type="button" onClick={refetch} className="ml-2 underline">
          Retry
        </button>
      </div>
    );
  }

  const columns = data?.columns ?? [];

  return (
    <div className="scroll-thin -mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-3 sm:mx-0 sm:snap-none sm:px-0">
      {columns.map((column) => {
        const tasks = grouped.get(column.key) ?? [];
        const overLimit = column.wipLimit !== null && tasks.length > column.wipLimit;

        return (
          <section
            key={column.id}
            className={cx(
              'flex w-[min(19rem,82vw)] shrink-0 snap-start flex-col rounded-xl border bg-[var(--bg-subtle)] sm:w-[17.5rem]',
              dropColumn === column.key && 'drop-target',
            )}
            onDragOver={(event) => {
              event.preventDefault();
              setDropColumn(column.key);
            }}
            onDragLeave={() => setDropColumn((c) => (c === column.key ? null : c))}
            onDrop={(event) => {
              event.preventDefault();
              const taskId = event.dataTransfer.getData('text/task-id');
              setDropColumn(null);
              setDragging(null);
              if (taskId) void move(taskId, column.key, tasks.length);
            }}
            aria-label={`${column.name} column`}
          >
            <header className="flex items-center gap-2 px-3 py-2.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: column.color }} />
              <h3 className="truncate text-[13px] font-semibold">{column.name}</h3>
              <span className={cx('badge tabular-nums', overLimit ? 'bg-[var(--danger-soft)] text-[var(--danger)]' : 'bg-[var(--bg-inset)] text-[var(--text-muted)]')}>
                {tasks.length}
                {column.wipLimit !== null && `/${column.wipLimit}`}
              </span>
              {onCreate && can('task.create') && (
                <button type="button" onClick={() => onCreate(column.key)} className="btn btn-ghost btn-icon btn-sm ml-auto" aria-label={`Add task to ${column.name}`}>
                  <Icon.plus width={14} height={14} />
                </button>
              )}
            </header>

            {/* On touch the page itself scrolls: a nested scroller inside a
                scrolling page is a trap for a thumb. The column only gets its
                own scrollbar once there is a sidebar to anchor it. */}
            <div className="scroll-thin flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2 lg:max-h-[calc(100dvh-var(--header-h)-13rem)] lg:overflow-y-auto lg:overscroll-contain">
              {tasks.length === 0 ? (
                <p className="rounded-lg border border-dashed py-6 text-center text-[11px] text-[var(--text-faint)]">Drop a task here</p>
              ) : (
                tasks.map((task, index) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    workspaceId={workspaceId}
                    projectKey={projectKey}
                    columns={columns}
                    dragging={dragging === task.id}
                    onDragStart={(event) => {
                      event.dataTransfer.setData('text/task-id', task.id);
                      event.dataTransfer.effectAllowed = 'move';
                      setDragging(task.id);
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setDropColumn(null);
                    }}
                    onDropOnCard={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      const taskId = event.dataTransfer.getData('text/task-id');
                      setDropColumn(null);
                      setDragging(null);
                      if (taskId && taskId !== task.id) void move(taskId, column.key, index);
                    }}
                    onMoveTo={(key) => void move(task.id, key, 0)}
                  />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function TaskCard({
  task,
  workspaceId,
  projectKey,
  columns,
  dragging,
  onDragStart,
  onDragEnd,
  onDropOnCard,
  onMoveTo,
}: {
  task: BoardTask;
  workspaceId: string;
  projectKey: string;
  columns: BoardColumn[];
  dragging: boolean;
  onDragStart: (event: React.DragEvent) => void;
  onDragEnd: () => void;
  onDropOnCard: (event: React.DragEvent) => void;
  onMoveTo: (columnKey: string) => void;
}) {
  const priority = PRIORITY_STYLE[task.priority];
  const overdue = isOverdue(task.dueDate, task.completedAt);

  return (
    <article
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDropOnCard}
      className={cx('card group p-2.5 transition-shadow hover:shadow-[var(--shadow)] lg:cursor-grab lg:active:cursor-grabbing', dragging && 'dragging')}
    >
      <div className="flex items-start justify-between gap-1.5">
        <Link href={`/w/${workspaceId}/tasks/${task.id}`} className="min-w-0 flex-1">
          <p className="text-[13px] font-medium leading-snug">{task.title}</p>
        </Link>
        <Menu
          trigger={
            <button type="button" className="btn btn-ghost btn-icon btn-sm shrink-0 opacity-60 group-hover:opacity-100" aria-label="Task actions">
              <Icon.more width={14} height={14} />
            </button>
          }
        >
          {(close) => (
            <>
              <MenuLabel>Move to</MenuLabel>
              {columns
                .filter((column) => column.key !== task.status)
                .map((column) => (
                  <MenuItem
                    key={column.id}
                    onClick={() => {
                      close();
                      onMoveTo(column.key);
                    }}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: column.color }} />
                    {column.name}
                  </MenuItem>
                ))}
              <div className="divider my-1" />
              <MenuItem href={`/w/${workspaceId}/tasks/${task.id}`} onClick={close}>
                <Icon.link width={14} height={14} /> Open task
              </MenuItem>
            </>
          )}
        </Menu>
      </div>

      {task.labels.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {task.labels.slice(0, 3).map((label) => (
            <span key={label.id} className="badge" style={{ background: `${label.color}1f`, color: label.color }}>
              {label.name}
            </span>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
        <span className="font-mono">{projectKey}-{task.number}</span>
        {priority && <span className={cx('badge', priority.className)}>{priority.label}</span>}
        {task.isBlocked && (
          <Badge tone="danger">
            <Icon.block width={9} height={9} /> Blocked
          </Badge>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2">
        <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
          {task.checklistTotal > 0 && (
            <span className="inline-flex items-center gap-1 tabular-nums" title="Checklist">
              <Icon.checkSquare width={12} height={12} />
              {task.checklistDone}/{task.checklistTotal}
            </span>
          )}
          {task._count.comments > 0 && (
            <span className="inline-flex items-center gap-1 tabular-nums" title="Comments">
              <Icon.chat width={12} height={12} />
              {task._count.comments}
            </span>
          )}
          {task._count.attachments > 0 && (
            <span className="inline-flex items-center gap-1 tabular-nums" title="Attachments">
              <Icon.paperclip width={12} height={12} />
              {task._count.attachments}
            </span>
          )}
          {task.storyPoints !== null && (
            <span className="rounded bg-[var(--bg-inset)] px-1.5 py-0.5 font-semibold tabular-nums" title="Story points">
              {task.storyPoints}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {task.dueDate && <span className={cx('text-[10px]', overdue ? 'font-semibold text-[var(--danger)]' : 'text-[var(--text-muted)]')}>{formatShortDate(task.dueDate)}</span>}
          {task.assignee && <Avatar seed={task.assignee.id} name={task.assignee.name} src={task.assignee.avatarUrl} size={20} />}
        </div>
      </div>
    </article>
  );
}

/** Compact inline create used by the board and the sprint page. */
export function QuickAddTask({
  projectId,
  columnKey,
  onDone,
  onCancel,
}: {
  projectId: string;
  columnKey: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => ref.current?.focus(), []);

  return (
    <form
      className="card space-y-2 p-2.5"
      onSubmit={async (event) => {
        event.preventDefault();
        if (title.trim().length < 2) return;
        setSaving(true);
        try {
          await api.post('/api/tasks', { projectId, title: title.trim(), status: columnKey });
          setTitle('');
          onDone();
        } catch (caught: unknown) {
          toast.error(apiErrorMessage(caught));
        } finally {
          setSaving(false);
        }
      }}
    >
      <input
        ref={ref}
        className="input"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task title…"
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
      />
      <div className="flex gap-1.5">
        <Button type="submit" variant="primary" size="sm" loading={saving} disabled={title.trim().length < 2}>
          Add
        </Button>
        <Button type="button" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
