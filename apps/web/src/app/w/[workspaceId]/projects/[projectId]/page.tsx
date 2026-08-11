'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { PRIORITIES } from '@loop/shared';
import { useQuery, useUrlIntent, useUrlTab } from '@/lib/hooks';
import { Page, PageHeader } from '@/components/page';
import { Avatar, AvatarStack, Button, Card, EmptyState, ErrorState, Field, Modal, Skeleton, Tabs } from '@/components/ui';
import { KanbanBoard, QuickAddTask } from '@/components/board/kanban';
import { HealthPanel } from '@/components/health-panel';
import { Icon } from '@/components/icons';
import { useAuth } from '@/components/providers/auth';
import { useToast } from '@/components/providers/toast';
import { api, apiErrorMessage } from '@/lib/api';
import { PRIORITY_STYLE, STATUS_STYLE, cx, formatShortDate, isOverdue, relativeTime } from '@/lib/format';
import { TaskListTable } from '@/components/board/task-list';
import { ProjectDocs } from '@/components/project/docs';
import { ProjectGantt } from '@/components/project/gantt';
import { ProjectFiles } from '@/components/project/files';
import { ProjectSettings } from '@/components/project/settings';

interface ProjectDetail {
  id: string;
  key: string;
  name: string;
  description: string | null;
  status: string;
  priority: string;
  startDate: string | null;
  deadline: string | null;
  color: string;
  autoApply: boolean;
  columns: { id: string; key: string; name: string; order: number; isDone: boolean; wipLimit: number | null; color: string }[];
  members: { id: string; role: string; user: { id: string; name: string; email: string; avatarUrl: string | null } }[];
  milestones: { id: string; title: string; dueDate: string | null; completedAt: string | null }[];
  sprints: { id: string; name: string; status: string; startDate: string; endDate: string }[];
  labels: { id: string; name: string; color: string }[];
  _count: { tasks: number; wikiPages: number; attachments: number };
}

const TABS = [
  { key: 'board', label: 'Board' },
  { key: 'list', label: 'List' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'health', label: 'Health' },
  { key: 'docs', label: 'Docs' },
  { key: 'files', label: 'Files' },
  { key: 'activity', label: 'Activity' },
  { key: 'settings', label: 'Settings' },
];

export default function ProjectPage({ params }: { params: Promise<{ workspaceId: string; projectId: string }> }) {
  const { workspaceId, projectId } = use(params);
  const { can } = useAuth();
  const [tab, setTab] = useUrlTab('board');
  const [openDocId, setOpenDocId] = useState<string | null>(null);
  const [sprintFilter, setSprintFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // A search hit or a Docs-page link arrives as ?tab=docs&page=<id>.
  useUrlIntent('page', setOpenDocId);

  const { data: project, loading, error, refetch } = useQuery<ProjectDetail>(`/api/projects/${projectId}`, [projectId]);

  if (loading && !project) {
    return (
      <Page>
        <Skeleton className="mb-4 h-16 w-full" />
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
  if (!project) return null;

  const activeSprint = project.sprints.find((s) => s.status === 'ACTIVE');

  return (
    <Page>
      <PageHeader
        back={{ href: `/w/${workspaceId}/projects`, label: 'Projects' }}
        title={
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: project.color }} />
            {project.name}
          </span>
        }
        subtitle={project.description}
        meta={
          <>
            <span className="font-mono text-[11px] text-[var(--text-muted)]">{project.key}</span>
            <span className={`badge ${STATUS_STYLE[project.status] ?? ''}`}>{project.status.replace('_', ' ').toLowerCase()}</span>
            <span className={cx('badge', PRIORITY_STYLE[project.priority]?.className)}>{PRIORITY_STYLE[project.priority]?.label}</span>
            {project.deadline && (
              <span className={cx('text-[11px]', isOverdue(project.deadline) ? 'font-semibold text-[var(--danger)]' : 'text-[var(--text-muted)]')}>
                Due {formatShortDate(project.deadline)}
              </span>
            )}
            <AvatarStack people={project.members.map((m) => m.user)} size={22} />
          </>
        }
        actions={
          <>
            {activeSprint && (
              <Link href={`/w/${workspaceId}/sprints/${activeSprint.id}`} className="btn btn-secondary btn-sm">
                <Icon.sprint width={14} height={14} /> {activeSprint.name}
              </Link>
            )}
            {can('task.create') && (
              <Button variant="primary" size="sm" icon={<Icon.plus width={15} height={15} />} onClick={() => setCreating(true)}>
                New task
              </Button>
            )}
          </>
        }
      />

      <Tabs tabs={TABS.filter((entry) => entry.key !== 'settings' || can('project.update') || can('project.delete'))} active={tab} onChange={setTab} />

      <div className="mt-4">
        {tab === 'board' && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <select className="select btn-sm w-auto" value={sprintFilter} onChange={(e) => setSprintFilter(e.target.value)} aria-label="Filter by sprint">
                <option value="">All tasks</option>
                <option value="backlog">Backlog only</option>
                {project.sprints.map((sprint) => (
                  <option key={sprint.id} value={sprint.id}>
                    {sprint.name}
                  </option>
                ))}
              </select>
              <select className="select btn-sm w-auto" value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} aria-label="Filter by assignee">
                <option value="">Everyone</option>
                <option value="me">My tasks</option>
                {project.members.map((member) => (
                  <option key={member.user.id} value={member.user.id}>
                    {member.user.name}
                  </option>
                ))}
              </select>
              <span className="ml-auto hidden text-[11px] text-[var(--text-faint)] lg:block">Drag a card to move it, or use its menu</span>
            </div>

            {addingTo && (
              <div className="mb-3 max-w-sm">
                <QuickAddTask projectId={projectId} columnKey={addingTo} onDone={() => setAddingTo(null)} onCancel={() => setAddingTo(null)} />
              </div>
            )}

            <KanbanBoard
              workspaceId={workspaceId}
              projectId={projectId}
              projectKey={project.key}
              sprintFilter={sprintFilter || undefined}
              assigneeFilter={assigneeFilter || undefined}
              onCreate={(columnKey) => setAddingTo(columnKey)}
            />
          </>
        )}

        {tab === 'list' && <TaskListTable workspaceId={workspaceId} projectId={projectId} columns={project.columns} members={project.members.map((m) => m.user)} />}

        {tab === 'timeline' && <ProjectGantt projectId={projectId} />}

        {tab === 'health' && <HealthPanel projectId={projectId} />}

        {tab === 'docs' && <ProjectDocs workspaceId={workspaceId} projectId={projectId} initialPageId={openDocId} />}

        {tab === 'files' && <ProjectFiles workspaceId={workspaceId} projectId={projectId} />}

        {tab === 'activity' && <ProjectActivity workspaceId={workspaceId} projectId={projectId} />}

        {tab === 'settings' && <ProjectSettings project={project} workspaceId={workspaceId} onChanged={refetch} />}
      </div>

      <CreateTaskModal
        open={creating}
        onClose={() => setCreating(false)}
        project={project}
        onCreated={() => {
          setCreating(false);
          void refetch();
        }}
      />
    </Page>
  );
}

function ProjectActivity({ workspaceId, projectId }: { workspaceId: string; projectId: string }) {
  const { data, loading } = useQuery<{ id: string; message: string; type: string; createdAt: string; actor: { name: string; avatarUrl: string | null } | null }[]>(
    `/api/workspaces/${workspaceId}/activity?projectId=${projectId}&limit=50`,
    [workspaceId, projectId],
  );

  if (loading && !data) return <Skeleton className="h-64 w-full" />;
  if (!data || data.length === 0) return <EmptyState title="No activity yet" description="Task moves, comments and GitHub events land here." />;

  return (
    <Card padded={false}>
      <ul className="divide-y">
        {data.map((entry) => (
          <li key={entry.id} className="flex items-start gap-2.5 px-4 py-2.5">
            {entry.actor ? (
              <Avatar name={entry.actor.name} src={entry.actor.avatarUrl} size={24} />
            ) : (
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                <Icon.bolt width={12} height={12} />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[13px] leading-snug">{entry.message}</p>
              <p className="mt-0.5 text-[10px] text-[var(--text-faint)]">
                <span className="font-mono">{entry.type}</span> · {relativeTime(entry.createdAt)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function CreateTaskModal({ open, onClose, project, onCreated }: { open: boolean; onClose: () => void; project: ProjectDetail; onCreated: () => void }) {
  const toast = useToast();
  const { can } = useAuth();
  const [form, setForm] = useState({ title: '', description: '', status: '', priority: 'MEDIUM', assigneeId: '', dueDate: '', storyPoints: '', sprintId: '', recurrence: '' });
  const [checklist, setChecklist] = useState('');
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New task"
      wide
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={loading}
            disabled={form.title.trim().length < 2}
            onClick={async () => {
              setError(null);
              setLoading(true);
              try {
                await api.post('/api/tasks', {
                  projectId: project.id,
                  title: form.title.trim(),
                  ...(form.description.trim() ? { description: form.description.trim() } : {}),
                  ...(form.status ? { status: form.status } : {}),
                  priority: form.priority,
                  ...(form.assigneeId ? { assigneeId: form.assigneeId } : {}),
                  ...(form.dueDate ? { dueDate: form.dueDate } : {}),
                  ...(form.storyPoints ? { storyPoints: Number(form.storyPoints) } : {}),
                  ...(form.sprintId ? { sprintId: form.sprintId } : {}),
                  ...(form.recurrence ? { recurrence: form.recurrence } : {}),
                  labelIds,
                  checklist: checklist.split('\n').map((line) => line.trim()).filter(Boolean),
                });
                setForm({ title: '', description: '', status: '', priority: 'MEDIUM', assigneeId: '', dueDate: '', storyPoints: '', sprintId: '', recurrence: '' });
                setChecklist('');
                setLabelIds([]);
                toast.success('Task created');
                onCreated();
              } catch (caught: unknown) {
                setError(apiErrorMessage(caught));
              } finally {
                setLoading(false);
              }
            }}
          >
            Create task
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <p className="rounded-lg bg-[var(--danger-soft)] px-3 py-2 text-[13px] text-[var(--danger)]">{error}</p>}
        <Field label="Title" required>
          <input className="input" value={form.title} onChange={set('title')} placeholder="What needs doing?" autoFocus />
        </Field>
        <Field label="Description">
          <textarea className="textarea" value={form.description} onChange={set('description')} />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Column">
            <select className="select" value={form.status} onChange={set('status')}>
              {project.columns.map((column) => (
                <option key={column.id} value={column.key}>
                  {column.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Priority">
            <select className="select" value={form.priority} onChange={set('priority')}>
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {priority.toLowerCase()}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Assignee">
            <select className="select" value={form.assigneeId} onChange={set('assigneeId')} disabled={!can('task.assign')}>
              <option value="">Unassigned</option>
              {project.members.map((member) => (
                <option key={member.user.id} value={member.user.id}>
                  {member.user.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Due date">
            <input type="date" className="input" value={form.dueDate} onChange={set('dueDate')} />
          </Field>
          <Field label="Story points">
            <input type="number" min={0} max={100} className="input" value={form.storyPoints} onChange={set('storyPoints')} placeholder="5" />
          </Field>
          <Field label="Sprint">
            <select className="select" value={form.sprintId} onChange={set('sprintId')}>
              <option value="">Backlog</option>
              {project.sprints.map((sprint) => (
                <option key={sprint.id} value={sprint.id}>
                  {sprint.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Repeats" hint="A completed recurring task immediately clones itself for the next cycle.">
          <select className="select" value={form.recurrence} onChange={set('recurrence')}>
            <option value="">Does not repeat</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </Field>

        {project.labels.length > 0 && (
          <Field label="Labels">
            <div className="flex flex-wrap gap-1.5">
              {project.labels.map((label) => {
                const on = labelIds.includes(label.id);
                return (
                  <button
                    key={label.id}
                    type="button"
                    onClick={() => setLabelIds((current) => (on ? current.filter((id) => id !== label.id) : [...current, label.id]))}
                    className="badge border transition-opacity"
                    style={{ background: on ? `${label.color}26` : 'transparent', color: on ? label.color : 'var(--text-muted)', borderColor: on ? label.color : 'var(--border)' }}
                  >
                    {label.name}
                  </button>
                );
              })}
            </div>
          </Field>
        )}

        <Field label="Checklist" hint="One item per line.">
          <textarea className="textarea min-h-20" value={checklist} onChange={(e) => setChecklist(e.target.value)} placeholder={'Design agreed\nImplementation\nTests written'} />
        </Field>
      </div>
    </Modal>
  );
}
