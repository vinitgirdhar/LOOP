'use client';

import { Suspense, use, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { PRIORITIES, PROJECT_STATUSES } from '@loop/shared';
import { useQuery } from '@/lib/hooks';
import { Page, PageHeader } from '@/components/page';
import { AvatarStack, Badge, Button, Card, EmptyState, ErrorState, Field, Modal, Progress, Skeleton } from '@/components/ui';
import { FormError } from '@/components/auth-form';
import { Icon } from '@/components/icons';
import { useAuth } from '@/components/providers/auth';
import { useToast } from '@/components/providers/toast';
import { api, apiErrorMessage } from '@/lib/api';
import { STATUS_STYLE, formatShortDate, healthTone } from '@/lib/format';

interface ProjectRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  status: string;
  priority: string;
  deadline: string | null;
  color: string;
  progress: number;
  taskCount: number;
  doneCount: number;
  members: { user: { id: string; name: string; avatarUrl: string | null } }[];
  health: { score: number }[];
  _count: { tasks: number; members: number; sprints: number };
}

interface Member {
  id: string;
  user: { id: string; name: string; avatarUrl: string | null };
}

function ProjectsView({ workspaceId }: { workspaceId: string }) {
  const params = useSearchParams();
  const { can } = useAuth();
  const toast = useToast();

  const [statusFilter, setStatusFilter] = useState('');
  const [creating, setCreating] = useState(params.get('new') === '1');

  const { data, loading, error, refetch } = useQuery<ProjectRow[]>(
    `/api/projects${statusFilter ? `?status=${statusFilter}` : ''}`,
    [workspaceId, statusFilter],
  );
  const { data: members } = useQuery<Member[]>(`/api/workspaces/${workspaceId}/members`, [workspaceId]);

  return (
    <Page>
      <PageHeader
        title="Projects"
        subtitle={data ? `${data.length} project${data.length === 1 ? '' : 's'} you can see` : undefined}
        actions={
          <>
            <select className="select btn-sm w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
              <option value="">All statuses</option>
              {PROJECT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status.replace('_', ' ').toLowerCase()}
                </option>
              ))}
            </select>
            {can('project.create') && (
              <Button variant="primary" size="sm" icon={<Icon.plus width={15} height={15} />} onClick={() => setCreating(true)}>
                New project
              </Button>
            )}
          </>
        }
      />

      {error && <ErrorState message={error} onRetry={refetch} />}

      {loading && !data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : data && data.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="A project comes with a Kanban board, a wiki, a files area and its own chat channel."
          action={can('project.create') ? <Button variant="primary" onClick={() => setCreating(true)}>Create the first project</Button> : undefined}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data?.map((project) => {
            const score = project.health[0]?.score ?? null;
            const tone = score === null ? null : healthTone(score);
            return (
              <Link key={project.id} href={`/w/${workspaceId}/projects/${project.id}`} className="card flex flex-col p-4 transition-colors hover:border-[var(--border-strong)]">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: project.color }} />
                    <span className="font-mono text-[11px] font-semibold text-[var(--text-muted)]">{project.key}</span>
                  </div>
                  <span className={`badge ${STATUS_STYLE[project.status] ?? ''}`}>{project.status.replace('_', ' ').toLowerCase()}</span>
                </div>

                <h2 className="mt-2 truncate text-sm font-semibold">{project.name}</h2>
                {project.description && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--text-muted)]">{project.description}</p>}

                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                    <span>
                      {project.doneCount}/{project.taskCount} done
                    </span>
                    <span className="tabular-nums">{project.progress}%</span>
                  </div>
                  <Progress value={project.progress} tone={project.color} />
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
                  <AvatarStack people={project.members.map((m) => m.user)} size={22} />
                  <div className="flex items-center gap-1.5">
                    {project.deadline && <span className="text-[10px] text-[var(--text-muted)]">{formatShortDate(project.deadline)}</span>}
                    {tone && (
                      <span className="badge" style={{ background: `${tone.color}1a`, color: tone.color }} title={`Health ${score}/100 — ${tone.label}`}>
                        {score}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <CreateProjectModal
        open={creating}
        onClose={() => setCreating(false)}
        members={members ?? []}
        onCreated={() => {
          setCreating(false);
          toast.success('Project created');
          void refetch();
        }}
      />
    </Page>
  );
}

function CreateProjectModal({ open, onClose, members, onCreated }: { open: boolean; onClose: () => void; members: Member[]; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [deadline, setDeadline] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const autoKey = name.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New project"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={loading}
            disabled={name.trim().length < 2}
            onClick={async () => {
              setError(null);
              setLoading(true);
              try {
                await api.post('/api/projects', {
                  name: name.trim(),
                  ...(key.trim() ? { key: key.trim() } : {}),
                  ...(description.trim() ? { description: description.trim() } : {}),
                  priority,
                  ...(deadline ? { deadline } : {}),
                  color,
                  memberIds,
                });
                setName('');
                setKey('');
                setDescription('');
                setMemberIds([]);
                onCreated();
              } catch (caught: unknown) {
                setError(apiErrorMessage(caught));
              } finally {
                setLoading(false);
              }
            }}
          >
            Create project
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <FormError message={error} />
        <Field label="Name" required>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Payments Revamp" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Key" hint={`Task ids look like ${key.toUpperCase() || autoKey || 'PROJ'}-42`}>
            <input className="input font-mono uppercase" value={key} onChange={(e) => setKey(e.target.value.replace(/[^A-Za-z0-9]/g, ''))} placeholder={autoKey || 'PAY'} maxLength={8} />
          </Field>
          <Field label="Colour">
            <input type="color" className="input h-10 cursor-pointer p-1" value={color} onChange={(e) => setColor(e.target.value)} />
          </Field>
        </div>
        <Field label="Description">
          <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this project for?" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Priority">
            <select className="select" value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p.toLowerCase()}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Deadline">
            <input type="date" className="input" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </Field>
        </div>
        <Field label="Team" hint="You are added automatically as the project lead.">
          <div className="scroll-thin max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2">
            {members.map((member) => (
              <label key={member.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-[var(--bg-inset)]">
                <input
                  type="checkbox"
                  checked={memberIds.includes(member.user.id)}
                  onChange={(e) => setMemberIds((current) => (e.target.checked ? [...current, member.user.id] : current.filter((id) => id !== member.user.id)))}
                />
                <span className="text-[13px]">{member.user.name}</span>
              </label>
            ))}
          </div>
        </Field>
        <p className="text-xs text-[var(--text-muted)]">
          <Badge tone="neutral">Included</Badge> Six board columns, a wiki, a files area and a chat channel.
        </p>
      </div>
    </Modal>
  );
}

export default function ProjectsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = use(params);
  return (
    <Suspense fallback={null}>
      <ProjectsView workspaceId={workspaceId} />
    </Suspense>
  );
}
