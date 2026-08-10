'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PRIORITIES } from '@loop/shared';
import { useAuth } from '@/components/providers/auth';
import { useToast } from '@/components/providers/toast';
import { useQuery } from '@/lib/hooks';
import { Button, Field, Modal, Sheet } from '@/components/ui';
import { Icon } from '@/components/icons';
import { api, apiErrorMessage } from '@/lib/api';
import { quickActions } from './nav-items';

/**
 * The bottom bar's action slot. Navigation gets you somewhere; this gets
 * something done, which is why it is not a nav item. The list is filtered by
 * permission, so a client never sees a create action they cannot perform.
 */
export function QuickCreate({ open, onClose, workspaceId }: { open: boolean; onClose: () => void; workspaceId: string }) {
  const router = useRouter();
  const { can } = useAuth();
  const [composingTask, setComposingTask] = useState(false);

  const actions = quickActions(workspaceId).filter((action) => !action.permission || can(action.permission));

  return (
    <>
      <Sheet open={open} onClose={onClose} title="Create" description="Everything your role can add, from anywhere in the app.">
        <div className="space-y-1">
          {actions.map((action) => {
            const ActionIcon = Icon[action.icon];
            return (
              <button
                key={action.id}
                type="button"
                onClick={() => {
                  onClose();
                  if (action.id === 'task') setComposingTask(true);
                  else router.push(action.href);
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-[var(--bg-inset)]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                  <ActionIcon width={17} height={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium">{action.label}</span>
                  <span className="block text-[11px] text-[var(--text-muted)]">{action.hint}</span>
                </span>
                <Icon.chevronRight width={15} height={15} className="shrink-0 text-[var(--text-faint)]" />
              </button>
            );
          })}
        </div>
      </Sheet>

      <QuickTaskModal open={composingTask} onClose={() => setComposingTask(false)} workspaceId={workspaceId} />
    </>
  );
}

/** Create a task without first navigating to a board. */
function QuickTaskModal({ open, onClose, workspaceId }: { open: boolean; onClose: () => void; workspaceId: string }) {
  const router = useRouter();
  const toast = useToast();
  const { data: projects } = useQuery<{ id: string; key: string; name: string }[]>(open ? '/api/projects' : null, [open, workspaceId]);

  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  const target = projectId || projects?.[0]?.id || '';

  const submit = async () => {
    if (!target || title.trim().length < 2) return;
    setSaving(true);
    try {
      const { data } = await api.post<{ id: string }>('/api/tasks', {
        projectId: target,
        title: title.trim(),
        priority,
        ...(dueDate ? { dueDate } : {}),
      });
      setTitle('');
      setDueDate('');
      onClose();
      toast.success('Task created');
      router.push(`/w/${workspaceId}/tasks/${data.id}`);
    } catch (caught: unknown) {
      toast.error(apiErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New task"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} disabled={!target || title.trim().length < 2} onClick={() => void submit()}>
            Create task
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Project" required>
          <select className="select" value={target} onChange={(e) => setProjectId(e.target.value)}>
            {(projects ?? []).map((project) => (
              <option key={project.id} value={project.id}>
                {project.key} · {project.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Title" required>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs doing?"
            onKeyDown={(event) => event.key === 'Enter' && void submit()}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Priority">
            <select className="select" value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {value.charAt(0) + value.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Due date">
            <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>
        <p className="text-xs text-[var(--text-muted)]">It lands in the first column of the board you pick.</p>
      </div>
    </Modal>
  );
}
