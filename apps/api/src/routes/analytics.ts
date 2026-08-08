import { Router } from 'express';
import { prisma } from '@loop/db';
import { atLeast } from '@loop/shared';
import { ah, ok } from '../lib/http.js';
import { requireAuth, requirePermission, workspaceContext } from '../middleware/auth.js';
import { computeHealth } from '../services/health.js';

export const analyticsRouter: Router = Router();
export const dashboardRouter: Router = Router();

const base = [requireAuth, workspaceContext()];

async function scopedProjectIds(workspaceId: string, userId: string, role: string): Promise<string[] | null> {
  if (atLeast(role as never, 'PM')) return null;
  const rows = await prisma.projectMember.findMany({ where: { userId, project: { workspaceId } }, select: { projectId: true } });
  return rows.map((r) => r.projectId);
}

// ───────────────────────── dashboard ─────────────────────────

dashboardRouter.get(
  '/',
  ...base,
  ah(async (req, res) => {
    const workspaceId = req.ws!.workspaceId;
    const userId = req.user!.id;
    const ids = await scopedProjectIds(workspaceId, userId, req.ws!.role);
    const projectScope = ids === null ? {} : { projectId: { in: ids } };
    const soon = new Date(Date.now() + 7 * 86_400_000);
    const weekAgoDay = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);

    const [activeProjects, myTasks, upcoming, activeSprints, recentActivity, unread, loggedWeek, doneWeek] = await Promise.all([
      prisma.project.findMany({
        where: { workspaceId, ...(ids === null ? {} : { id: { in: ids } }), status: 'ACTIVE', archivedAt: null },
        take: 6,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true, key: true, name: true, color: true, deadline: true,
          _count: { select: { tasks: true } },
          health: { orderBy: { createdAt: 'desc' }, take: 1, select: { score: true } },
        },
      }),
      prisma.task.findMany({
        where: { workspaceId, assigneeId: userId, completedAt: null },
        take: 10,
        orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { priority: 'desc' }],
        select: { id: true, number: true, title: true, status: true, priority: true, dueDate: true, isBlocked: true, project: { select: { key: true, color: true } } },
      }),
      prisma.task.findMany({
        where: { workspaceId, ...projectScope, completedAt: null, dueDate: { gte: new Date(), lte: soon } },
        take: 10,
        orderBy: { dueDate: 'asc' },
        select: { id: true, number: true, title: true, dueDate: true, assignee: { select: { name: true, avatarUrl: true } }, project: { select: { key: true } } },
      }),
      prisma.sprint.findMany({
        where: { workspaceId, status: 'ACTIVE', ...projectScope },
        include: { project: { select: { key: true, name: true } }, tasks: { select: { storyPoints: true, completedAt: true } } },
      }),
      prisma.activityLog.findMany({
        where: { workspaceId },
        take: 12,
        orderBy: { createdAt: 'desc' },
        include: { actor: { select: { id: true, name: true, avatarUrl: true } } },
      }),
      prisma.notification.count({ where: { workspaceId, userId, readAt: null } }),
      prisma.timeLog.aggregate({ where: { workspaceId, userId, day: { gte: weekAgoDay }, isRunning: false }, _sum: { seconds: true } }),
      prisma.task.count({ where: { workspaceId, assigneeId: userId, completedAt: { gte: new Date(Date.now() - 7 * 86_400_000) } } }),
    ]);

    const sprintProgress = activeSprints.map((s) => {
      const total = s.tasks.reduce((sum, t) => sum + (t.storyPoints ?? 0), 0);
      const done = s.tasks.filter((t) => t.completedAt).reduce((sum, t) => sum + (t.storyPoints ?? 0), 0);
      return {
        id: s.id,
        name: s.name,
        project: s.project.key,
        endDate: s.endDate,
        totalPoints: total,
        donePoints: done,
        percent: total === 0 ? 0 : Math.round((done / total) * 100),
        daysLeft: Math.max(0, Math.ceil((s.endDate.getTime() - Date.now()) / 86_400_000)),
      };
    });

    const hoursWeek = Number(((loggedWeek._sum.seconds ?? 0) / 3600).toFixed(1));
    // Simple, explainable productivity index: throughput + logged hours vs a 5-task / 20-hour week.
    const productivityScore = Math.min(100, Math.round((doneWeek / 5) * 60 + Math.min(1, hoursWeek / 20) * 40));

    return ok(res, {
      activeProjects: activeProjects.map((p) => ({ ...p, health: p.health[0]?.score ?? null })),
      myTasks,
      upcomingDeadlines: upcoming,
      sprintProgress,
      recentActivity,
      unreadNotifications: unread,
      productivity: { score: productivityScore, tasksCompletedThisWeek: doneWeek, hoursThisWeek: hoursWeek },
    });
  }),
);

// ───────────────────────── analytics ─────────────────────────

analyticsRouter.get(
  '/overview',
  ...base,
  requirePermission('workspace.analytics.view'),
  ah(async (req, res) => {
    const workspaceId = req.ws!.workspaceId;
    const since = new Date(Date.now() - 30 * 86_400_000);
    const sinceDay = since.toISOString().slice(0, 10);

    const [projects, tasksTotal, tasksDone, tasksOverdue, blocked, members, timeAgg, completions] = await Promise.all([
      prisma.project.count({ where: { workspaceId, archivedAt: null } }),
      prisma.task.count({ where: { workspaceId } }),
      prisma.task.count({ where: { workspaceId, completedAt: { not: null } } }),
      prisma.task.count({ where: { workspaceId, completedAt: null, dueDate: { lt: new Date() } } }),
      prisma.task.count({ where: { workspaceId, isBlocked: true, completedAt: null } }),
      prisma.workspaceMember.count({ where: { workspaceId } }),
      prisma.timeLog.aggregate({ where: { workspaceId, day: { gte: sinceDay }, isRunning: false }, _sum: { seconds: true } }),
      prisma.task.findMany({
        where: { workspaceId, completedAt: { gte: since } },
        select: { completedAt: true, storyPoints: true },
      }),
    ]);

    const byDay = new Map<string, { tasks: number; points: number }>();
    for (const t of completions) {
      const key = t.completedAt!.toISOString().slice(0, 10);
      const row = byDay.get(key) ?? { tasks: 0, points: 0 };
      row.tasks += 1;
      row.points += t.storyPoints ?? 0;
      byDay.set(key, row);
    }

    return ok(res, {
      totals: {
        projects,
        tasks: tasksTotal,
        completed: tasksDone,
        overdue: tasksOverdue,
        blocked,
        members,
        completionRate: tasksTotal === 0 ? 0 : Math.round((tasksDone / tasksTotal) * 100),
        hoursLogged30d: Number(((timeAgg._sum.seconds ?? 0) / 3600).toFixed(1)),
      },
      throughput: [...byDay.entries()].map(([day, v]) => ({ day, ...v })).sort((a, b) => a.day.localeCompare(b.day)),
    });
  }),
);

analyticsRouter.get(
  '/workload',
  ...base,
  requirePermission('workspace.analytics.view'),
  ah(async (req, res) => {
    const workspaceId = req.ws!.workspaceId;
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      select: { capacityHrs: true, role: true, user: { select: { id: true, name: true, avatarUrl: true } } },
    });

    const grouped = await prisma.task.groupBy({
      by: ['assigneeId'],
      where: { workspaceId, completedAt: null },
      _count: { _all: true },
      _sum: { storyPoints: true },
    });
    const overdueGrouped = await prisma.task.groupBy({
      by: ['assigneeId'],
      where: { workspaceId, completedAt: null, dueDate: { lt: new Date() } },
      _count: { _all: true },
    });

    const open = new Map(grouped.map((g) => [g.assigneeId, g]));
    const late = new Map(overdueGrouped.map((g) => [g.assigneeId, g._count._all]));

    return ok(
      res,
      members.map((m) => ({
        user: m.user,
        role: m.role,
        capacityHrs: m.capacityHrs,
        openTasks: open.get(m.user.id)?._count._all ?? 0,
        openPoints: open.get(m.user.id)?._sum.storyPoints ?? 0,
        overdue: late.get(m.user.id) ?? 0,
      })),
    );
  }),
);

analyticsRouter.get(
  '/projects',
  ...base,
  requirePermission('workspace.analytics.view'),
  ah(async (req, res) => {
    const projects = await prisma.project.findMany({
      where: { workspaceId: req.ws!.workspaceId, archivedAt: null },
      select: { id: true, key: true, name: true, color: true, status: true, deadline: true },
    });

    const rows = await Promise.all(
      projects.map(async (p) => {
        const [total, done, overdue, health] = await Promise.all([
          prisma.task.count({ where: { projectId: p.id } }),
          prisma.task.count({ where: { projectId: p.id, completedAt: { not: null } } }),
          prisma.task.count({ where: { projectId: p.id, completedAt: null, dueDate: { lt: new Date() } } }),
          computeHealth(p.id),
        ]);
        return {
          ...p,
          tasks: total,
          done,
          overdue,
          progress: total === 0 ? 0 : Math.round((done / total) * 100),
          health: health.score,
        };
      }),
    );
    return ok(res, rows);
  }),
);

/** CSV export for the "generate reports" permission. */
analyticsRouter.get(
  '/export.csv',
  ...base,
  requirePermission('report.generate'),
  ah(async (req, res) => {
    const tasks = await prisma.task.findMany({
      where: { workspaceId: req.ws!.workspaceId, ...(req.query.projectId ? { projectId: String(req.query.projectId) } : {}) },
      include: {
        project: { select: { key: true, name: true } },
        assignee: { select: { name: true, email: true } },
        sprint: { select: { name: true } },
      },
      orderBy: [{ projectId: 'asc' }, { number: 'asc' }],
    });

    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['key', 'title', 'status', 'priority', 'assignee', 'sprint', 'points', 'due', 'completed', 'blocked'];
    const lines = [
      header.join(','),
      ...tasks.map((t) =>
        [
          `${t.project.key}-${t.number}`,
          t.title,
          t.status,
          t.priority,
          t.assignee?.name ?? '',
          t.sprint?.name ?? '',
          t.storyPoints ?? '',
          t.dueDate?.toISOString().slice(0, 10) ?? '',
          t.completedAt?.toISOString().slice(0, 10) ?? '',
          t.isBlocked ? 'yes' : 'no',
        ]
          .map(escape)
          .join(','),
      ),
    ];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="loop-tasks.csv"');
    return res.send(lines.join('\n'));
  }),
);
