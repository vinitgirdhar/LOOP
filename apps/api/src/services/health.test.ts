import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '@loop/db';
import { computeHealth } from './health.js';

describe('computeHealth service', () => {
  it('computes 100 score for a healthy project with no overdue or blocked tasks', async () => {
    const origFindProject = prisma.project.findUniqueOrThrow;
    const origFindTasks = prisma.task.findMany;

    try {
      // @ts-ignore
      prisma.project.findUniqueOrThrow = async () => ({
        id: 'proj-1',
        name: 'Healthy Project',
        workspaceId: 'ws-1',
        deadline: new Date(Date.now() + 864000000),
        columns: [
          { key: 'backlog', isDone: false },
          { key: 'done', isDone: true },
        ],
      });

      // @ts-ignore
      prisma.task.findMany = async () => [
        {
          id: 'task-1',
          title: 'Fresh active task',
          status: 'in_progress',
          dueDate: new Date(Date.now() + 86400000),
          completedAt: null,
          isBlocked: false,
          assigneeId: 'user-1',
          storyPoints: 3,
          lastActivityAt: new Date(),
          blockedBy: [],
        },
      ];

      const result = await computeHealth('proj-1', { narrate: false, persist: false });

      assert.equal(typeof result.score, 'number');
      assert.equal(result.score, 100);
      assert.equal(result.signals.length, 5);
      assert.equal(result.sampleSize.openTasks, 1);
      assert.equal(result.sampleSize.totalTasks, 1);
    } finally {
      prisma.project.findUniqueOrThrow = origFindProject;
      prisma.task.findMany = origFindTasks;
    }
  });

  it('deducts score points when overdue and blocked tasks exist', async () => {
    const origFindProject = prisma.project.findUniqueOrThrow;
    const origFindTasks = prisma.task.findMany;
    const pastDate = new Date(Date.now() - 864000000); // 10 days ago

    try {
      // @ts-ignore
      prisma.project.findUniqueOrThrow = async () => ({
        id: 'proj-2',
        name: 'Unhealthy Project',
        workspaceId: 'ws-1',
        deadline: pastDate,
        columns: [
          { key: 'backlog', isDone: false },
          { key: 'done', isDone: true },
        ],
      });

      // @ts-ignore
      prisma.task.findMany = async () => [
        {
          id: 'task-1',
          title: 'Overdue & blocked task',
          status: 'in_progress',
          dueDate: pastDate,
          completedAt: null,
          isBlocked: true,
          assigneeId: 'user-1',
          storyPoints: 5,
          lastActivityAt: pastDate,
          blockedBy: [],
        },
      ];

      const result = await computeHealth('proj-2', { narrate: false, persist: false });

      assert.ok(result.score < 100, 'Score should be less than 100');
      assert.ok(result.actions.length > 0, 'Should generate action items');

      const overdueSignal = result.signals.find((s) => s.key === 'overdue');
      assert.ok(overdueSignal && overdueSignal.penalty > 0, 'Overdue penalty should be > 0');
    } finally {
      prisma.project.findUniqueOrThrow = origFindProject;
      prisma.task.findMany = origFindTasks;
    }
  });
});
