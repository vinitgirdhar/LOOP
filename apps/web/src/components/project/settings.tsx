'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PRIORITIES, PROJECT_STATUSES } from '@loop/shared';
import { Avatar, Button, Card, CloseIcon, Confirm, EmptyState, Field, SectionTitle } from '@/components/ui';
import { Icon } from '@/components/icons';
import { useQuery } from '@/lib/hooks';
import { useAuth } from '@/components/providers/auth';
import { useToast } from '@/components/providers/toast';
import { api, apiErrorMessage } from '@/lib/api';
import { formatShortDate } from '@/lib/format';

interface ProjectShape {
  id: string;
  key: string;
  name: string;
  description: string | null;
  status: string;
  priority: string;
  deadline: string | null;
  color: string;
  autoApply: boolean;
  columns: { id: string; key: string; name: string; order: number; isDone: boolean; wipLimit: number | null; color: string }[];
  members: { id: string; role: string; user: { id: string; name: string; email: string; avatarUrl: string | null } }[];
  milestones: { id: string; title: string; dueDate: string | null; completedAt: string | null }[];
  labels: { id: string; name: string; color: string }[];
}

export function ProjectSettings({ project, workspaceId, onChanged }: { project: ProjectShape; workspaceId: string; onChanged: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { can } = useAuth();
  const readOnly = !can('project.update');

  const [form, setForm] = useState({
    name: project.name,
    description: project.description ?? '',
    status: project.status,
    priority: project.priority,
    deadline: project.deadline ? project.deadline.slice(0, 10) : '',
    color: project.color,
  });
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [newColumn, setNewColumn] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newMilestone, setNewMilestone] = useState({ title: '', dueDate: '' });
  const [addMember, setAddMember] = useState('');

  const { data: workspaceMembers } = useQuery<{ user: { id: string; name: string; avatarUrl: string | null } }[]>(
    `/api/workspaces/${workspaceId}/members`,
    [workspaceId],
  );

  const save = async (patch: Record<string, unknown>) => {
    setSaving(true);
    try {
      await api.patch(`/api/projects/${project.id}`, patch);
      toast.success('Project updated');
      onChanged();
    } catch (caught: unknown) {
      toast.error(apiErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  const available = (workspaceMembers ?? []).filter((m) => !project.members.some((pm) => pm.user.id === m.user.id));

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <SectionTitle title="Details" />
        <div className="space-y-3">
          <Field label="Name">
            <input className="input" value={form.name} disabled={readOnly} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Description">
            <textarea className="textarea" value={form.description} disabled={readOnly} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <select className="select" value={form.status} disabled={readOnly} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {PROJECT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status.replace('_', ' ').toLowerCase()}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Priority">
              <select className="select" value={form.priority} disabled={readOnly} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                {PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority.toLowerCase()}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Deadline">
              <input type="date" className="input" value={form.deadline} disabled={readOnly} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
            </Field>
            <Field label="Colour">
              <input type="color" className="input h-10 cursor-pointer p-1" value={form.color} disabled={readOnly} onChange={(e) => setForm({ ...form, color: e.target.value })} />
            </Field>
          </div>
          {!readOnly && (
            <Button
              variant="primary"
              loading={saving}
              onClick={() =>
                void save({
                  name: form.name,
                  description: form.description || null,
                  status: form.status,
                  priority: form.priority,
                  deadline: form.deadline || null,
                  color: form.color,
                })
              }
            >
              Save changes
            </Button>
          )}
        </div>
      </Card>

      <Card>
        <SectionTitle title="Auto-Pilot" subtitle="How suggestions from commits and chat are handled" />
        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border p-3">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={project.autoApply}
            disabled={readOnly}
            onChange={(e) => void save({ autoApply: e.target.checked })}
          />
          <span>
            <span className="block text-[13px] font-medium">Auto-apply high confidence suggestions</span>
            <span className="mt-0.5 block text-[11px] leading-relaxed text-[var(--text-muted)]">
              Only rule-based proposals at 90% confidence or higher apply on their own — a pull request naming a task, for example. Suggestions matched by the
              language model are capped below that threshold and always wait for a human. Everything applied this way is still written to the audit log.
            </span>
          </span>
        </label>
      </Card>

      <Card>
        <SectionTitle title="Board columns" subtitle="Rename, reorder or add your own" />
        <ul className="space-y-1.5">
          {project.columns.map((column) => (
            <li key={column.id} className="flex items-center gap-2 rounded-lg border px-2.5 py-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: column.color }} />
              <input
                className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
                defaultValue={column.name}
                disabled={readOnly}
                onBlur={async (e) => {
                  if (e.target.value.trim() && e.target.value !== column.name) {
                    await api.patch(`/api/projects/${project.id}/columns/${column.id}`, { name: e.target.value.trim() });
                    onChanged();
                  }
                }}
              />
              {column.isDone && <span className="badge bg-[var(--success-soft)] text-[var(--success)]">done</span>}
              <input
                type="number"
                min={1}
                placeholder="WIP"
                defaultValue={column.wipLimit ?? ''}
                disabled={readOnly}
                className="w-16 rounded-md border bg-transparent px-1.5 py-0.5 text-[11px]"
                onBlur={async (e) => {
                  const value = e.target.value ? Number(e.target.value) : null;
                  if (value !== column.wipLimit) {
                    await api.patch(`/api/projects/${project.id}/columns/${column.id}`, { wipLimit: value });
                    onChanged();
                  }
                }}
              />
              {!readOnly && project.columns.length > 2 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-icon btn-sm text-[var(--danger)]"
                  aria-label={`Delete ${column.name}`}
                  onClick={async () => {
                    try {
                      await api.del(`/api/projects/${project.id}/columns/${column.id}`);
                      toast.success('Column removed, its tasks were moved');
                      onChanged();
                    } catch (caught: unknown) {
                      toast.error(apiErrorMessage(caught));
                    }
                  }}
                >
                  <Icon.trash width={13} height={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
        {!readOnly && (
          <form
            className="mt-3 flex gap-2"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!newColumn.trim()) return;
              await api.post(`/api/projects/${project.id}/columns`, { name: newColumn.trim() });
              setNewColumn('');
              onChanged();
            }}
          >
            <input className="input" placeholder="New column name" value={newColumn} onChange={(e) => setNewColumn(e.target.value)} />
            <Button type="submit" disabled={!newColumn.trim()}>
              Add
            </Button>
          </form>
        )}
      </Card>

      <Card>
        <SectionTitle title="Team" subtitle={`${project.members.length} on this project`} />
        <ul className="space-y-1.5">
          {project.members.map((member) => (
            <li key={member.id} className="flex items-center gap-2.5 rounded-lg border px-2.5 py-2">
              <Avatar seed={member.user.id} name={member.user.name} src={member.user.avatarUrl} size={26} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{member.user.name}</span>
                <span className="block truncate text-[11px] text-[var(--text-muted)]">{member.user.email}</span>
              </span>
              <span className="badge bg-[var(--bg-inset)] text-[var(--text-muted)]">{member.role}</span>
              {!readOnly && (
                <button
                  type="button"
                  className="btn btn-ghost btn-icon btn-sm text-[var(--danger)]"
                  aria-label={`Remove ${member.user.name}`}
                  onClick={async () => {
                    await api.del(`/api/projects/${project.id}/members/${member.user.id}`);
                    onChanged();
                  }}
                >
                  <Icon.trash width={13} height={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
        {!readOnly && available.length > 0 && (
          <div className="mt-3 flex gap-2">
            <select className="select" value={addMember} onChange={(e) => setAddMember(e.target.value)}>
              <option value="">Add someone…</option>
              {available.map((member) => (
                <option key={member.user.id} value={member.user.id}>
                  {member.user.name}
                </option>
              ))}
            </select>
            <Button
              disabled={!addMember}
              onClick={async () => {
                await api.post(`/api/projects/${project.id}/members`, { userId: addMember });
                setAddMember('');
                onChanged();
              }}
            >
              Add
            </Button>
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle title="Milestones" />
        {project.milestones.length === 0 ? (
          <EmptyState title="No milestones" description="Group tasks under a dated goal." />
        ) : (
          <ul className="space-y-1.5">
            {project.milestones.map((milestone) => (
              <li key={milestone.id} className="flex items-center gap-2.5 rounded-lg border px-2.5 py-2">
                <input
                  type="checkbox"
                  checked={Boolean(milestone.completedAt)}
                  disabled={readOnly}
                  onChange={async (e) => {
                    await api.patch(`/api/projects/${project.id}/milestones/${milestone.id}`, { completed: e.target.checked });
                    onChanged();
                  }}
                />
                <span className={`min-w-0 flex-1 truncate text-[13px] ${milestone.completedAt ? 'text-[var(--text-faint)] line-through' : ''}`}>{milestone.title}</span>
                {milestone.dueDate && <span className="text-[11px] text-[var(--text-muted)]">{formatShortDate(milestone.dueDate)}</span>}
                {!readOnly && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon btn-sm text-[var(--danger)]"
                    aria-label="Delete milestone"
                    onClick={async () => {
                      await api.del(`/api/projects/${project.id}/milestones/${milestone.id}`);
                      onChanged();
                    }}
                  >
                    <Icon.trash width={13} height={13} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {!readOnly && (
          <form
            className="mt-3 flex flex-wrap gap-2"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!newMilestone.title.trim()) return;
              await api.post(`/api/projects/${project.id}/milestones`, {
                title: newMilestone.title.trim(),
                ...(newMilestone.dueDate ? { dueDate: newMilestone.dueDate } : {}),
              });
              setNewMilestone({ title: '', dueDate: '' });
              onChanged();
            }}
          >
            <input className="input flex-1" placeholder="Milestone title" value={newMilestone.title} onChange={(e) => setNewMilestone({ ...newMilestone, title: e.target.value })} />
            <input type="date" className="input w-auto" value={newMilestone.dueDate} onChange={(e) => setNewMilestone({ ...newMilestone, dueDate: e.target.value })} />
            <Button type="submit" disabled={!newMilestone.title.trim()}>
              Add
            </Button>
          </form>
        )}
      </Card>

      <Card>
        <SectionTitle title="Labels" />
        <div className="flex flex-wrap gap-1.5">
          {project.labels.map((label) => (
            <span key={label.id} className="badge gap-1" style={{ background: `${label.color}1f`, color: label.color }}>
              {label.name}
              {!readOnly && (
                <button
                  type="button"
                  onClick={async () => {
                    await api.del(`/api/projects/${project.id}/labels/${label.id}`);
                    onChanged();
                  }}
                  aria-label={`Delete ${label.name}`}
                  className="rounded-full p-0.5 transition-colors hover:bg-[var(--bg-inset)]"
                >
                  <CloseIcon size={11} />
                </button>
              )}
            </span>
          ))}
          {project.labels.length === 0 && <p className="text-[13px] text-[var(--text-muted)]">No labels yet.</p>}
        </div>
        {!readOnly && (
          <form
            className="mt-3 flex gap-2"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!newLabel.trim()) return;
              await api.post(`/api/projects/${project.id}/labels`, { name: newLabel.trim() });
              setNewLabel('');
              onChanged();
            }}
          >
            <input className="input" placeholder="New label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
            <Button type="submit" disabled={!newLabel.trim()}>
              Add
            </Button>
          </form>
        )}
      </Card>

      {can('project.delete') && (
        <Card className="border-[var(--danger)]/30">
          <SectionTitle title="Danger zone" subtitle="Archiving hides the project but keeps every record" />
          <Button variant="danger" onClick={() => setArchiving(true)}>
            Archive project
          </Button>
        </Card>
      )}

      <Confirm
        open={archiving}
        title="Archive project"
        message={`"${project.name}" will disappear from the project list. Tasks, docs and history are kept.`}
        confirmLabel="Archive"
        onCancel={() => setArchiving(false)}
        onConfirm={async () => {
          try {
            await api.del(`/api/projects/${project.id}`);
            toast.success('Project archived');
            router.push(`/w/${workspaceId}/projects`);
          } catch (caught: unknown) {
            toast.error(apiErrorMessage(caught));
          }
        }}
      />
    </div>
  );
}
