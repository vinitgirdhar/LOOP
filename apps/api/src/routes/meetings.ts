import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@loop/db';
import { ah, badRequest, created, notFound, ok, parse } from '../lib/http.js';
import { requireAuth, requirePermission, workspaceContext } from '../middleware/auth.js';
import { cleanText } from '../lib/sanitize.js';
import { notify } from '../services/notify.js';
import { nextTaskNumber } from '../services/taskWrite.js';
import { env } from '../env.js';

export const meetingRouter: Router = Router();
export const calendarRouter: Router = Router();

const base = [requireAuth, workspaceContext()];

const meetingInclude = {
  createdBy: { select: { id: true, name: true, avatarUrl: true } },
  project: { select: { id: true, key: true, name: true } },
  participants: { include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } } },
  actionItems: { select: { id: true, number: true, title: true, status: true, completedAt: true, assignee: { select: { id: true, name: true } } } },
} as const;

meetingRouter.get(
  '/',
  ...base,
  ah(async (req, res) => {
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 30 * 86_400_000);
    const to = req.query.to ? new Date(String(req.query.to)) : new Date(Date.now() + 60 * 86_400_000);
    const meetings = await prisma.meeting.findMany({
      where: {
        workspaceId: req.ws!.workspaceId,
        startsAt: { gte: from, lte: to },
        ...(req.query.projectId ? { projectId: String(req.query.projectId) } : {}),
      },
      orderBy: { startsAt: 'asc' },
      include: meetingInclude,
    });
    return ok(res, meetings);
  }),
);

meetingRouter.get(
  '/:id',
  ...base,
  ah(async (req, res) => {
    const meeting = await prisma.meeting.findFirst({ where: { id: req.params.id, workspaceId: req.ws!.workspaceId }, include: meetingInclude });
    if (!meeting) throw notFound('Meeting not found');
    return ok(res, meeting);
  }),
);

meetingRouter.post(
  '/',
  ...base,
  requirePermission('meeting.manage'),
  ah(async (req, res) => {
    const body = parse(
      z.object({
        title: z.string().min(2).max(150),
        agenda: z.string().max(5000).optional(),
        projectId: z.string().nullable().optional(),
        location: z.string().max(200).optional(),
        startsAt: z.coerce.date(),
        endsAt: z.coerce.date(),
        participantIds: z.array(z.string()).default([]),
      }),
      req.body,
    );
    if (body.endsAt <= body.startsAt) throw badRequest('The meeting must end after it starts');

    const participantIds = [...new Set([req.user!.id, ...body.participantIds])];
    const meeting = await prisma.meeting.create({
      data: {
        workspaceId: req.ws!.workspaceId,
        projectId: body.projectId ?? null,
        title: cleanText(body.title),
        agenda: body.agenda ? cleanText(body.agenda) : null,
        location: body.location ? cleanText(body.location) : null,
        startsAt: body.startsAt,
        endsAt: body.endsAt,
        createdById: req.user!.id,
        participants: { create: participantIds.map((userId) => ({ userId })) },
      },
      include: meetingInclude,
    });

    await notify({
      workspaceId: req.ws!.workspaceId,
      userIds: participantIds,
      actorId: req.user!.id,
      type: 'DEADLINE_REMINDER',
      title: `Meeting: ${meeting.title}`,
      body: `${meeting.startsAt.toUTCString()}`,
      link: `/w/${req.ws!.workspaceId}/meetings/${meeting.id}`,
    });
    return created(res, meeting);
  }),
);

meetingRouter.patch(
  '/:id',
  ...base,
  requirePermission('meeting.manage'),
  ah(async (req, res) => {
    const body = parse(
      z.object({
        title: z.string().min(2).max(150).optional(),
        agenda: z.string().max(5000).nullable().optional(),
        notes: z.string().max(20_000).nullable().optional(),
        location: z.string().max(200).nullable().optional(),
        startsAt: z.coerce.date().optional(),
        endsAt: z.coerce.date().optional(),
      }),
      req.body,
    );
    const meeting = await prisma.meeting.findFirst({ where: { id: req.params.id, workspaceId: req.ws!.workspaceId } });
    if (!meeting) throw notFound('Meeting not found');

    const updated = await prisma.meeting.update({
      where: { id: meeting.id },
      data: {
        ...body,
        ...(body.title ? { title: cleanText(body.title) } : {}),
        ...(body.notes !== undefined ? { notes: body.notes ? cleanText(body.notes) : null } : {}),
      },
      include: meetingInclude,
    });
    return ok(res, updated);
  }),
);

meetingRouter.post(
  '/:id/rsvp',
  ...base,
  ah(async (req, res) => {
    const { status } = parse(z.object({ status: z.enum(['INVITED', 'ACCEPTED', 'DECLINED']) }), req.body);
    const meeting = await prisma.meeting.findFirst({ where: { id: req.params.id, workspaceId: req.ws!.workspaceId } });
    if (!meeting) throw notFound('Meeting not found');
    await prisma.meetingParticipant.upsert({
      where: { meetingId_userId: { meetingId: meeting.id, userId: req.user!.id } },
      create: { meetingId: meeting.id, userId: req.user!.id, status },
      update: { status },
    });
    return ok(res, { message: 'RSVP saved' });
  }),
);

/** Action items are real tasks so they show up on the board and in reports. */
meetingRouter.post(
  '/:id/action-items',
  ...base,
  requirePermission('task.create'),
  ah(async (req, res) => {
    const body = parse(
      z.object({ title: z.string().min(2).max(200), assigneeId: z.string().nullable().optional(), dueDate: z.coerce.date().nullable().optional(), projectId: z.string().optional() }),
      req.body,
    );
    const meeting = await prisma.meeting.findFirst({ where: { id: req.params.id, workspaceId: req.ws!.workspaceId } });
    if (!meeting) throw notFound('Meeting not found');

    const projectId = body.projectId ?? meeting.projectId;
    if (!projectId) throw badRequest('This meeting has no project — pick one for the action item');

    const project = await prisma.project.findFirstOrThrow({
      where: { id: projectId, workspaceId: req.ws!.workspaceId },
      include: { columns: { orderBy: { order: 'asc' } } },
    });

    const task = await prisma.task.create({
      data: {
        workspaceId: req.ws!.workspaceId,
        projectId,
        meetingId: meeting.id,
        number: await nextTaskNumber(projectId),
        title: cleanText(body.title),
        status: project.columns[1]?.key ?? project.columns[0]!.key,
        reporterId: req.user!.id,
        assigneeId: body.assigneeId ?? null,
        dueDate: body.dueDate ?? null,
      },
    });

    if (task.assigneeId) {
      await notify({
        workspaceId: req.ws!.workspaceId,
        userIds: [task.assigneeId],
        actorId: req.user!.id,
        type: 'TASK_ASSIGNED',
        title: `Action item from "${meeting.title}"`,
        body: task.title,
        link: `/w/${req.ws!.workspaceId}/tasks/${task.id}`,
      });
    }
    return created(res, task);
  }),
);

meetingRouter.delete(
  '/:id',
  ...base,
  requirePermission('meeting.manage'),
  ah(async (req, res) => {
    const { count } = await prisma.meeting.deleteMany({ where: { id: req.params.id, workspaceId: req.ws!.workspaceId } });
    if (count === 0) throw notFound('Meeting not found');
    return ok(res, { message: 'Meeting deleted' });
  }),
);

/** Downloadable .ics so "calendar invites" actually land in a real calendar. */
meetingRouter.get(
  '/:id/invite.ics',
  ...base,
  ah(async (req, res) => {
    const meeting = await prisma.meeting.findFirst({ where: { id: req.params.id, workspaceId: req.ws!.workspaceId }, include: meetingInclude });
    if (!meeting) throw notFound('Meeting not found');

    const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0]!.concat('Z');
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Loop//Meetings//EN',
      'BEGIN:VEVENT',
      `UID:${meeting.id}@loop`,
      `DTSTAMP:${stamp(new Date())}`,
      `DTSTART:${stamp(meeting.startsAt)}`,
      `DTEND:${stamp(meeting.endsAt)}`,
      `SUMMARY:${meeting.title.replace(/\n/g, ' ')}`,
      `DESCRIPTION:${(meeting.agenda ?? '').replace(/\n/g, '\\n')}`,
      `LOCATION:${meeting.location ?? env.WEB_URL}`,
      ...meeting.participants.map((p) => `ATTENDEE;CN=${p.user.name}:mailto:${p.user.email}`),
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${meeting.id}.ics"`);
    return res.send(ics);
  }),
);

// ───────────────────────── calendar ─────────────────────────

/** One feed for deadlines, meetings, sprint boundaries and holidays. */
calendarRouter.get(
  '/',
  ...base,
  ah(async (req, res) => {
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 15 * 86_400_000);
    const to = req.query.to ? new Date(String(req.query.to)) : new Date(Date.now() + 45 * 86_400_000);
    const workspaceId = req.ws!.workspaceId;

    const [tasks, meetings, sprints, holidays, milestones] = await Promise.all([
      prisma.task.findMany({
        where: { workspaceId, dueDate: { gte: from, lte: to } },
        select: { id: true, title: true, number: true, dueDate: true, completedAt: true, priority: true, project: { select: { key: true, color: true } } },
      }),
      prisma.meeting.findMany({
        where: { workspaceId, startsAt: { gte: from, lte: to } },
        select: { id: true, title: true, startsAt: true, endsAt: true },
      }),
      prisma.sprint.findMany({
        where: { workspaceId, OR: [{ startDate: { gte: from, lte: to } }, { endDate: { gte: from, lte: to } }] },
        select: { id: true, name: true, startDate: true, endDate: true, status: true },
      }),
      prisma.holiday.findMany({ where: { workspaceId, date: { gte: from, lte: to } } }),
      prisma.milestone.findMany({
        where: { workspaceId, dueDate: { gte: from, lte: to } },
        select: { id: true, title: true, dueDate: true, completedAt: true },
      }),
    ]);

    const events = [
      ...tasks.map((t) => ({
        id: `task-${t.id}`, type: 'task' as const, title: `${t.project.key}-${t.number} ${t.title}`,
        date: t.dueDate!, done: Boolean(t.completedAt), color: t.project.color, link: `/w/${workspaceId}/tasks/${t.id}`,
      })),
      ...meetings.map((m) => ({
        id: `meeting-${m.id}`, type: 'meeting' as const, title: m.title, date: m.startsAt, endDate: m.endsAt,
        color: '#8b5cf6', link: `/w/${workspaceId}/meetings/${m.id}`,
      })),
      ...sprints.flatMap((s) => [
        { id: `sprint-start-${s.id}`, type: 'sprint' as const, title: `${s.name} starts`, date: s.startDate, color: '#0ea5e9', link: `/w/${workspaceId}/sprints/${s.id}` },
        { id: `sprint-end-${s.id}`, type: 'sprint' as const, title: `${s.name} ends`, date: s.endDate, color: '#0ea5e9', link: `/w/${workspaceId}/sprints/${s.id}` },
      ]),
      ...milestones.map((m) => ({
        id: `milestone-${m.id}`, type: 'milestone' as const, title: m.title, date: m.dueDate!, done: Boolean(m.completedAt), color: '#f59e0b', link: null,
      })),
      ...holidays.map((h) => ({ id: `holiday-${h.id}`, type: 'holiday' as const, title: h.name, date: h.date, color: '#64748b', link: null })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return ok(res, events);
  }),
);

calendarRouter.post(
  '/holidays',
  ...base,
  requirePermission('workspace.update'),
  ah(async (req, res) => {
    const body = parse(z.object({ name: z.string().min(2).max(80), date: z.coerce.date() }), req.body);
    const holiday = await prisma.holiday.create({
      data: { workspaceId: req.ws!.workspaceId, name: cleanText(body.name), date: body.date },
    });
    return created(res, holiday);
  }),
);

/** Who is around: capacity minus booked meetings for the coming week. */
calendarRouter.get(
  '/availability',
  ...base,
  ah(async (req, res) => {
    const from = new Date();
    const to = new Date(Date.now() + 7 * 86_400_000);
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: req.ws!.workspaceId },
      select: { capacityHrs: true, user: { select: { id: true, name: true, avatarUrl: true } } },
    });
    const meetings = await prisma.meeting.findMany({
      where: { workspaceId: req.ws!.workspaceId, startsAt: { gte: from, lte: to } },
      select: { startsAt: true, endsAt: true, participants: { select: { userId: true } } },
    });

    const booked = new Map<string, number>();
    for (const m of meetings) {
      const hours = (m.endsAt.getTime() - m.startsAt.getTime()) / 3_600_000;
      for (const p of m.participants) booked.set(p.userId, (booked.get(p.userId) ?? 0) + hours);
    }

    return ok(
      res,
      members.map((m) => ({
        user: m.user,
        capacityHours: m.capacityHrs,
        meetingHours: Number((booked.get(m.user.id) ?? 0).toFixed(1)),
        freeHours: Number(Math.max(0, m.capacityHrs - (booked.get(m.user.id) ?? 0)).toFixed(1)),
      })),
    );
  }),
);
