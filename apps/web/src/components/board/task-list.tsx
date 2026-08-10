'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PRIORITIES } from '@loop/shared';
import { useDebounced, useQuery } from '@/lib/hooks';
import { Avatar, Badge, Button, Card, EmptyState, Skeleton } from '@/components/ui';
import { Icon } from '@/components/icons';
import { useAuth } from '@/components/providers/auth';
import { useToast } from '@/components/providers/toast';
import { api, apiErrorMessage } from '@/lib/api';
import { PRIORITY_STYLE, cx, formatShortDate, isOverdue } from '@/lib/format';

interface Row {
  id: string;
  number: number;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  completedAt: string | null;
  isBlocked: boolean;
  storyPoints: number | null;
  assignee: { id: string; name: string; avatarUrl: string | null } | null;
  labels: { id: string; name: string; color: string }[];
  project: { id: string; key: string; color: string };
}

/**
 * Table on desktop, cards on mobile. Bulk actions appear once something is
 * selected — the API rejects them for roles without task.update.any, so the
 * whole bar is hidden for those roles rather than failing on submit.
 */
export function TaskListTable({
  workspaceId,
  projectId,
  columns,
  members,
}: {
  workspaceId: string;
  projectId?: string;
  columns: { key: string; name: string }[];
  members: { id: string; name: string; avatarUrl: string | null }[];
}) {
  const { can } = useAuth();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [assignee, setAssignee] = useState('');
  const [priority, setPriority] = useState('');
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const debounced = useDebounced(search, 300);

  const query = new URLSearchParams({ limit: '100' });
  if (projectId) query.set('projectId', projectId);
  if (debounced.trim()) query.set('q', debounced.trim());
  if (status) query.set('status', status);
  if (assignee) query.set('assigneeId', assignee);
  if (priority) query.set('priority', priority);
  if (onlyOpen) query.set('open', 'true');

  const { data, loading, refetch, meta } = useQuery<Row[]>(`/api/tasks?${query}`, [debounced, status, assignee, priority, onlyOpen, projectId]);

  const runBulk = async (action: string, value: string | null) => {
    setBusy(true);
    try {
      const { data: result } = await api.post<{ updated: number }>('/api/tasks/bulk', { ids: selected, action, value });
      toast.success(`${result.updated} task${result.updated === 1 ? '' : 's'} updated`);
      setSelected([]);
      void refetch();
    } catch (caught: unknown) {
      toast.error(apiErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const allSelected = data !== null && data.length > 0 && selected.length === data.length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-40 flex-1">
          <Icon.search width={14} height={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
          <input className="input pl-8" placeholder="Search tasks…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="select w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Any column</option>
          {columns.map((column) => (
            <option key={column.key} value={column.key}>
              {column.name}
            </option>
          ))}
        </select>
        <select className="select w-auto" value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Assignee">
          <option value="">Anyone</option>
          <option value="me">Me</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
        <select className="select w-auto" value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority">
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p.toLowerCase()}
            </option>
          ))}
        </select>
        <label className="flex cursor-pointer items-center gap-1.5 text-[13px] text-[var(--text-muted)]">
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
          Open only
        </label>
      </div>

      {selected.length > 0 && can('task.update.any') && (
        <Card className="flex flex-wrap items-center gap-2 border-[var(--accent)] py-2.5">
          <span className="text-[13px] font-semibold">{selected.length} selected</span>
          <select className="select w-auto" defaultValue="" onChange={(e) => e.target.value && void runBulk('status', e.target.value)} disabled={busy} aria-label="Move to column">
            <option value="">Move to…</option>
            {columns.map((column) => (
              <option key={column.key} value={column.key}>
                {column.name}
              </option>
            ))}
          </select>
          <select className="select w-auto" defaultValue="" onChange={(e) => e.target.value && void runBulk('assignee', e.target.value === 'none' ? null : e.target.value)} disabled={busy} aria-label="Assign to">
            <option value="">Assign to…</option>
            <option value="none">Unassigned</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
          <select className="select w-auto" defaultValue="" onChange={(e) => e.target.value && void runBulk('priority', e.target.value)} disabled={busy} aria-label="Set priority">
            <option value="">Priority…</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p.toLowerCase()}
              </option>
            ))}
          </select>
          {can('task.delete') && (
            <Button variant="danger" size="sm" loading={busy} onClick={() => void runBulk('delete', null)}>
              Delete
            </Button>
          )}
          <Button size="sm" onClick={() => setSelected([])}>
            Clear
          </Button>
        </Card>
      )}

      {loading && !data ? (
        <Skeleton className="h-64 w-full" />
      ) : !data || data.length === 0 ? (
        <EmptyState title="No tasks match" description="Try clearing a filter." />
      ) : (
        <>
          {/* Desktop table */}
          <Card padded={false} className="hidden overflow-hidden lg:block">
            <table className="w-full text-left text-[13px]">
              <thead className="border-b bg-[var(--bg-subtle)] text-[11px] uppercase tracking-wide text-[var(--text-faint)]">
                <tr>
                  {can('task.update.any') && (
                    <th className="w-9 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={(e) => setSelected(e.target.checked ? data.map((t) => t.id) : [])}
                        aria-label="Select all"
                      />
                    </th>
                  )}
                  <th className="px-3 py-2 font-medium">Task</th>
                  <th className="px-3 py-2 font-medium">Column</th>
                  <th className="px-3 py-2 font-medium">Priority</th>
                  <th className="px-3 py-2 font-medium">Assignee</th>
                  <th className="px-3 py-2 font-medium">Due</th>
                  <th className="px-3 py-2 text-right font-medium">Pts</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.map((task) => (
                  <tr key={task.id} className="transition-colors hover:bg-[var(--bg-inset)]">
                    {can('task.update.any') && (
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selected.includes(task.id)}
                          onChange={(e) => setSelected((current) => (e.target.checked ? [...current, task.id] : current.filter((id) => id !== task.id)))}
                          aria-label={`Select ${task.title}`}
                        />
                      </td>
                    )}
                    <td className="max-w-md px-3 py-2">
                      <Link href={`/w/${workspaceId}/tasks/${task.id}`} className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-[var(--text-faint)]">
                          {task.project.key}-{task.number}
                        </span>
                        <span className="truncate font-medium">{task.title}</span>
                        {task.isBlocked && <Badge tone="danger">Blocked</Badge>}
                        {task.labels.slice(0, 2).map((label) => (
                          <span key={label.id} className="badge" style={{ background: `${label.color}1f`, color: label.color }}>
                            {label.name}
                          </span>
                        ))}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-[var(--text-muted)]">{columns.find((c) => c.key === task.status)?.name ?? task.status}</td>
                    <td className="px-3 py-2">
                      <span className={cx('badge', PRIORITY_STYLE[task.priority]?.className)}>{PRIORITY_STYLE[task.priority]?.label}</span>
                    </td>
                    <td className="px-3 py-2">
                      {task.assignee ? (
                        <span className="flex items-center gap-1.5">
                          <Avatar seed={task.assignee.id} name={task.assignee.name} src={task.assignee.avatarUrl} size={20} />
                          <span className="truncate text-[var(--text-muted)]">{task.assignee.name}</span>
                        </span>
                      ) : (
                        <span className="text-[var(--text-faint)]">—</span>
                      )}
                    </td>
                    <td className={cx('px-3 py-2', isOverdue(task.dueDate, task.completedAt) ? 'font-semibold text-[var(--danger)]' : 'text-[var(--text-muted)]')}>
                      {task.dueDate ? formatShortDate(task.dueDate) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">{task.storyPoints ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Mobile cards */}
          <div className="space-y-2 lg:hidden">
            {data.map((task) => (
              <Link key={task.id} href={`/w/${workspaceId}/tasks/${task.id}`} className="card block p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[13px] font-medium leading-snug">{task.title}</p>
                  <span className={cx('badge shrink-0', PRIORITY_STYLE[task.priority]?.className)}>{PRIORITY_STYLE[task.priority]?.label}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)]">
                  <span className="font-mono">
                    {task.project.key}-{task.number}
                  </span>
                  <span>· {columns.find((c) => c.key === task.status)?.name ?? task.status}</span>
                  {task.dueDate && <span className={cx(isOverdue(task.dueDate, task.completedAt) && 'font-semibold text-[var(--danger)]')}>· {formatShortDate(task.dueDate)}</span>}
                  {task.isBlocked && <Badge tone="danger">Blocked</Badge>}
                  {task.assignee && <Avatar seed={task.assignee.id} name={task.assignee.name} src={task.assignee.avatarUrl} size={18} className="ml-auto" />}
                </div>
              </Link>
            ))}
          </div>

          {meta && meta.total > data.length && (
            <p className="text-center text-xs text-[var(--text-muted)]">
              Showing {data.length} of {meta.total}. Narrow the filters to see the rest.
            </p>
          )}
        </>
      )}
    </div>
  );
}
