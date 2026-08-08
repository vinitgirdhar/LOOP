import cron from 'node-cron';
import { prisma } from '@loop/db';
import { logger } from '../lib/logger.js';
import { notify } from '../services/notify.js';
import { computeHealth } from '../services/health.js';
import { snapshotAllActiveSprints } from '../services/sprintMetrics.js';

/**
 * Background work the serverless frontend cannot do: deadline reminders,
 * nightly burndown points and a daily health snapshot per active project.
 */
export function startScheduler(): void {
  // Every hour: warn about tasks due in the next 24 hours.
  cron.schedule('0 * * * *', async () => {
    try {
      const soon = new Date(Date.now() + 24 * 3600 * 1000);
      const tasks = await prisma.task.findMany({
        where: { completedAt: null, assigneeId: { not: null }, dueDate: { gt: new Date(), lte: soon } },
        include: { project: { select: { key: true } } },
      });

      for (const task of tasks) {
        const already = await prisma.notification.findFirst({
          where: {
            userId: task.assigneeId!,
            type: 'DEADLINE_REMINDER',
            title: { contains: `${task.project.key}-${task.number}` },
            createdAt: { gt: new Date(Date.now() - 20 * 3600 * 1000) },
          },
        });
        if (already) continue;

        await notify({
          workspaceId: task.workspaceId,
          userIds: [task.assigneeId!],
          type: 'DEADLINE_REMINDER',
          title: `${task.project.key}-${task.number} is due soon`,
          body: task.title,
          link: `/w/${task.workspaceId}/tasks/${task.id}`,
        });
      }
      if (tasks.length > 0) logger.info(`deadline sweep checked ${tasks.length} task(s)`);
    } catch (error: unknown) {
      logger.warn('deadline job failed', error instanceof Error ? error.message : error);
    }
  });

  // 00:05 UTC: burndown snapshot for every active sprint.
  cron.schedule('5 0 * * *', async () => {
    try {
      const count = await snapshotAllActiveSprints();
      logger.info(`burndown snapshot written for ${count} sprint(s)`);
    } catch (error: unknown) {
      logger.warn('burndown job failed', error instanceof Error ? error.message : error);
    }
  });

  // 00:20 UTC: health snapshot per active project, so the trend line is real history.
  cron.schedule('20 0 * * *', async () => {
    try {
      const projects = await prisma.project.findMany({ where: { status: 'ACTIVE', archivedAt: null }, select: { id: true } });
      for (const p of projects) await computeHealth(p.id, { persist: true, narrate: false });
      logger.info(`health snapshot written for ${projects.length} project(s)`);
    } catch (error: unknown) {
      logger.warn('health job failed', error instanceof Error ? error.message : error);
    }
  });

  // Hourly cleanup of dead sessions and used tokens.
  cron.schedule('30 * * * *', async () => {
    try {
      await prisma.session.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: new Date(Date.now() - 7 * 86_400_000) } }] } });
      await prisma.verificationToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    } catch (error: unknown) {
      logger.warn('cleanup job failed', error instanceof Error ? error.message : error);
    }
  });

  logger.info('scheduler started (deadlines, burndown, health, cleanup)');
}
