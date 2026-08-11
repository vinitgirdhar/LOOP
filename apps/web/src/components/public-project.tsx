/*
  Presentation for the guest page.

  Deliberately server components with no 'use client' directive: the public
  view ships no JavaScript beyond what Next needs, because nothing on it is
  interactive and a reader with a link should not be paying for a bundle.
*/

const STATUS_LABEL: Record<string, string> = {
  backlog: 'Backlog',
  todo: 'To do',
  in_progress: 'In progress',
  in_review: 'In review',
  blocked: 'Blocked',
  done: 'Done',
};

export function PublicProgress({
  progress,
  deadline,
}: {
  progress: { total: number; done: number; percent: number; overdue: number };
  deadline: string | null;
}) {
  return (
    <section className="mt-6 grid gap-3 sm:grid-cols-3">
      <div className="card p-4 sm:col-span-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">Progress</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">{progress.percent}%</p>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            {progress.done} of {progress.total} tasks complete
          </p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--bg-inset)]">
          <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${progress.percent}%` }} />
        </div>
      </div>

      <Stat label="Tasks" value={progress.total} />
      <Stat label="Completed" value={progress.done} />
      <Stat label="Overdue" value={progress.overdue} tone={progress.overdue > 0 ? 'var(--danger)' : undefined} />

      {deadline && (
        <p className="text-xs text-[var(--text-faint)] sm:col-span-3">
          Target date {new Date(deadline).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      )}
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums" style={tone ? { color: tone } : undefined}>
        {value}
      </p>
    </div>
  );
}

export function PublicTasks({
  tasks,
}: {
  tasks: { id: string; key: string; title: string; status: string; priority: string; dueDate: string | null; completedAt: string | null; assignee: string | null }[];
}) {
  if (tasks.length === 0) return null;

  // Grouped by column so the guest sees the shape of the work, not a flat list.
  const groups = new Map<string, typeof tasks>();
  for (const task of tasks) {
    groups.set(task.status, [...(groups.get(task.status) ?? []), task]);
  }

  return (
    <section className="mt-8">
      <h2 className="text-[15px] font-semibold">Tasks</h2>
      <div className="mt-3 space-y-5">
        {[...groups.entries()].map(([status, rows]) => (
          <div key={status}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
              {STATUS_LABEL[status] ?? status.replace('_', ' ')} · {rows.length}
            </p>
            <ul className="mt-2 divide-y overflow-hidden rounded-[var(--radius)] border bg-[var(--surface)]">
              {rows.map((task) => (
                <li key={task.id} className="flex items-center gap-3 px-3.5 py-2.5">
                  <span className="shrink-0 font-mono text-[10px] text-[var(--text-faint)]">{task.key}</span>
                  <span className={task.completedAt ? 'truncate text-[13px] line-through opacity-55' : 'truncate text-[13px]'}>
                    {task.title}
                  </span>
                  <span className="ml-auto flex shrink-0 items-center gap-2 text-[11px] text-[var(--text-faint)]">
                    {task.assignee && <span>{task.assignee}</span>}
                    {task.dueDate && (
                      <span>{new Date(task.dueDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
