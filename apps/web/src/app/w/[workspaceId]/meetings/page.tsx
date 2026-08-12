'use client';

import { use, useState } from 'react';
import { useQuery, useUrlIntent } from '@/lib/hooks';
import { Page, PageHeader } from '@/components/page';
import { Avatar, AvatarStack, Badge, Button, EmptyState, Field, Modal, SectionTitle, Skeleton } from '@/components/ui';
import { Icon } from '@/components/icons';
import { useAuth } from '@/components/providers/auth';
import { useToast } from '@/components/providers/toast';
import { api, apiErrorMessage, API_URL } from '@/lib/api';
import { formatDateTime, relativeTime } from '@/lib/format';
import { NEW_MEET_URL, PROVIDER_LABELS, detectProvider, googleCalendarUrl } from '@/lib/meeting-links';

interface Meeting {
  id: string;
  title: string;
  agenda: string | null;
  notes: string | null;
  location: string | null;
  meetingUrl: string | null;
  conferenceProvider: string | null;
  startsAt: string;
  endsAt: string;
  createdBy: { id: string; name: string; avatarUrl: string | null };
  project: { id: string; key: string; name: string } | null;
  participants: { userId: string; status: string; user: { id: string; name: string; email: string; avatarUrl: string | null } }[];
  actionItems: { id: string; number: number; title: string; status: string; completedAt: string | null; assignee: { id: string; name: string } | null }[];
}

export default function MeetingsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = use(params);
  const { can, user } = useAuth();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<Meeting | null>(null);
  const [actionItem, setActionItem] = useState('');

  useUrlIntent('new', () => can('meeting.manage') && setCreating(true));

  const { data, loading, refetch } = useQuery<Meeting[]>('/api/meetings', [workspaceId]);
  const { data: members } = useQuery<{ user: { id: string; name: string; avatarUrl: string | null } }[]>(`/api/workspaces/${workspaceId}/members`, [workspaceId]);
  const { data: projects } = useQuery<{ id: string; key: string; name: string }[]>('/api/projects', [workspaceId]);

  const now = Date.now();
  const upcoming = (data ?? []).filter((m) => new Date(m.endsAt).getTime() >= now);
  const past = (data ?? []).filter((m) => new Date(m.endsAt).getTime() < now).reverse();

  return (
    <Page>
      <PageHeader
        title="Meetings"
        subtitle="Agenda, notes and action items that become real tasks"
        actions={
          can('meeting.manage') && (
            <Button variant="primary" size="sm" icon={<Icon.plus width={15} height={15} />} onClick={() => setCreating(true)}>
              New meeting
            </Button>
          )
        }
      />

      {loading && !data ? (
        <Skeleton className="h-48 w-full" />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          title="No meetings scheduled"
          description="Meetings carry an agenda, notes, participants and action items you can turn into tasks."
          icon={<Icon.video width={26} height={26} />}
          action={can('meeting.manage') ? <Button variant="primary" size="sm" onClick={() => setCreating(true)}>Schedule one</Button> : undefined}
        />
      ) : (
        <div className="space-y-5">
          {[
            { label: 'Upcoming', rows: upcoming },
            { label: 'Past', rows: past },
          ].map((group) =>
            group.rows.length === 0 ? null : (
              <section key={group.label}>
                <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">{group.label}</h2>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {group.rows.map((meeting) => (
                    <button key={meeting.id} type="button" onClick={() => setOpen(meeting)} className="card p-4 text-left transition-colors hover:border-[var(--border-strong)]">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="truncate text-sm font-semibold">{meeting.title}</h3>
                        {meeting.actionItems.length > 0 && <Badge tone="accent">{meeting.actionItems.length} actions</Badge>}
                      </div>
                      <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                        {formatDateTime(meeting.startsAt)} · {Math.round((new Date(meeting.endsAt).getTime() - new Date(meeting.startsAt).getTime()) / 60_000)} min
                      </p>
                      {meeting.agenda && <p className="mt-2 line-clamp-2 text-[13px] text-[var(--text-muted)]">{meeting.agenda}</p>}
                      <div className="mt-3 flex items-center justify-between border-t pt-2">
                        <AvatarStack people={meeting.participants.map((p) => p.user)} size={20} />
                        {meeting.project && <span className="text-[10px] text-[var(--text-faint)]">{meeting.project.key}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ),
          )}
        </div>
      )}

      <Modal open={Boolean(open)} onClose={() => setOpen(null)} title={open?.title ?? ''} wide>
        {open && (
          <div className="space-y-4">
            {/* Joining and saving to a personal calendar are the two things a
                reader actually wants from a meeting record, so they sit above
                the metadata rather than under the notes. */}
            <div className="flex flex-wrap items-center gap-2">
              {open.meetingUrl && (
                <a href={open.meetingUrl} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">
                  <Icon.video width={14} height={14} />
                  Join {PROVIDER_LABELS[detectProvider(open.meetingUrl) ?? 'other']}
                </a>
              )}
              <a
                href={googleCalendarUrl({
                  title: open.title,
                  startsAt: open.startsAt,
                  endsAt: open.endsAt,
                  details: open.agenda,
                  location: open.location,
                  meetingUrl: open.meetingUrl,
                })}
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary btn-sm"
              >
                <Icon.calendar width={14} height={14} />
                Add to Google Calendar
              </a>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--text-muted)]">
              <Icon.clock width={13} height={13} />
              {formatDateTime(open.startsAt)} → {new Date(open.endsAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              {open.location && <span>· {open.location}</span>}
              <span>· created by {open.createdBy.name}</span>
              <a
                href={`${API_URL}/api/meetings/${open.id}/invite.ics?workspaceId=${workspaceId}`}
                className="btn btn-secondary btn-sm ml-auto"
                onClick={async (event) => {
                  // Fetch it so a failure surfaces as a toast rather than a broken download.
                  event.preventDefault();
                  try {
                    const { data: ics } = await api.raw<string>(`/api/meetings/${open.id}/invite.ics`, { raw: true });
                    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
                    const anchor = document.createElement('a');
                    anchor.href = url;
                    anchor.download = `${open.title.replace(/\W+/g, '-').toLowerCase()}.ics`;
                    anchor.click();
                    URL.revokeObjectURL(url);
                  } catch (caught: unknown) {
                    toast.error(apiErrorMessage(caught));
                  }
                }}
              >
                <Icon.download width={13} height={13} /> Calendar invite
              </a>
            </div>

            {open.agenda && (
              <div>
                <SectionTitle title="Agenda" />
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--text-muted)]">{open.agenda}</p>
              </div>
            )}

            <div>
              <SectionTitle title="Notes" />
              <textarea
                className="textarea"
                defaultValue={open.notes ?? ''}
                placeholder="Decisions, context, anything worth keeping…"
                disabled={!can('meeting.manage')}
                onBlur={async (event) => {
                  if (event.target.value === (open.notes ?? '')) return;
                  await api.patch(`/api/meetings/${open.id}`, { notes: event.target.value || null });
                  toast.success('Notes saved');
                  void refetch();
                }}
              />
            </div>

            <div>
              <SectionTitle title="Participants" />
              <ul className="space-y-1.5">
                {open.participants.map((participant) => (
                  <li key={participant.userId} className="flex items-center gap-2.5">
                    <Avatar seed={participant.user.id} name={participant.user.name} src={participant.user.avatarUrl} size={24} />
                    <span className="min-w-0 flex-1 truncate text-[13px]">{participant.user.name}</span>
                    <Badge tone={participant.status === 'ACCEPTED' ? 'success' : participant.status === 'DECLINED' ? 'danger' : 'neutral'}>
                      {participant.status.toLowerCase()}
                    </Badge>
                    {participant.userId === user?.id && (
                      <select
                        className="select w-auto text-xs"
                        defaultValue={participant.status}
                        onChange={async (event) => {
                          await api.post(`/api/meetings/${open.id}/rsvp`, { status: event.target.value });
                          void refetch();
                        }}
                      >
                        <option value="ACCEPTED">Going</option>
                        <option value="DECLINED">Not going</option>
                        <option value="INVITED">Maybe</option>
                      </select>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <SectionTitle title="Action items" subtitle="Each one becomes a real task on the board" />
              {open.actionItems.length > 0 && (
                <ul className="mb-2 space-y-1">
                  {open.actionItems.map((item) => (
                    <li key={item.id} className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[13px]">
                      <span className={`h-2 w-2 rounded-full ${item.completedAt ? 'bg-[var(--success)]' : 'bg-[var(--border-strong)]'}`} />
                      <span className="min-w-0 flex-1 truncate">{item.title}</span>
                      {item.assignee && <span className="text-[11px] text-[var(--text-muted)]">{item.assignee.name}</span>}
                    </li>
                  ))}
                </ul>
              )}
              {can('task.create') && (
                <form
                  className="flex gap-2"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (!actionItem.trim()) return;
                    try {
                      await api.post(`/api/meetings/${open.id}/action-items`, {
                        title: actionItem.trim(),
                        ...(open.project ? {} : { projectId: projects?.[0]?.id }),
                      });
                      setActionItem('');
                      toast.success('Action item created as a task');
                      void refetch();
                      setOpen(null);
                    } catch (caught: unknown) {
                      toast.error(apiErrorMessage(caught));
                    }
                  }}
                >
                  <input className="input" placeholder="Add an action item" value={actionItem} onChange={(e) => setActionItem(e.target.value)} />
                  <Button type="submit" disabled={!actionItem.trim()}>
                    Add
                  </Button>
                </form>
              )}
            </div>

            <p className="text-[10px] text-[var(--text-faint)]">Created {relativeTime(open.startsAt)}</p>
          </div>
        )}
      </Modal>

      <CreateMeetingModal
        open={creating}
        members={(members ?? []).map((m) => m.user)}
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

function CreateMeetingModal({
  open,
  members,
  projects,
  onClose,
  onCreated,
}: {
  open: boolean;
  members: { id: string; name: string; avatarUrl: string | null }[];
  projects: { id: string; key: string; name: string }[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const soon = new Date(Date.now() + 3600_000);
  const [form, setForm] = useState({
    title: '',
    agenda: '',
    projectId: '',
    location: '',
    meetingUrl: '',
    startsAt: new Date(soon.getTime() - soon.getTimezoneOffset() * 60_000).toISOString().slice(0, 16),
    minutes: '30',
  });
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New meeting"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={loading}
            disabled={form.title.trim().length < 2}
            onClick={async () => {
              setLoading(true);
              try {
                const startsAt = new Date(form.startsAt);
                await api.post('/api/meetings', {
                  title: form.title.trim(),
                  ...(form.agenda.trim() ? { agenda: form.agenda.trim() } : {}),
                  ...(form.projectId ? { projectId: form.projectId } : {}),
                  ...(form.location.trim() ? { location: form.location.trim() } : {}),
                  ...(form.meetingUrl.trim() ? { meetingUrl: form.meetingUrl.trim() } : {}),
                  startsAt: startsAt.toISOString(),
                  endsAt: new Date(startsAt.getTime() + Number(form.minutes) * 60_000).toISOString(),
                  participantIds,
                });
                toast.success('Meeting scheduled');
                onCreated();
              } catch (caught: unknown) {
                toast.error(apiErrorMessage(caught));
              } finally {
                setLoading(false);
              }
            }}
          >
            Schedule
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field
          label="Video call link"
          hint="Paste a Meet, Zoom or Teams link. Create Meet opens Google's new-room page — paste the link it gives you back here."
        >
          <div className="flex gap-2">
            <input
              className="input font-mono text-[12px]"
              placeholder="https://meet.google.com/abc-defg-hij"
              value={form.meetingUrl}
              onChange={(e) => setForm({ ...form, meetingUrl: e.target.value })}
            />
            <a href={NEW_MEET_URL} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm shrink-0">
              Create Meet
            </a>
          </div>
        </Field>
        <Field label="Title" required>
          <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Sprint review" autoFocus />
        </Field>
        <Field label="Agenda">
          <textarea className="textarea min-h-20" value={form.agenda} onChange={(e) => setForm({ ...form, agenda: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts">
            <input type="datetime-local" className="input" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
          </Field>
          <Field label="Duration (min)">
            <input type="number" min={5} step={5} className="input" value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Project">
            <select className="select" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
              <option value="">No project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.key} · {project.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Location">
            <input className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Meet link or room" />
          </Field>
        </div>
        <Field label="Participants">
          <div className="scroll-thin max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2">
            {members.map((member) => (
              <label key={member.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-[var(--bg-inset)]">
                <input
                  type="checkbox"
                  checked={participantIds.includes(member.id)}
                  onChange={(e) => setParticipantIds((current) => (e.target.checked ? [...current, member.id] : current.filter((id) => id !== member.id)))}
                />
                <Avatar seed={member.id} name={member.name} src={member.avatarUrl} size={20} />
                <span className="text-[13px]">{member.name}</span>
              </label>
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  );
}
