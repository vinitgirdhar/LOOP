'use client';

import { use, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PRIORITIES } from '@loop/shared';
import { useQuery } from '@/lib/hooks';
import { Page, PageHeader } from '@/components/page';
import { Avatar, Badge, Button, Card, CloseIcon, Confirm, ErrorState, Field, Modal, Progress, SectionTitle, Skeleton } from '@/components/ui';
import { Icon } from '@/components/icons';
import { useAuth } from '@/components/providers/auth';
import { useToast } from '@/components/providers/toast';
import { api, apiErrorMessage } from '@/lib/api';
import { PRIORITY_STYLE, cx, formatBytes, formatDateTime, formatShortDate, isOverdue, relativeTime } from '@/lib/format';

interface TaskDetail {
  id: string;
  number: number;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  storyPoints: number | null;
  estimateHrs: number | null;
  dueDate: string | null;
  startDate: string | null;
  completedAt: string | null;
  isBlocked: boolean;
  blockedNote: string | null;
  recurrence: string | null;
  createdAt: string;
  lastActivityAt: string;
  assignee: { id: string; name: string; email: string; avatarUrl: string | null } | null;
  reporter: { id: string; name: string; avatarUrl: string | null } | null;
  project: { id: string; key: string; name: string; color: string };
  sprint: { id: string; name: string; status: string } | null;
  milestone: { id: string; title: string } | null;
  labels: { id: string; name: string; color: string }[];
  subtasks: { id: string; title: string; done: boolean; order: number }[];
  children: { id: string; number: number; title: string; status: string; completedAt: string | null; assignee: { id: string; name: string; avatarUrl: string | null } | null }[];
  blockedBy: { id: string; blocker: { id: string; number: number; title: string; status: string; completedAt: string | null } }[];
  blocks: { id: string; blocked: { id: string; number: number; title: string; status: string } }[];
  attachments: { id: string; name: string; url: string; mime: string; size: number; uploadedBy: { name: string } }[];
  _count: { comments: number };
}

interface Comment {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string; avatarUrl: string | null };
}

export default function TaskPage({ params }: { params: Promise<{ workspaceId: string; taskId: string }> }) {
  const { workspaceId, taskId } = use(params);
  const router = useRouter();
  const toast = useToast();
  const { can, user } = useAuth();

  const { data: task, loading, error, refetch } = useQuery<TaskDetail>(`/api/tasks/${taskId}`, [taskId]);
  const { data: comments, refetch: refetchComments } = useQuery<Comment[]>(`/api/tasks/${taskId}/comments`, [taskId]);
  const { data: project } = useQuery<{ columns: { key: string; name: string; color: string }[]; members: { user: { id: string; name: string; avatarUrl: string | null } }[]; sprints: { id: string; name: string }[]; labels: { id: string; name: string; color: string }[] }>(
    task ? `/api/projects/${task.project.id}` : null,
    [task?.project.id],
  );

  const [comment, setComment] = useState('');
  const [newSubtask, setNewSubtask] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [estimate, setEstimate] = useState<{ storyPoints: number; hours: number; reasoning: string; confidence: number; model: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  if (loading && !task) {
    return (
      <Page>
        <Skeleton className="mb-4 h-14 w-full" />
        <Skeleton className="h-96 w-full" />
      </Page>
    );
  }
  if (error) {
    return (
      <Page>
        <ErrorState message={error} onRetry={refetch} />
      </Page>
    );
  }
  if (!task) return null;

  const mine = task.assignee?.id === user?.id || task.reporter?.id === user?.id;
  const editable = can('task.update.any') || (can('task.update.own') && mine);
  const doneCount = task.subtasks.filter((s) => s.done).length;

  const patch = async (body: Record<string, unknown>) => {
    try {
      await api.patch(`/api/tasks/${task.id}`, body);
      void refetch();
    } catch (caught: unknown) {
      toast.error(apiErrorMessage(caught));
    }
  };

  return (
    <Page>
      <PageHeader
        back={{ href: `/w/${workspaceId}/projects/${task.project.id}`, label: task.project.name }}
        title={
          editable ? (
            <input
              className="w-full bg-transparent text-lg font-bold tracking-[-0.02em] outline-none focus:underline sm:text-xl"
              defaultValue={task.title}
              onBlur={(e) => e.target.value.trim() !== task.title && void patch({ title: e.target.value.trim() })}
              aria-label="Task title"
            />
          ) : (
            task.title
          )
        }
        meta={
          <>
            <span className="font-mono text-[11px] text-[var(--text-muted)]">
              {task.project.key}-{task.number}
            </span>
            <span className={cx('badge', PRIORITY_STYLE[task.priority]?.className)}>{PRIORITY_STYLE[task.priority]?.label}</span>
            {task.isBlocked && (
              <Badge tone="danger">
                <Icon.block width={10} height={10} /> Blocked
              </Badge>
            )}
            {task.completedAt && <Badge tone="success">Completed {formatShortDate(task.completedAt)}</Badge>}
            {task.recurrence && <Badge tone="info">Repeats {task.recurrence}</Badge>}
            <span className="text-[11px] text-[var(--text-faint)]">Last activity {relativeTime(task.lastActivityAt)}</span>
          </>
        }
        actions={
          <>
            {can('task.update.any') && (
              <Button
                size="sm"
                icon={<Icon.sparkles width={14} height={14} />}
                loading={estimating}
                onClick={async () => {
                  setEstimating(true);
                  try {
                    const { data } = await api.post<typeof estimate>(`/api/ai/estimate/${task.id}`);
                    setEstimate(data);
                  } catch (caught: unknown) {
                    toast.error(apiErrorMessage(caught));
                  } finally {
                    setEstimating(false);
                  }
                }}
              >
                AI estimate
              </Button>
            )}
            {can('task.delete') && (
              <Button size="sm" variant="danger" onClick={() => setDeleting(true)} icon={<Icon.trash width={14} height={14} />}>
                Delete
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_19rem]">
        <div className="space-y-4">
          <Card>
            <SectionTitle title="Description" />
            {editable ? (
              <textarea
                className="textarea"
                defaultValue={task.description ?? ''}
                placeholder="Add more detail…"
                onBlur={(e) => e.target.value !== (task.description ?? '') && void patch({ description: e.target.value || null })}
              />
            ) : (
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--text-muted)]">{task.description || 'No description.'}</p>
            )}
          </Card>

          <Card>
            <SectionTitle
              title="Checklist"
              subtitle={task.subtasks.length > 0 ? `${doneCount} of ${task.subtasks.length} done` : undefined}
            />
            {task.subtasks.length > 0 && (
              <div className="mb-3">
                <Progress value={(doneCount / task.subtasks.length) * 100} tone="var(--success)" />
              </div>
            )}
            <ul className="space-y-1">
              {task.subtasks.map((subtask) => (
                <li key={subtask.id} className="group flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-[var(--bg-inset)]">
                  <input
                    type="checkbox"
                    checked={subtask.done}
                    disabled={!editable}
                    onChange={async (e) => {
                      await api.patch(`/api/tasks/${task.id}/subtasks/${subtask.id}`, { done: e.target.checked });
                      void refetch();
                    }}
                  />
                  <span className={cx('flex-1 text-[13px]', subtask.done && 'text-[var(--text-faint)] line-through')}>{subtask.title}</span>
                  {editable && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon btn-sm opacity-0 group-hover:opacity-100"
                      aria-label="Remove item"
                      onClick={async () => {
                        await api.del(`/api/tasks/${task.id}/subtasks/${subtask.id}`);
                        void refetch();
                      }}
                    >
                      <Icon.trash width={13} height={13} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {editable && (
              <form
                className="mt-2 flex gap-2"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!newSubtask.trim()) return;
                  await api.post(`/api/tasks/${task.id}/subtasks`, { title: newSubtask.trim() });
                  setNewSubtask('');
                  void refetch();
                }}
              >
                <input className="input" placeholder="Add a checklist item" value={newSubtask} onChange={(e) => setNewSubtask(e.target.value)} />
                <Button type="submit" disabled={!newSubtask.trim()}>
                  Add
                </Button>
              </form>
            )}
          </Card>

          {(task.blockedBy.length > 0 || task.blocks.length > 0 || task.children.length > 0) && (
            <Card>
              <SectionTitle title="Relationships" />
              <div className="space-y-3">
                {task.blockedBy.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">Blocked by</p>
                    <ul className="space-y-1">
                      {task.blockedBy.map((dep) => (
                        <li key={dep.id} className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5">
                          <span className={cx('h-2 w-2 rounded-full', dep.blocker.completedAt ? 'bg-[var(--success)]' : 'bg-[var(--danger)]')} />
                          <Link href={`/w/${workspaceId}/tasks/${dep.blocker.id}`} className="min-w-0 flex-1 truncate text-[13px] hover:underline">
                            <span className="font-mono text-[11px] text-[var(--text-faint)]">{task.project.key}-{dep.blocker.number}</span> {dep.blocker.title}
                          </Link>
                          {can('task.update.any') && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-icon btn-sm"
                              aria-label="Remove dependency"
                              onClick={async () => {
                                await api.del(`/api/tasks/${task.id}/dependencies/${dep.id}`);
                                void refetch();
                              }}
                            >
                              <CloseIcon size={13} />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {task.blocks.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">Blocks</p>
                    <ul className="space-y-1">
                      {task.blocks.map((dep) => (
                        <li key={dep.id}>
                          <Link href={`/w/${workspaceId}/tasks/${dep.blocked.id}`} className="block truncate rounded-lg border px-2.5 py-1.5 text-[13px] hover:underline">
                            <span className="font-mono text-[11px] text-[var(--text-faint)]">{task.project.key}-{dep.blocked.number}</span> {dep.blocked.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {task.children.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">Subtasks</p>
                    <ul className="space-y-1">
                      {task.children.map((child) => (
                        <li key={child.id}>
                          <Link href={`/w/${workspaceId}/tasks/${child.id}`} className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[13px] hover:underline">
                            <span className={cx('h-2 w-2 rounded-full', child.completedAt ? 'bg-[var(--success)]' : 'bg-[var(--border-strong)]')} />
                            <span className="truncate">{child.title}</span>
                            {child.assignee && <Avatar name={child.assignee.name} src={child.assignee.avatarUrl} size={18} className="ml-auto" />}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Card>
          )}

          <Card>
            <SectionTitle
              title="Attachments"
              action={
                can('file.upload') ? (
                  <>
                    <Button size="sm" onClick={() => fileInput.current?.click()}>
                      Upload
                    </Button>
                    <input
                      ref={fileInput}
                      type="file"
                      multiple
                      hidden
                      onChange={async (event) => {
                        if (!event.target.files?.length) return;
                        const form = new FormData();
                        Array.from(event.target.files).forEach((file) => form.append('files', file));
                        try {
                          await api.upload(`/api/tasks/${task.id}/attachments`, form);
                          toast.success('Uploaded');
                          void refetch();
                        } catch (caught: unknown) {
                          toast.error(apiErrorMessage(caught));
                        } finally {
                          event.target.value = '';
                        }
                      }}
                    />
                  </>
                ) : undefined
              }
            />
            {task.attachments.length === 0 ? (
              <p className="text-[13px] text-[var(--text-muted)]">Nothing attached.</p>
            ) : (
              <ul className="space-y-1">
                {task.attachments.map((file) => (
                  <li key={file.id}>
                    <a href={file.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border px-2.5 py-2 text-[13px] hover:bg-[var(--bg-inset)]">
                      <Icon.folder width={15} height={15} className="text-[var(--text-muted)]" />
                      <span className="min-w-0 flex-1 truncate">{file.name}</span>
                      <span className="shrink-0 text-[11px] text-[var(--text-faint)]">{formatBytes(file.size)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <SectionTitle title={`Comments (${comments?.length ?? 0})`} subtitle="Use @name to notify someone" />
            <ul className="space-y-3">
              {(comments ?? []).map((entry) => (
                <li key={entry.id} className="flex gap-2.5">
                  <Avatar name={entry.author.name} src={entry.author.avatarUrl} size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px]">
                      <span className="font-semibold">{entry.author.name}</span>{' '}
                      <span className="text-[11px] text-[var(--text-faint)]">{relativeTime(entry.createdAt)}</span>
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--text-muted)]">{entry.body}</p>
                  </div>
                  {(entry.author.id === user?.id || can('task.update.any')) && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon btn-sm"
                      aria-label="Delete comment"
                      onClick={async () => {
                        await api.del(`/api/tasks/${task.id}/comments/${entry.id}`);
                        void refetchComments();
                      }}
                    >
                      <Icon.trash width={13} height={13} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {can('task.comment') && (
              <form
                className="mt-3 space-y-2"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!comment.trim()) return;
                  try {
                    await api.post(`/api/tasks/${task.id}/comments`, { body: comment.trim() });
                    setComment('');
                    void refetchComments();
                    void refetch();
                  } catch (caught: unknown) {
                    toast.error(apiErrorMessage(caught));
                  }
                }}
              >
                <textarea className="textarea min-h-20" placeholder="Write a comment…" value={comment} onChange={(e) => setComment(e.target.value)} />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-[var(--text-faint)]">Saying you are stuck here also reaches Auto-Pilot.</p>
                  <Button type="submit" variant="primary" size="sm" disabled={!comment.trim()}>
                    Comment
                  </Button>
                </div>
              </form>
            )}
          </Card>
        </div>

        {/* Sidebar */}
        <aside className="space-y-3">
          <Card>
            <div className="space-y-3">
              <Field label="Column">
                <select className="select" value={task.status} disabled={!editable} onChange={(e) => void patch({ status: e.target.value })}>
                  {(project?.columns ?? []).map((column) => (
                    <option key={column.key} value={column.key}>
                      {column.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Assignee">
                <select
                  className="select"
                  value={task.assignee?.id ?? ''}
                  disabled={!can('task.assign')}
                  onChange={(e) => void patch({ assigneeId: e.target.value || null })}
                >
                  <option value="">Unassigned</option>
                  {(project?.members ?? []).map((member) => (
                    <option key={member.user.id} value={member.user.id}>
                      {member.user.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Priority">
                <select className="select" value={task.priority} disabled={!can('task.update.any')} onChange={(e) => void patch({ priority: e.target.value })}>
                  {PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority.toLowerCase()}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Sprint">
                <select className="select" value={task.sprint?.id ?? ''} disabled={!can('task.update.any')} onChange={(e) => void patch({ sprintId: e.target.value || null })}>
                  <option value="">Backlog</option>
                  {(project?.sprints ?? []).map((sprint) => (
                    <option key={sprint.id} value={sprint.id}>
                      {sprint.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Points">
                  <input
                    type="number"
                    min={0}
                    className="input"
                    defaultValue={task.storyPoints ?? ''}
                    disabled={!editable}
                    onBlur={(e) => void patch({ storyPoints: e.target.value ? Number(e.target.value) : null })}
                  />
                </Field>
                <Field label="Estimate (h)">
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    className="input"
                    defaultValue={task.estimateHrs ?? ''}
                    disabled={!editable}
                    onBlur={(e) => void patch({ estimateHrs: e.target.value ? Number(e.target.value) : null })}
                  />
                </Field>
              </div>
              <Field label="Due date">
                <input
                  type="date"
                  className={cx('input', isOverdue(task.dueDate, task.completedAt) && 'border-[var(--danger)]')}
                  defaultValue={task.dueDate ? task.dueDate.slice(0, 10) : ''}
                  disabled={!editable}
                  onChange={(e) => void patch({ dueDate: e.target.value || null })}
                />
              </Field>
            </div>
          </Card>

          <Card>
            <SectionTitle title="Blocked" />
            <label className="flex cursor-pointer items-center gap-2 text-[13px]">
              <input type="checkbox" checked={task.isBlocked} disabled={!editable} onChange={(e) => void patch({ isBlocked: e.target.checked, ...(e.target.checked ? {} : { blockedNote: null }) })} />
              This task is blocked
            </label>
            {task.isBlocked && (
              <textarea
                className="textarea mt-2 min-h-16 text-[13px]"
                placeholder="What is blocking it?"
                defaultValue={task.blockedNote ?? ''}
                disabled={!editable}
                onBlur={(e) => void patch({ blockedNote: e.target.value || null })}
              />
            )}
          </Card>

          {project && project.labels.length > 0 && (
            <Card>
              <SectionTitle title="Labels" />
              <div className="flex flex-wrap gap-1.5">
                {project.labels.map((label) => {
                  const on = task.labels.some((l) => l.id === label.id);
                  return (
                    <button
                      key={label.id}
                      type="button"
                      disabled={!editable}
                      onClick={async () => {
                        if (on) await api.del(`/api/tasks/${task.id}/labels/${label.id}`);
                        else await api.post(`/api/tasks/${task.id}/labels`, { labelId: label.id });
                        void refetch();
                      }}
                      className="badge border"
                      style={{ background: on ? `${label.color}26` : 'transparent', color: on ? label.color : 'var(--text-muted)', borderColor: on ? label.color : 'var(--border)' }}
                    >
                      {label.name}
                    </button>
                  );
                })}
              </div>
            </Card>
          )}

          <Card>
            <SectionTitle title="Details" />
            <dl className="space-y-1.5 text-[12px]">
              <Row label="Reporter" value={task.reporter?.name ?? '—'} />
              <Row label="Created" value={formatDateTime(task.createdAt)} />
              <Row label="Milestone" value={task.milestone?.title ?? '—'} />
              <Row label="Project" value={task.project.name} />
            </dl>
          </Card>
        </aside>
      </div>

      <Modal
        open={Boolean(estimate)}
        onClose={() => setEstimate(null)}
        title="AI estimate"
        footer={
          <>
            <Button onClick={() => setEstimate(null)}>Dismiss</Button>
            <Button
              variant="primary"
              onClick={async () => {
                if (!estimate) return;
                await patch({ storyPoints: estimate.storyPoints, estimateHrs: estimate.hours });
                setEstimate(null);
                toast.success('Estimate applied');
              }}
            >
              Apply estimate
            </Button>
          </>
        }
      >
        {estimate && (
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-1 rounded-lg border p-3 text-center">
                <p className="text-2xl font-bold tabular-nums">{estimate.storyPoints}</p>
                <p className="text-[11px] text-[var(--text-muted)]">story points</p>
              </div>
              <div className="flex-1 rounded-lg border p-3 text-center">
                <p className="text-2xl font-bold tabular-nums">{estimate.hours}h</p>
                <p className="text-[11px] text-[var(--text-muted)]">estimated</p>
              </div>
              <div className="flex-1 rounded-lg border p-3 text-center">
                <p className="text-2xl font-bold tabular-nums">{Math.round(estimate.confidence * 100)}%</p>
                <p className="text-[11px] text-[var(--text-muted)]">confidence</p>
              </div>
            </div>
            <p className="rounded-lg bg-[var(--bg-inset)] p-3 text-[13px] leading-relaxed">{estimate.reasoning}</p>
            <p className="text-[11px] text-[var(--text-faint)]">
              Anchored on this project&apos;s completed tasks. Model: {estimate.model}. Nothing is written until you apply it.
            </p>
          </div>
        )}
      </Modal>

      <Confirm
        open={deleting}
        title="Delete task"
        message={`${task.project.key}-${task.number} and its comments, checklist and attachments will be removed.`}
        onCancel={() => setDeleting(false)}
        onConfirm={async () => {
          try {
            await api.del(`/api/tasks/${task.id}`);
            toast.success('Task deleted');
            router.push(`/w/${workspaceId}/projects/${task.project.id}`);
          } catch (caught: unknown) {
            toast.error(apiErrorMessage(caught));
          }
        }}
      />
    </Page>
  );
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-2">
    <dt className="text-[var(--text-muted)]">{label}</dt>
    <dd className="truncate text-right font-medium">{value}</dd>
  </div>
);
