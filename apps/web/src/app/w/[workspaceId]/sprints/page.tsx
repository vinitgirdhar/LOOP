'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@/lib/hooks';
import { Page, PageHeader } from '@/components/page';
import { Badge, Button, EmptyState, Field, Modal, Skeleton } from '@/components/ui';
import { Icon } from '@/components/icons';
import { useAuth } from '@/components/providers/auth';
import { useToast } from '@/components/providers/toast';
import { api, apiErrorMessage } from '@/lib/api';
import { formatShortDate } from '@/lib/format';

interface SprintRow {
  id: string;
  name: string;
  goal: string | null;
  status: string;
  startDate: string;
  endDate: string;
  capacity: number;
  project: { id: string; key: string; name: string };
  _count: { tasks: number };
}

const STATUS_TONE = { PLANNED: 'neutral', ACTIVE: 'success', COMPLETED: 'info' } as const;

export default function SprintsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = use(params);
  const { can } = useAuth();
  const [creating, setCreating] = useState(false);

  const { data, loading, refetch } = useQuery<SprintRow[]>('/api/sprints', [workspaceId]);
  const { data: projects } = useQuery<{ id: string; key: string; name: string }[]>('/api/projects', [workspaceId]);

  const grouped = {
    ACTIVE: (data ?? []).filter((s) => s.status === 'ACTIVE'),
    PLANNED: (data ?? []).filter((s) => s.status === 'PLANNED'),
    COMPLETED: (data ?? []).filter((s) => s.status === 'COMPLETED'),
  };

  return (
    <Page>
      <PageHeader
        title="Sprints"
        subtitle="Capacity, burndown and velocity per project"
        actions={
          can('sprint.manage') && (
            <Button variant="primary" size="sm" icon={<Icon.plus width={15} height={15} />} onClick={() => setCreating(true)}>
              New sprint
            </Button>
          )
        }
      />

      {loading && !data ? (
        <Skeleton className="h-48 w-full" />
      ) : !data || data.length === 0 ? (
        <EmptyState
          title="No sprints yet"
          description="A sprint groups tasks into a dated window with a points capacity, and gives you a burndown."
          icon={<Icon.sprint width={26} height={26} />}
          action={can('sprint.manage') ? <Button variant="primary" size="sm" onClick={() => setCreating(true)}>Create a sprint</Button> : undefined}
        />
      ) : (
        <div className="space-y-5">
          {(['ACTIVE', 'PLANNED', 'COMPLETED'] as const).map((status) =>
            grouped[status].length === 0 ? null : (
              <section key={status}>
                <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">{status.toLowerCase()}</h2>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {grouped[status].map((sprint) => (
                    <Link key={sprint.id} href={`/w/${workspaceId}/sprints/${sprint.id}`} className="card p-4 transition-colors hover:border-[var(--border-strong)]">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="truncate text-sm font-semibold">{sprint.name}</h3>
                        <Badge tone={STATUS_TONE[sprint.status as keyof typeof STATUS_TONE]}>{sprint.status.toLowerCase()}</Badge>
                      </div>
                      <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                        {sprint.project.key} · {sprint.project.name}
                      </p>
                      {sprint.goal && <p className="mt-2 line-clamp-2 text-[13px] text-[var(--text-muted)]">{sprint.goal}</p>}
                      <p className="mt-3 border-t pt-2 text-[11px] text-[var(--text-muted)]">
                        {formatShortDate(sprint.startDate)} → {formatShortDate(sprint.endDate)} · {sprint._count.tasks} tasks · {sprint.capacity} pts capacity
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            ),
          )}
        </div>
      )}

      <CreateSprintModal
        open={creating}
        projects={projects ?? []}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false);
          void refetch();
        }}
      />
    </Page>
  );
}

function CreateSprintModal({
  open,
  projects,
  onClose,
  onCreated,
}: {
  open: boolean;
  projects: { id: string; key: string; name: string }[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const inTwoWeeks = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);

  const [form, setForm] = useState({ projectId: '', name: '', goal: '', startDate: today, endDate: inTwoWeeks, capacity: '40' });
  const [loading, setLoading] = useState(false);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New sprint"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={loading}
            disabled={!form.projectId || form.name.trim().length < 2}
            onClick={async () => {
              setLoading(true);
              try {
                await api.post('/api/sprints', {
                  projectId: form.projectId,
                  name: form.name.trim(),
                  ...(form.goal.trim() ? { goal: form.goal.trim() } : {}),
                  startDate: form.startDate,
                  endDate: form.endDate,
                  capacity: Number(form.capacity),
                });
                toast.success('Sprint created');
                onCreated();
              } catch (caught: unknown) {
                toast.error(apiErrorMessage(caught));
              } finally {
                setLoading(false);
              }
            }}
          >
            Create sprint
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Project" required>
          <select className="select" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
            <option value="">Pick a project…</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.key} · {project.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Name" required>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Sprint 4" />
        </Field>
        <Field label="Goal">
          <textarea className="textarea min-h-16" value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} placeholder="What does done look like?" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts">
            <input type="date" className="input" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </Field>
          <Field label="Ends">
            <input type="date" className="input" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </Field>
        </div>
        <Field label="Capacity (story points)">
          <input type="number" min={1} className="input" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}
