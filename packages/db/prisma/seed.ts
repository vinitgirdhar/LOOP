/**
 * Seeds a demo workspace with realistic data and one test account per role.
 *
 * Run: npm run db:seed
 * Credentials are printed at the end and repeated in the README.
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  DEFAULT_COLUMNS,
  PERMISSIONS,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  ROLE_RANK,
  ROLES,
  type Role,
} from '@loop/shared';

const prisma = new PrismaClient();

const PASSWORD = 'Password123';
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000);
const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const pick = <T>(list: readonly T[], i: number): T => list[i % list.length]!;

async function seedRbac() {
  for (const [key, description] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({ where: { key }, create: { key, description }, update: { description } });
  }
  for (const role of ROLES) {
    const row = await prisma.role.upsert({
      where: { key: role },
      create: { key: role, name: ROLE_LABELS[role], description: `${ROLE_LABELS[role]} role`, rank: ROLE_RANK[role] },
      update: { name: ROLE_LABELS[role], rank: ROLE_RANK[role] },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: row.id } });
    const permissions = await prisma.permission.findMany({ where: { key: { in: ROLE_PERMISSIONS[role] } } });
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: row.id, permissionId: p.id })),
      skipDuplicates: true,
    });
  }
}

async function seedPlans() {
  const plans = [
    { key: 'free', name: 'Free', priceMonthly: 0, seats: 5, features: ['3 projects', 'Kanban board', 'Wiki', 'Community support'] },
    { key: 'team', name: 'Team', priceMonthly: 12, seats: 25, features: ['Unlimited projects', 'Sprints & analytics', 'Auto-Pilot board', 'Priority support'] },
    { key: 'business', name: 'Business', priceMonthly: 29, seats: 200, features: ['Everything in Team', 'Ask the Workspace', 'Audit log export', 'SSO ready', 'SLA'] },
  ];
  for (const plan of plans) {
    await prisma.billingPlan.upsert({
      where: { key: plan.key },
      create: { ...plan, features: plan.features as unknown as Prisma.InputJsonValue },
      update: { ...plan, features: plan.features as unknown as Prisma.InputJsonValue },
    });
  }
}

async function seedFlags() {
  const flags = [
    { key: 'auto_pilot', description: 'Auto-Pilot board suggestions', enabled: true, rollout: 100 },
    { key: 'ask_workspace', description: 'Permission-aware workspace Q&A', enabled: true, rollout: 100 },
    { key: 'health_score', description: 'Explainable project health score', enabled: true, rollout: 100 },
    { key: 'ai_estimates', description: 'AI story point estimation', enabled: true, rollout: 50 },
    { key: 'gantt_view', description: 'Gantt timeline (v2)', enabled: false, rollout: 0 },
  ];
  for (const flag of flags) {
    await prisma.featureFlag.upsert({ where: { key: flag.key }, create: flag, update: { description: flag.description } });
  }
}

interface SeedUser {
  email: string;
  name: string;
  role: Role | 'ADMIN';
  title: string;
  admin?: boolean;
}

const PEOPLE: SeedUser[] = [
  { email: 'owner@loop.dev', name: 'Ava Sharma', role: 'OWNER', title: 'Head of Engineering' },
  { email: 'pm@loop.dev', name: 'Rohan Mehta', role: 'PM', title: 'Product Manager' },
  { email: 'member@loop.dev', name: 'Diya Patel', role: 'MEMBER', title: 'Senior Engineer' },
  { email: 'dev2@loop.dev', name: 'Kabir Nair', role: 'MEMBER', title: 'Backend Engineer' },
  { email: 'dev3@loop.dev', name: 'Meera Iyer', role: 'MEMBER', title: 'Frontend Engineer' },
  { email: 'qa@loop.dev', name: 'Arjun Rao', role: 'MEMBER', title: 'QA Engineer' },
  { email: 'client@loop.dev', name: 'Nina Fischer', role: 'CLIENT', title: 'Client — Northwind' },
  { email: 'admin@loop.dev', name: 'Platform Admin', role: 'ADMIN', title: 'Platform Administrator', admin: true },
];

async function main() {
  console.log('› resetting demo data');
  await prisma.organization.deleteMany({ where: { slug: { startsWith: 'northwind' } } });
  await prisma.user.deleteMany({ where: { email: { in: PEOPLE.map((p) => p.email) } } });

  await seedRbac();
  await seedPlans();
  await seedFlags();

  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const users: Record<string, { id: string; name: string; email: string }> = {};

  for (const person of PEOPLE) {
    const user = await prisma.user.create({
      data: {
        email: person.email,
        name: person.name,
        passwordHash,
        emailVerifiedAt: new Date(),
        isPlatformAdmin: Boolean(person.admin),
        avatarUrl: `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(person.name)}`,
      },
    });
    users[person.email] = user;
  }

  const teamPlan = await prisma.billingPlan.findUniqueOrThrow({ where: { key: 'team' } });
  const organization = await prisma.organization.create({
    data: { name: 'Northwind Labs', slug: 'northwind-labs', ownerId: users['owner@loop.dev']!.id, planId: teamPlan.id },
  });

  const workspace = await prisma.workspace.create({
    data: {
      organizationId: organization.id,
      name: 'Northwind Product',
      slug: 'northwind-product',
      description: 'Everything the product team is shipping this quarter.',
    },
  });

  const departments = await Promise.all(
    ['Engineering', 'Design', 'Quality', 'External'].map((name) =>
      prisma.department.create({ data: { workspaceId: workspace.id, name } }),
    ),
  );

  for (const person of PEOPLE) {
    const role: Role = person.role === 'ADMIN' ? 'OWNER' : person.role;
    await prisma.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: users[person.email]!.id,
        role,
        title: person.title,
        capacityHrs: role === 'CLIENT' ? 0 : 40,
        departmentId:
          person.role === 'CLIENT' ? departments[3]!.id : person.title.includes('QA') ? departments[2]!.id : departments[0]!.id,
      },
    });
  }

  const engineers = ['member@loop.dev', 'dev2@loop.dev', 'dev3@loop.dev', 'qa@loop.dev'].map((e) => users[e]!);
  const pm = users['pm@loop.dev']!;
  const owner = users['owner@loop.dev']!;
  const client = users['client@loop.dev']!;

  // ── projects ────────────────────────────────────────────────────────────
  const projectSpecs = [
    { key: 'PAY', name: 'Payments Revamp', description: 'Replace the legacy checkout with a hosted payment flow and subscriptions.', color: '#6366f1', priority: 'HIGH' as const, deadline: day(38), withClient: true },
    { key: 'MOB', name: 'Mobile App v2', description: 'Rebuild the mobile client with offline drafts and push notifications.', color: '#0ea5e9', priority: 'MEDIUM' as const, deadline: day(70) },
    { key: 'INF', name: 'Platform Hardening', description: 'Observability, rate limiting and a zero-downtime deploy pipeline.', color: '#10b981', priority: 'URGENT' as const, deadline: day(15) },
  ];

  const projects = [];
  for (const spec of projectSpecs) {
    const members = [owner, pm, ...engineers, ...(spec.withClient ? [client] : [])];
    const project = await prisma.project.create({
      data: {
        workspaceId: workspace.id,
        key: spec.key,
        name: spec.name,
        description: spec.description,
        color: spec.color,
        priority: spec.priority,
        status: 'ACTIVE',
        startDate: day(-30),
        deadline: spec.deadline,
        columns: { create: DEFAULT_COLUMNS.map((c) => ({ ...c })) },
        members: { create: members.map((m, i) => ({ userId: m.id, role: i === 0 ? 'lead' : 'member' })) },
        labels: {
          create: [
            { workspaceId: workspace.id, name: 'bug', color: '#ef4444' },
            { workspaceId: workspace.id, name: 'feature', color: '#6366f1' },
            { workspaceId: workspace.id, name: 'tech-debt', color: '#f59e0b' },
            { workspaceId: workspace.id, name: 'security', color: '#dc2626' },
          ],
        },
        milestones: {
          create: [
            { workspaceId: workspace.id, title: 'Internal beta', dueDate: day(12) },
            { workspaceId: workspace.id, title: 'Public launch', dueDate: spec.deadline },
          ],
        },
      },
      include: { columns: { orderBy: { order: 'asc' } }, labels: true },
    });
    projects.push(project);

    await prisma.channel.create({
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        name: `proj-${spec.key.toLowerCase()}`,
        topic: `Discussion for ${spec.name}`,
        members: { create: members.filter((m) => m.id !== client.id).map((m) => ({ userId: m.id })) },
      },
    });
  }

  // ── sprints ─────────────────────────────────────────────────────────────
  const [pay, mob, inf] = projects;
  const sprints = await Promise.all([
    prisma.sprint.create({
      data: { workspaceId: workspace.id, projectId: pay!.id, name: 'PAY Sprint 3', goal: 'Card and UPI checkout end to end', status: 'ACTIVE', startDate: day(-6), endDate: day(8), capacity: 42 },
    }),
    prisma.sprint.create({
      data: { workspaceId: workspace.id, projectId: pay!.id, name: 'PAY Sprint 2', goal: 'Payment provider abstraction', status: 'COMPLETED', startDate: day(-20), endDate: day(-7), capacity: 40 },
    }),
    prisma.sprint.create({
      data: { workspaceId: workspace.id, projectId: inf!.id, name: 'INF Sprint 1', goal: 'Metrics, tracing and alerts', status: 'ACTIVE', startDate: day(-3), endDate: day(11), capacity: 30 },
    }),
  ]);
  const [paySprint, payPastSprint, infSprint] = sprints;

  // ── tasks ───────────────────────────────────────────────────────────────
  interface TaskSpec {
    title: string;
    description: string;
    column: number;
    points: number;
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    dueOffset?: number;
    completedOffset?: number;
    blocked?: string;
    label?: string;
    sprint?: string | null;
    silentDays?: number;
  }

  const taskSpecs: Record<string, TaskSpec[]> = {
    PAY: [
      { title: 'Hosted checkout page', description: 'Render the hosted checkout with card and UPI options.', column: 2, points: 8, priority: 'HIGH', dueOffset: 4, sprint: 'active', label: 'feature' },
      { title: 'Payment provider abstraction', description: 'One interface, two providers behind it.', column: 5, points: 8, priority: 'HIGH', completedOffset: -9, sprint: 'past' },
      { title: 'Webhook signature verification', description: 'Verify provider callbacks with HMAC before trusting them.', column: 5, points: 5, priority: 'URGENT', completedOffset: -8, sprint: 'past', label: 'security' },
      { title: 'Refund flow', description: 'Full and partial refunds with an audit entry per action.', column: 1, points: 5, priority: 'MEDIUM', dueOffset: 10, sprint: 'active' },
      { title: 'Subscription plans and proration', description: 'Upgrade, downgrade and mid-cycle proration.', column: 0, points: 13, priority: 'MEDIUM', sprint: null },
      { title: 'Payment API rate limits', description: 'Per-key throttling on the payment endpoints.', column: 2, points: 3, priority: 'HIGH', dueOffset: -2, blocked: 'Waiting on the provider to raise our sandbox quota', sprint: 'active' },
      { title: 'Checkout analytics events', description: 'Emit funnel events for drop-off analysis.', column: 0, points: 3, priority: 'LOW', silentDays: 11, sprint: null },
      { title: 'PCI scope review', description: 'Confirm no card data touches our servers.', column: 3, points: 5, priority: 'URGENT', dueOffset: 2, sprint: 'active', label: 'security' },
      { title: 'Retry failed captures', description: 'Exponential backoff with a dead letter queue.', column: 1, points: 5, priority: 'MEDIUM', dueOffset: 9, sprint: 'active' },
      { title: 'Invoice PDF generation', description: 'Generate and store invoices on successful payment.', column: 0, points: 8, priority: 'LOW', sprint: null, silentDays: 14 },
      { title: 'Fix currency rounding on totals', description: 'Half-up rounding at two decimals, everywhere.', column: 4, points: 2, priority: 'HIGH', dueOffset: 1, sprint: 'active', label: 'bug' },
      { title: 'Legacy checkout deprecation notice', description: 'Banner plus email to remaining users.', column: 0, points: 2, priority: 'LOW', sprint: null },
    ],
    MOB: [
      { title: 'Offline draft storage', description: 'Queue writes locally and sync when back online.', column: 2, points: 13, priority: 'HIGH', dueOffset: 12 },
      { title: 'Push notification service', description: 'FCM and APNs behind one send interface.', column: 1, points: 8, priority: 'MEDIUM', dueOffset: 20 },
      { title: 'Biometric unlock', description: 'Face ID and fingerprint for returning users.', column: 0, points: 5, priority: 'LOW' },
      { title: 'App shell rewrite', description: 'Move navigation to the new router.', column: 5, points: 8, priority: 'MEDIUM', completedOffset: -4 },
      { title: 'Crash reporting', description: 'Symbolicated stack traces per release.', column: 5, points: 3, priority: 'MEDIUM', completedOffset: -12 },
      { title: 'Image upload compression', description: 'Resize before upload to save bandwidth.', column: 1, points: 3, priority: 'LOW', dueOffset: 25 },
      { title: 'Deep links for tasks', description: 'Open a task straight from a notification.', column: 0, points: 5, priority: 'MEDIUM', silentDays: 9 },
      { title: 'Dark theme parity', description: 'Match the web palette exactly.', column: 3, points: 5, priority: 'LOW', dueOffset: 18 },
    ],
    INF: [
      { title: 'Structured logging', description: 'One JSON line per request with a trace id.', column: 5, points: 3, priority: 'HIGH', completedOffset: -2, sprint: 'inf' },
      { title: 'Request tracing', description: 'Propagate a trace id from the edge to the database.', column: 2, points: 8, priority: 'URGENT', dueOffset: 3, sprint: 'inf' },
      { title: 'Alerting rules', description: 'Page on error rate and p95 latency.', column: 1, points: 5, priority: 'HIGH', dueOffset: 6, sprint: 'inf' },
      { title: 'Zero downtime migrations', description: 'Expand and contract pattern with a rollback plan.', column: 0, points: 8, priority: 'MEDIUM', sprint: 'inf' },
      { title: 'Database connection pooling', description: 'Pool sizing under load, with a soak test.', column: 2, points: 5, priority: 'HIGH', dueOffset: -1, blocked: 'Blocked on staging capacity', sprint: 'inf' },
      { title: 'Rotate leaked staging key', description: 'Rotate and re-issue, then scan history.', column: 4, points: 2, priority: 'URGENT', dueOffset: 0, sprint: 'inf', label: 'security' },
      { title: 'Backup restore drill', description: 'Prove a full restore inside 30 minutes.', column: 0, points: 5, priority: 'MEDIUM', silentDays: 8, sprint: null },
    ],
  };

  const allTasks: { id: string; key: string; number: number; projectId: string; title: string }[] = [];

  for (const project of projects) {
    const specs = taskSpecs[project.key] ?? [];
    let number = 0;
    for (const [index, spec] of specs.entries()) {
      number += 1;
      const column = project.columns[spec.column]!;
      const assignee = spec.priority === 'URGENT' ? engineers[0]! : pick(engineers, index);
      const sprintId =
        spec.sprint === 'active' ? paySprint!.id : spec.sprint === 'past' ? payPastSprint!.id : spec.sprint === 'inf' ? infSprint!.id : null;
      const label = spec.label ? project.labels.find((l) => l.name === spec.label) : undefined;

      const task = await prisma.task.create({
        data: {
          workspaceId: workspace.id,
          projectId: project.id,
          number,
          title: spec.title,
          description: spec.description,
          status: column.key,
          priority: spec.priority,
          storyPoints: spec.points,
          estimateHrs: spec.points * 3,
          assigneeId: assignee.id,
          reporterId: pm.id,
          sprintId,
          dueDate: spec.dueOffset === undefined ? null : day(spec.dueOffset),
          completedAt: spec.completedOffset === undefined ? null : day(spec.completedOffset),
          isBlocked: Boolean(spec.blocked),
          blockedNote: spec.blocked ?? null,
          order: (index + 1) * 1000,
          lastActivityAt: day(-(spec.silentDays ?? 0)),
          labels: label ? { create: [{ labelId: label.id }] } : undefined,
          subtasks: {
            create: [
              { title: 'Design agreed', done: true, order: 0 },
              { title: 'Implementation', done: spec.column >= 3, order: 1 },
              { title: 'Tests written', done: spec.column >= 4, order: 2 },
            ],
          },
        },
      });
      allTasks.push({ id: task.id, key: project.key, number, projectId: project.id, title: task.title });
    }
  }

  // Dependencies: the rate limit task waits on the provider abstraction.
  const rateLimit = allTasks.find((t) => t.title === 'Payment API rate limits')!;
  const abstraction = allTasks.find((t) => t.title === 'Payment provider abstraction')!;
  const tracing = allTasks.find((t) => t.title === 'Request tracing')!;
  const logging = allTasks.find((t) => t.title === 'Structured logging')!;
  await prisma.taskDependency.createMany({
    data: [
      { blockerId: abstraction.id, blockedId: rateLimit.id },
      { blockerId: logging.id, blockedId: tracing.id },
    ],
    skipDuplicates: true,
  });

  // ── comments ────────────────────────────────────────────────────────────
  await prisma.comment.createMany({
    data: [
      { workspaceId: workspace.id, taskId: rateLimit.id, authorId: engineers[1]!.id, body: 'I am stuck on the payment API — the sandbox rejects anything above 20 requests a minute.' },
      { workspaceId: workspace.id, taskId: rateLimit.id, authorId: pm.id, body: 'Raised it with their support, expecting an answer tomorrow.' },
      { workspaceId: workspace.id, taskId: allTasks.find((t) => t.title === 'Hosted checkout page')!.id, authorId: engineers[2]!.id, body: 'Card flow is done, UPI is next. Should land before Friday.' },
      { workspaceId: workspace.id, taskId: tracing.id, authorId: owner.id, body: 'Please make sure the trace id survives the queue hop as well.' },
    ],
  });

  // ── wiki ────────────────────────────────────────────────────────────────
  const wikiSpecs = [
    {
      projectId: pay!.id,
      title: 'Payments architecture',
      shared: false,
      content: `<h2>Overview</h2><p>Checkout is hosted by the provider so no card data touches our servers. Our backend only ever sees a token.</p><h3>Flow</h3><ol><li>Client asks our API for a checkout session</li><li>We create the session with the provider and return the URL</li><li>Provider redirects back and fires a signed webhook</li><li>We verify the HMAC signature, then mark the order paid</li></ol><h3>Failure handling</h3><p>Captures retry with exponential backoff for up to six hours, then land in a dead letter queue for manual review.</p>`,
    },
    {
      projectId: pay!.id,
      title: 'Auth spec',
      shared: false,
      content: `<h2>Authentication</h2><p>Access tokens are short lived JWTs (15 minutes). Refresh tokens live in an httpOnly cookie, are stored hashed and rotate on every use. Reuse of an old refresh token revokes every session for that user.</p><h3>Roles</h3><p>OWNER, PM, MEMBER, CLIENT. Enforced in one middleware layer on the API, never in the UI alone.</p>`,
    },
    {
      projectId: pay!.id,
      title: 'Client release notes',
      shared: true,
      content: `<h2>What is shipping</h2><p>The new checkout supports cards and UPI, with refunds and invoices to follow. Internal beta opens in two weeks.</p>`,
    },
    {
      projectId: inf!.id,
      title: 'Runbook: on call',
      shared: false,
      content: `<h2>On call</h2><p>Pager fires on error rate above 2% for five minutes or p95 latency above 800ms.</p><h3>First steps</h3><ul><li>Check the deploy log</li><li>Roll back if the last deploy is under 30 minutes old</li><li>Escalate to the platform lead after 15 minutes</li></ul>`,
    },
  ];

  for (const spec of wikiSpecs) {
    const page = await prisma.wikiPage.create({
      data: {
        workspaceId: workspace.id,
        projectId: spec.projectId,
        title: spec.title,
        slug: spec.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        content: spec.content,
        isShared: spec.shared,
        authorId: owner.id,
      },
    });
    await prisma.wikiVersion.create({
      data: { pageId: page.id, version: 1, title: page.title, content: page.content, authorId: owner.id },
    });
  }

  // ── chat ────────────────────────────────────────────────────────────────
  const general = await prisma.channel.create({
    data: {
      workspaceId: workspace.id,
      name: 'general',
      topic: 'Everything that does not belong anywhere else',
      members: { create: PEOPLE.filter((p) => p.role !== 'CLIENT').map((p) => ({ userId: users[p.email]!.id })) },
    },
  });
  const payChannel = await prisma.channel.findFirstOrThrow({ where: { projectId: pay!.id } });

  const chatLines: { channelId: string; authorId: string; body: string; minutesAgo: number }[] = [
    { channelId: general.id, authorId: owner.id, body: 'Morning all — sprint review is Thursday at 4pm.', minutesAgo: 600 },
    { channelId: general.id, authorId: pm.id, body: 'Board is up to date, Auto-Pilot caught two moves overnight.', minutesAgo: 540 },
    { channelId: payChannel.id, authorId: engineers[2]!.id, body: 'Pushed the hosted checkout branch, PAY-1 is on the way to review.', minutesAgo: 300 },
    { channelId: payChannel.id, authorId: engineers[1]!.id, body: 'I am stuck on PAY-6 — the sandbox rate limit keeps tripping.', minutesAgo: 240 },
    { channelId: payChannel.id, authorId: pm.id, body: 'Noted, I will chase the provider. Anything else blocking?', minutesAgo: 200 },
    { channelId: payChannel.id, authorId: engineers[0]!.id, body: 'PCI review needs one more sign-off from security.', minutesAgo: 120 },
  ];
  for (const line of chatLines) {
    await prisma.message.create({
      data: {
        workspaceId: workspace.id,
        channelId: line.channelId,
        authorId: line.authorId,
        body: line.body,
        createdAt: new Date(Date.now() - line.minutesAgo * 60_000),
      },
    });
  }

  // ── time logs ───────────────────────────────────────────────────────────
  const timeData: Prisma.TimeLogCreateManyInput[] = [];
  for (let d = 1; d <= 14; d += 1) {
    for (const [i, engineer] of engineers.entries()) {
      const date = day(-d);
      timeData.push({
        workspaceId: workspace.id,
        projectId: pick(projects, i + d)!.id,
        taskId: pick(allTasks, i * 3 + d).id,
        userId: engineer.id,
        seconds: (5 + ((i + d) % 4)) * 3600,
        startedAt: date,
        endedAt: date,
        day: dayKey(date),
        note: 'Focus block',
      });
    }
  }
  await prisma.timeLog.createMany({ data: timeData });

  // ── burndown history for the active payments sprint ─────────────────────
  const sprintTasks = await prisma.task.findMany({ where: { sprintId: paySprint!.id }, select: { storyPoints: true } });
  const sprintTotal = sprintTasks.reduce((s, t) => s + (t.storyPoints ?? 0), 0);
  for (let d = 6; d >= 0; d -= 1) {
    const date = day(-d);
    date.setUTCHours(0, 0, 0, 0);
    const progressed = Math.round(sprintTotal * ((6 - d) / 12));
    await prisma.burndownPoint.upsert({
      where: { sprintId_date: { sprintId: paySprint!.id, date } },
      create: { sprintId: paySprint!.id, date, remainingPts: sprintTotal - progressed, completedPts: progressed, remainingTasks: Math.max(0, sprintTasks.length - Math.round(progressed / 4)) },
      update: {},
    });
  }

  // ── meetings ────────────────────────────────────────────────────────────
  const meeting = await prisma.meeting.create({
    data: {
      workspaceId: workspace.id,
      projectId: pay!.id,
      title: 'Payments sprint review',
      agenda: 'Demo the hosted checkout, walk the burndown, agree the refund scope.',
      location: 'Meet — link in the calendar invite',
      startsAt: day(3),
      endsAt: new Date(day(3).getTime() + 45 * 60_000),
      createdById: pm.id,
      participants: { create: [owner, pm, ...engineers].map((u) => ({ userId: u.id, status: 'ACCEPTED' as const })) },
    },
  });
  await prisma.meeting.create({
    data: {
      workspaceId: workspace.id,
      title: 'Weekly platform sync',
      agenda: 'Incidents, capacity, upcoming migrations.',
      startsAt: day(1),
      endsAt: new Date(day(1).getTime() + 30 * 60_000),
      createdById: owner.id,
      notes: 'Tracing lands this sprint. Backup drill moved to next month.',
      participants: { create: [owner, pm, engineers[0]!].map((u) => ({ userId: u.id, status: 'ACCEPTED' as const })) },
    },
  });

  await prisma.holiday.createMany({
    data: [
      { workspaceId: workspace.id, name: 'Company offsite', date: day(21) },
      { workspaceId: workspace.id, name: 'Public holiday', date: day(9) },
    ],
    skipDuplicates: true,
  });

  // ── integrations ────────────────────────────────────────────────────────
  await prisma.integration.create({
    data: { workspaceId: workspace.id, provider: 'github', config: { repo: 'northwind/payments' }, enabled: true },
  });

  // ── an Auto-Pilot suggestion waiting in the inbox for the demo ───────────
  const checkout = allTasks.find((t) => t.title === 'Hosted checkout page')!;
  await prisma.aiSuggestion.create({
    data: {
      workspaceId: workspace.id,
      projectId: pay!.id,
      taskId: checkout.id,
      kind: 'MOVE_STATUS',
      title: `Move PAY-${checkout.number} to Code Review`,
      rationale: 'A pull request on northwind/payments referenced PAY-1 in its branch name.',
      evidence: [
        {
          type: 'pull_request',
          label: 'northwind/payments: feat/PAY-1-hosted-checkout',
          url: 'https://github.com/northwind/payments/pull/128',
          quote: 'feat(PAY-1): hosted checkout with card and UPI',
        },
      ] as unknown as Prisma.InputJsonValue,
      confidence: 0.94,
      proposedChange: { status: 'code_review' } as unknown as Prisma.InputJsonValue,
      source: 'rules',
    },
  });
  await prisma.aiSuggestion.create({
    data: {
      workspaceId: workspace.id,
      projectId: pay!.id,
      taskId: rateLimit.id,
      kind: 'FLAG_BLOCKED',
      title: `Flag PAY-${rateLimit.number} as blocked`,
      rationale: 'Kabir Nair said they are stuck and named PAY-6 in #proj-pay.',
      evidence: [
        { type: 'message', label: '#proj-pay', url: null, quote: 'I am stuck on PAY-6 — the sandbox rate limit keeps tripping.' },
      ] as unknown as Prisma.InputJsonValue,
      confidence: 0.92,
      proposedChange: { isBlocked: true, blockedNote: 'Sandbox rate limit keeps tripping' } as unknown as Prisma.InputJsonValue,
      source: 'rules',
    },
  });

  // ── activity feed ───────────────────────────────────────────────────────
  await prisma.activityLog.createMany({
    data: [
      { workspaceId: workspace.id, projectId: pay!.id, actorId: pm.id, type: 'sprint.started', message: `${pm.name} started PAY Sprint 3`, createdAt: day(-6) },
      { workspaceId: workspace.id, projectId: pay!.id, actorId: engineers[2]!.id, type: 'task.moved', message: `${engineers[2]!.name} moved PAY-1 from To Do to In Progress`, createdAt: day(-4) },
      { workspaceId: workspace.id, projectId: inf!.id, actorId: engineers[0]!.id, type: 'task.moved', message: `${engineers[0]!.name} moved INF-1 to Completed`, createdAt: day(-2) },
      { workspaceId: workspace.id, projectId: pay!.id, actorId: null, type: 'github.pull_request_opened', message: 'ava-sh — feat/PAY-1-hosted-checkout (northwind/payments)', meta: { repo: 'northwind/payments', url: 'https://github.com/northwind/payments/pull/128' }, createdAt: day(-1) },
      { workspaceId: workspace.id, projectId: pay!.id, actorId: pm.id, type: 'comment.added', message: `${pm.name} commented on PAY-6`, createdAt: day(-1) },
    ],
  });

  await prisma.notification.createMany({
    data: [
      { workspaceId: workspace.id, userId: engineers[0]!.id, actorId: pm.id, type: 'TASK_ASSIGNED', title: 'PAY-8 assigned to you', body: 'PCI scope review', link: `/w/${workspace.id}/tasks/${allTasks.find((t) => t.title === 'PCI scope review')!.id}` },
      { workspaceId: workspace.id, userId: pm.id, actorId: engineers[1]!.id, type: 'MENTION', title: 'Kabir Nair mentioned you in #proj-pay', body: 'I am stuck on PAY-6' },
      { workspaceId: workspace.id, userId: owner.id, type: 'SUGGESTION', title: 'Auto-Pilot proposed 2 board changes', link: `/w/${workspace.id}/autopilot` },
    ],
  });

  await prisma.auditLog.createMany({
    data: [
      { workspaceId: workspace.id, actorId: owner.id, action: 'workspace.created', entity: 'workspace', entityId: workspace.id },
      { workspaceId: workspace.id, actorId: owner.id, action: 'member.role_changed', entity: 'workspace_member', meta: { to: 'PM', userId: pm.id } },
      { workspaceId: workspace.id, actorId: pm.id, action: 'sprint.created', entity: 'sprint', entityId: paySprint!.id },
    ],
  });

  // A second, tiny workspace so switching tenants is demonstrable.
  const sideOrg = await prisma.organization.create({
    data: { name: 'Northwind Internal', slug: 'northwind-internal', ownerId: owner.id, planId: teamPlan.id },
  });
  await prisma.workspace.create({
    data: {
      organizationId: sideOrg.id,
      name: 'Internal Tools',
      slug: 'northwind-internal-tools',
      description: 'Scripts, dashboards and the odd experiment.',
      members: { create: [{ userId: owner.id, role: 'OWNER' }, { userId: pm.id, role: 'PM' }] },
    },
  });

  console.log(`
✓ Seed complete

  Workspace   Northwind Product  (${workspace.id})
  Projects    ${projects.map((p) => p.key).join(', ')}
  Tasks       ${allTasks.length}
  Meeting     ${meeting.title}

  Test accounts — password for all: ${PASSWORD}
  ┌──────────────────────┬──────────────────────┐
${PEOPLE.map((p) => `  │ ${p.email.padEnd(20)} │ ${(p.role === 'ADMIN' ? 'Platform Admin' : ROLE_LABELS[p.role]).padEnd(20)} │`).join('\n')}
  └──────────────────────┴──────────────────────┘
`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
