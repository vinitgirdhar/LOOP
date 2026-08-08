import { prisma } from '@loop/db';
import { logger } from '../lib/logger.js';

/**
 * Writes one burndown row per sprint per day. Called when a sprint starts or
 * closes and once a day by the scheduler, so the chart is real history rather
 * than something recomputed after the fact.
 */
export async function snapshotBurndown(sprintId: string): Promise<void> {
  try {
    const sprint = await prisma.sprint.findUnique({
      where: { id: sprintId },
      include: { project: { select: { columns: true } }, tasks: { select: { storyPoints: true, completedAt: true, status: true } } },
    });
    if (!sprint) return;

    const doneKeys = sprint.project.columns.filter((c) => c.isDone).map((c) => c.key);
    const isDone = (t: { completedAt: Date | null; status: string }) => Boolean(t.completedAt) || doneKeys.includes(t.status);

    const completedPts = sprint.tasks.filter(isDone).reduce((s, t) => s + (t.storyPoints ?? 0), 0);
    const remainingPts = sprint.tasks.filter((t) => !isDone(t)).reduce((s, t) => s + (t.storyPoints ?? 0), 0);
    const remainingTasks = sprint.tasks.filter((t) => !isDone(t)).length;

    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);

    await prisma.burndownPoint.upsert({
      where: { sprintId_date: { sprintId, date } },
      create: { sprintId, date, remainingPts, completedPts, remainingTasks },
      update: { remainingPts, completedPts, remainingTasks },
    });
  } catch (error: unknown) {
    logger.warn('burndown snapshot failed', error instanceof Error ? error.message : error);
  }
}

export async function snapshotAllActiveSprints(): Promise<number> {
  const active = await prisma.sprint.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
  for (const s of active) await snapshotBurndown(s.id);
  return active.length;
}
