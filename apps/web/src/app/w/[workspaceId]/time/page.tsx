'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@/lib/hooks';
import { Page, PageHeader, StatTile } from '@/components/page';
import { Avatar, Badge, Button, Card, EmptyState, Field, Modal, Progress, SectionTitle, Skeleton, Tabs } from '@/components/ui';
import { BarChart, CHART_COLORS, StackedBar } from '@/components/charts';
import { Icon } from '@/components/icons';
import { useAuth } from '@/components/providers/auth';
import { useToast } from '@/components/providers/toast';
import { api, apiErrorMessage } from '@/lib/api';
import { formatDuration, formatShortDate } from '@/lib/format';

interface Running {
  id: string;
  startedAt: string;
  note: string | null;
  task: { id: string; number: number; title: string; project: { key: string } } | null;
  project: { id: string; name: string };
}

interface TimeData {
  logs: {
    id: string;
    seconds: number;
    note: string | null;
    day: string;
    startedAt: string;
    user: { id: string; name: string; avatarUrl: string | null };
    project: { id: string; name: string; key: string; color: string };
    task: { id: string; number: number; title: string } | null;
  }[];
  totals: {
    seconds: number;
    byProject: { projectId: string; name: string; seconds: number }[];
    byDay: { day: string; seconds: number }[];
  };
}

interface Utilisation {
  from: string;
  to: string;
  weeks: number;
  rows: { user: { id: string; name: string; avatarUrl: string | null }; hours: number; capacityHours: number; utilisation: number }[];
}

export default function TimePage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = use(params);
  const { can } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('mine');
  const [logging, setLogging] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const { data: running, refetch: refetchRunning } = useQuery<Running | null>('/api/time/running', [workspaceId]);
  const { data, loading, refetch } = useQuery<TimeData>(`/api/time?scope=${tab === 'team' ? 'team' : 'mine'}`, [tab, workspaceId]);
  const { data: utilisation } = useQuery<Utilisation>(can('time.view.team') ? '/api/time/utilisation' : null, [workspaceId]);
  const { data: projects } = useQuery<{ id: string; key: string; name: string }[]>('/api/projects', [workspaceId]);

  useEffect(() => {
    if (!running) {
      setElapsed(0);
      return;
    }
    const tick = () => setElapsed(Math.floor((Date.now() - new Date(running.startedAt).getTime()) / 1000));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [running]);

  const tabs = [{ key: 'mine', label: 'My time' }, ...(can('time.view.team') ? [{ key: 'team', label: 'Team' }] : [])];

  return (
    <Page>
      <PageHeader
        title="Time tracking"
        subtitle="Timers, manual entries and utilisation against capacity"
        actions={
          <Button variant="primary" size="sm" icon={<Icon.plus width={15} height={15} />} onClick={() => setLogging(true)}>
            Log time
          </Button>
        }
      />

      <Card className="mb-4">
        {running ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--success)] opacity-70" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-[var(--success)]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold">
                {running.task ? `${running.task.project.key}-${running.task.number} ${running.task.title}` : running.project.name}
              </p>
              <p className="text-[11px] text-[var(--text-muted)]">{running.note ?? 'Timer running'}</p>
            </div>
            <span className="font-mono text-xl font-bold tabular-nums">{new Date(elapsed * 1000).toISOString().slice(11, 19)}</span>
            <Button
              variant="danger"
              size="sm"
              icon={<Icon.stop width={14} height={14} />}
              onClick={async () => {
                try {
                  await api.post('/api/time/stop');
                  toast.success('Timer stopped');
                  void refetchRunning();
                  void refetch();
                } catch (caught: unknown) {
                  toast.error(apiErrorMessage(caught));
                }
              }}
            >
              Stop
            </Button>
          </div>
        ) : (
          <StartTimer projects={projects ?? []} onStarted={() => { void refetchRunning(); void refetch(); }} />
        )}
      </Card>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      <div className="mt-4 space-y-4">
        {loading && !data ? (
          <Skeleton className="h-64 w-full" />
        ) : data ? (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="Logged (30 days)" value={formatDuration(data.totals.seconds)} />
              <StatTile label="Entries" value={data.logs.length} />
              <StatTile label="Projects" value={data.totals.byProject.length} />
              <StatTile label="Daily average" value={formatDuration(Math.round(data.totals.seconds / Math.max(1, data.totals.byDay.length)))} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <SectionTitle title="Hours by day" />
                <BarChart
                  data={data.totals.byDay.slice(-21).map((row) => ({ label: row.day.slice(5), value: Number((row.seconds / 3600).toFixed(1)) }))}
                  format={(value) => `${value}h`}
                />
              </Card>
              <Card>
                <SectionTitle title="Hours by project" />
                {data.totals.byProject.length === 0 ? (
                  <p className="text-[13px] text-[var(--text-muted)]">Nothing logged yet.</p>
                ) : (
                  <>
                    <StackedBar
                      segments={data.totals.byProject.map((row, index) => ({
                        label: row.name,
                        value: row.seconds,
                        color: CHART_COLORS[index % CHART_COLORS.length]!,
                      }))}
                    />
                    <ul className="mt-3 space-y-1">
                      {data.totals.byProject.map((row) => (
                        <li key={row.projectId} className="flex justify-between text-[13px]">
                          <span className="truncate text-[var(--text-muted)]">{row.name}</span>
                          <span className="font-medium tabular-nums">{formatDuration(row.seconds)}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </Card>
            </div>

            {tab === 'team' && utilisation && (
              <Card>
                <SectionTitle title="Utilisation" subtitle={`${formatShortDate(utilisation.from)} → ${formatShortDate(utilisation.to)} against weekly capacity`} />
                <ul className="space-y-2.5">
                  {utilisation.rows.map((row) => (
                    <li key={row.user.id}>
                      <div className="mb-1 flex items-center gap-2">
                        <Avatar name={row.user.name} src={row.user.avatarUrl} size={22} />
                        <span className="min-w-0 flex-1 truncate text-[13px]">{row.user.name}</span>
                        <span className="text-[11px] text-[var(--text-muted)]">
                          {row.hours}h / {row.capacityHours}h
                        </span>
                        <Badge tone={row.utilisation > 100 ? 'danger' : row.utilisation > 70 ? 'success' : 'neutral'}>{row.utilisation}%</Badge>
                      </div>
                      <Progress value={Math.min(100, row.utilisation)} tone={row.utilisation > 100 ? 'var(--danger)' : 'var(--success)'} />
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <Card padded={false}>
              <div className="px-4 pt-4">
                <SectionTitle title="Entries" />
              </div>
              {data.logs.length === 0 ? (
                <div className="px-4 pb-4">
                  <EmptyState title="No entries" description="Start a timer or log time manually." />
                </div>
              ) : (
                <ul className="divide-y">
                  {data.logs.slice(0, 60).map((log) => (
                    <li key={log.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="h-6 w-1 shrink-0 rounded-full" style={{ background: log.project.color }} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px]">
                          {log.task ? (
                            <Link href={`/w/${workspaceId}/tasks/${log.task.id}`} className="hover:underline">
                              <span className="font-mono text-[11px] text-[var(--text-faint)]">
                                {log.project.key}-{log.task.number}
                              </span>{' '}
                              {log.task.title}
                            </Link>
                          ) : (
                            log.project.name
                          )}
                        </p>
                        <p className="text-[11px] text-[var(--text-muted)]">
                          {log.day} {log.note ? `· ${log.note}` : ''} {tab === 'team' ? `· ${log.user.name}` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 font-medium tabular-nums">{formatDuration(log.seconds)}</span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon btn-sm text-[var(--danger)]"
                        aria-label="Delete entry"
                        onClick={async () => {
                          try {
                            await api.del(`/api/time/${log.id}`);
                            void refetch();
                          } catch (caught: unknown) {
                            toast.error(apiErrorMessage(caught));
                          }
                        }}
                      >
                        <Icon.trash width={13} height={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        ) : null}
      </div>

      <LogTimeModal
        open={logging}
        projects={projects ?? []}
        onClose={() => setLogging(false)}
        onLogged={() => {
          setLogging(false);
          void refetch();
        }}
      />
    </Page>
  );
}

function StartTimer({ projects, onStarted }: { projects: { id: string; key: string; name: string }[]; onStarted: () => void }) {
  const toast = useToast();
  const [projectId, setProjectId] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!projectId) return;
        setLoading(true);
        try {
          await api.post('/api/time/start', { projectId, ...(note.trim() ? { note: note.trim() } : {}) });
          setNote('');
          onStarted();
        } catch (caught: unknown) {
          toast.error(apiErrorMessage(caught));
        } finally {
          setLoading(false);
        }
      }}
    >
      <div className="min-w-40 flex-1">
        <Field label="Project">
          <select className="select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Pick a project…</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.key} · {project.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="min-w-40 flex-1">
        <Field label="What are you working on?">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note" />
        </Field>
      </div>
      <Button type="submit" variant="primary" loading={loading} disabled={!projectId} icon={<Icon.play width={14} height={14} />}>
        Start timer
      </Button>
    </form>
  );
}

function LogTimeModal({
  open,
  projects,
  onClose,
  onLogged,
}: {
  open: boolean;
  projects: { id: string; key: string; name: string }[];
  onClose: () => void;
  onLogged: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({ projectId: '', minutes: '60', note: '', date: new Date().toISOString().slice(0, 10) });
  const [loading, setLoading] = useState(false);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Log time"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={loading}
            disabled={!form.projectId || !form.minutes}
            onClick={async () => {
              setLoading(true);
              try {
                await api.post('/api/time', {
                  projectId: form.projectId,
                  minutes: Number(form.minutes),
                  ...(form.note.trim() ? { note: form.note.trim() } : {}),
                  date: new Date(form.date).toISOString(),
                });
                toast.success('Time logged');
                onLogged();
              } catch (caught: unknown) {
                toast.error(apiErrorMessage(caught));
              } finally {
                setLoading(false);
              }
            }}
          >
            Log
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
        <div className="grid grid-cols-2 gap-3">
          <Field label="Minutes" required>
            <input type="number" min={1} className="input" value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value })} />
          </Field>
          <Field label="Date">
            <input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
        </div>
        <Field label="Note">
          <input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="What did you work on?" />
        </Field>
      </div>
    </Modal>
  );
}
