/**
 * Demo seed for the hosted Supabase project.
 *
 * The old Prisma seed wrote users into a local Postgres `users` table with
 * bcrypt hashes. Supabase Auth is a separate store and nothing carried those
 * accounts across, so this recreates them — same addresses and password as
 * before, so the demo script and the README still hold.
 *
 * Idempotent: re-running updates the workspace rather than duplicating it.
 *
 *   node supabase/seed.mjs            # reads ../.env
 *   node supabase/seed.mjs --reset    # delete the demo workspace and users first
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY: creating confirmed users and the first
 * OWNER membership are both closed to an ordinary session by design.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(here, '..', '.env');

if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const value = m[2].trim().replace(/^(['"])([\s\S]*)\1$/, '$2');
    if (value && !process.env[m[1]]) process.env[m[1]] = value;
  }
}

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_ || !SERVICE) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (in .env or the environment).');
  process.exit(1);
}

const RESET = process.argv.includes('--reset');
const PASSWORD = 'Password123';
const WORKSPACE_SLUG = 'northwind-labs';

const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString();

async function rest(pathname, { method = 'GET', body, prefer } = {}) {
  const response = await fetch(`${URL_}/rest/v1/${pathname}`, {
    method,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${pathname} -> ${response.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const insert = (table, rows) => rest(table, { method: 'POST', body: rows, prefer: 'return=representation' });

async function auth(pathname, { method = 'GET', body } = {}) {
  const response = await fetch(`${URL_}/auth/v1/${pathname}`, {
    method,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${pathname} -> ${response.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

// ── who ──────────────────────────────────────────────────────────────────────
const PEOPLE = [
  { email: 'owner@loop.dev', name: 'Ava Sharma', role: 'OWNER', title: 'Head of Engineering' },
  { email: 'pm@loop.dev', name: 'Rohan Mehta', role: 'PM', title: 'Product Manager' },
  { email: 'member@loop.dev', name: 'Diya Patel', role: 'MEMBER', title: 'Senior Engineer' },
  { email: 'dev2@loop.dev', name: 'Kabir Nair', role: 'MEMBER', title: 'Backend Engineer' },
  { email: 'dev3@loop.dev', name: 'Meera Iyer', role: 'MEMBER', title: 'Frontend Engineer' },
  { email: 'qa@loop.dev', name: 'Arjun Rao', role: 'MEMBER', title: 'QA Engineer' },
  { email: 'client@loop.dev', name: 'Nina Fischer', role: 'CLIENT', title: 'Client — Northwind' },
  { email: 'admin@loop.dev', name: 'Platform Admin', role: 'OWNER', title: 'Platform Administrator', admin: true },
];

const DEFAULT_COLUMNS = [
  { key: 'backlog', name: 'Backlog', order: 0, is_done: false, color: '#94a3b8', wip_limit: null },
  { key: 'todo', name: 'To Do', order: 1, is_done: false, color: '#60a5fa', wip_limit: null },
  { key: 'in_progress', name: 'In Progress', order: 2, is_done: false, color: '#fbbf24', wip_limit: 5 },
  { key: 'code_review', name: 'Code Review', order: 3, is_done: false, color: '#a78bfa', wip_limit: null },
  { key: 'testing', name: 'Testing', order: 4, is_done: false, color: '#22d3ee', wip_limit: null },
  { key: 'completed', name: 'Completed', order: 5, is_done: true, color: '#34d399', wip_limit: null },
];

const PROJECTS = [
  { key: 'PAY', name: 'Payments Revamp', description: 'Replace the legacy checkout with a hosted payment flow and subscriptions.', color: '#6366f1', priority: 'HIGH', deadline: day(38), withClient: true },
  { key: 'MOB', name: 'Mobile App v2', description: 'Rebuild the mobile client with offline drafts and push notifications.', color: '#0ea5e9', priority: 'MEDIUM', deadline: day(70), withClient: false },
  { key: 'INF', name: 'Platform Hardening', description: 'Observability, rate limiting and a zero-downtime deploy pipeline.', color: '#10b981', priority: 'URGENT', deadline: day(15), withClient: false },
];

const TASKS = {
  PAY: [
    ['Hosted checkout page', 'completed', 'HIGH', 5, -14],
    ['Card payment provider abstraction', 'completed', 'HIGH', 8, -10],
    ['UPI collect flow', 'in_progress', 'URGENT', 5, 3],
    ['Subscription billing cycles', 'in_progress', 'HIGH', 8, 6],
    ['Refund and partial refund API', 'code_review', 'MEDIUM', 3, 4],
    ['Webhook signature verification', 'testing', 'HIGH', 3, 2],
    ['Retry failed charges with backoff', 'todo', 'MEDIUM', 5, 9],
    ['PCI scope review with legal', 'backlog', 'LOW', 2, 20],
    ['Payment failure analytics', 'backlog', 'MEDIUM', 3, 25],
  ],
  MOB: [
    ['Offline draft storage', 'in_progress', 'HIGH', 8, 12],
    ['Push notification permissions', 'todo', 'MEDIUM', 3, 18],
    ['Biometric unlock', 'backlog', 'LOW', 5, 40],
    ['Rewrite the task detail screen', 'code_review', 'MEDIUM', 5, 8],
    ['Crash reporting pipeline', 'completed', 'HIGH', 3, -5],
  ],
  INF: [
    ['Structured logging everywhere', 'completed', 'HIGH', 5, -8],
    ['Distributed tracing spans', 'in_progress', 'URGENT', 8, 2],
    ['Rate limit the public API', 'testing', 'URGENT', 5, 1],
    ['Blue-green deploy pipeline', 'todo', 'HIGH', 8, 10],
    ['Alert routing and on-call rota', 'backlog', 'MEDIUM', 3, 14],
  ],
};

async function findWorkspace() {
  const rows = await rest(`workspaces?slug=eq.${WORKSPACE_SLUG}&select=id,organization_id`);
  return rows[0] ?? null;
}

async function reset() {
  const workspace = await findWorkspace();
  if (workspace) {
    await rest(`workspaces?id=eq.${workspace.id}`, { method: 'DELETE' });
    await rest(`organizations?id=eq.${workspace.organization_id}`, { method: 'DELETE' });
    console.log('removed the existing demo workspace');
  }

  const { users } = await auth('admin/users?per_page=200');
  const demo = new Set(PEOPLE.map((p) => p.email));

  for (const user of users ?? []) {
    if (!demo.has(user.email) && !user.email.startsWith('e2e-')) continue;

    // organizations.owner_id is ON DELETE RESTRICT, so an organisation left
    // behind by an earlier run pins its owner in place. Clear those first,
    // taking their workspaces with them via the cascade.
    const owned = await rest(`organizations?owner_id=eq.${user.id}&select=id`);
    for (const org of owned) await rest(`organizations?id=eq.${org.id}`, { method: 'DELETE' });

    await auth(`admin/users/${user.id}`, { method: 'DELETE' });
    console.log('removed user', user.email, owned.length ? `(and ${owned.length} orphaned org)` : '');
  }
}

async function ensureUsers() {
  const { users: existing } = await auth('admin/users?per_page=200');
  const byEmail = new Map((existing ?? []).map((u) => [u.email, u]));
  const out = {};

  for (const person of PEOPLE) {
    let user = byEmail.get(person.email);

    if (user) {
      // Re-assert the password so a half-finished earlier run still logs in.
      await auth(`admin/users/${user.id}`, {
        method: 'PUT',
        body: { password: PASSWORD, email_confirm: true, user_metadata: { name: person.name } },
      });
      console.log('updated', person.email);
    } else {
      user = await auth('admin/users', {
        method: 'POST',
        body: { email: person.email, password: PASSWORD, email_confirm: true, user_metadata: { name: person.name } },
      });
      console.log('created', person.email);
    }

    // handle_new_user fills profiles from the trigger; make sure the display
    // name and admin flag match regardless of when the row was created.
    await rest(`profiles?id=eq.${user.id}`, {
      method: 'PATCH',
      body: { name: person.name, is_platform_admin: Boolean(person.admin) },
    });

    out[person.email] = user.id;
  }

  return out;
}

async function main() {
  if (RESET) await reset();

  const users = await ensureUsers();
  const ownerId = users['owner@loop.dev'];

  if (await findWorkspace()) {
    console.log(`\nWorkspace "${WORKSPACE_SLUG}" already exists — leaving its data alone.`);
    console.log('Re-run with --reset to rebuild it from scratch.');
    report();
    return;
  }

  const [plan] = await rest('billing_plans?key=eq.team&select=id');
  const [organization] = await insert('organizations', {
    name: 'Northwind Labs',
    slug: 'northwind-labs-org',
    owner_id: ownerId,
    plan_id: plan?.id ?? null,
  });

  const [workspace] = await insert('workspaces', {
    organization_id: organization.id,
    name: 'Northwind Labs',
    slug: WORKSPACE_SLUG,
    description: 'Product, platform and mobile delivery for Northwind.',
  });

  const [engineering, product] = await insert('departments', [
    { workspace_id: workspace.id, name: 'Engineering', description: 'Platform, backend and mobile' },
    { workspace_id: workspace.id, name: 'Product', description: 'Discovery and delivery' },
  ]);

  await insert(
    'workspace_members',
    PEOPLE.map((person) => ({
      workspace_id: workspace.id,
      user_id: users[person.email],
      role: person.role,
      title: person.title,
      capacity_hrs: person.role === 'CLIENT' ? 5 : 40,
      department_id: person.role === 'PM' ? product.id : person.role === 'CLIENT' ? null : engineering.id,
    })),
  );

  const labels = await insert(
    'labels',
    ['bug:#ef4444', 'feature:#6366f1', 'tech-debt:#f59e0b', 'security:#dc2626'].map((spec) => {
      const [name, color] = spec.split(':');
      return { workspace_id: workspace.id, name, color };
    }),
  );

  const engineers = ['member@loop.dev', 'dev2@loop.dev', 'dev3@loop.dev', 'qa@loop.dev'].map((e) => users[e]);
  let taskCount = 0;

  for (const spec of PROJECTS) {
    const [project] = await insert('projects', {
      workspace_id: workspace.id,
      name: spec.name,
      key: spec.key,
      description: spec.description,
      color: spec.color,
      priority: spec.priority,
      status: 'ACTIVE',
      start_date: day(-30),
      deadline: spec.deadline,
    });

    await insert(
      'board_columns',
      DEFAULT_COLUMNS.map((column) => ({ ...column, project_id: project.id })),
    );

    const members = [users['pm@loop.dev'], ...engineers, ...(spec.withClient ? [users['client@loop.dev']] : [])];
    await insert(
      'project_members',
      members.map((userId, index) => ({ project_id: project.id, user_id: userId, role: index === 0 ? 'lead' : 'member' })),
    );

    const [milestone] = await insert('milestones', {
      workspace_id: workspace.id,
      project_id: project.id,
      title: `${spec.key} — first release`,
      description: 'The slice that goes in front of real users.',
      due_date: spec.deadline,
    });

    const sprints = await insert('sprints', [
      {
        workspace_id: workspace.id,
        project_id: project.id,
        name: `${spec.key} Sprint 1`,
        goal: 'Foundations',
        status: 'COMPLETED',
        start_date: day(-20),
        end_date: day(-7),
        capacity: 40,
      },
      {
        workspace_id: workspace.id,
        project_id: project.id,
        name: `${spec.key} Sprint 2`,
        goal: spec.description.slice(0, 60),
        status: 'ACTIVE',
        start_date: day(-6),
        end_date: day(8),
        capacity: 42,
      },
    ]);

    const active = sprints.find((s) => s.status === 'ACTIVE');
    const rows = TASKS[spec.key].map(([title, status, priority, points, due], index) => ({
      workspace_id: workspace.id,
      project_id: project.id,
      title,
      description: `${title}. Seeded for the demo workspace.`,
      status,
      priority,
      story_points: points,
      estimate_hrs: points * 1.5,
      due_date: day(due),
      completed_at: status === 'completed' ? day(due) : null,
      assignee_id: engineers[index % engineers.length],
      reporter_id: users['pm@loop.dev'],
      sprint_id: status === 'backlog' ? null : active.id,
      milestone_id: index < 3 ? milestone.id : null,
      is_blocked: title.includes('UPI'),
      blocked_note: title.includes('UPI') ? 'Waiting on the provider sandbox credentials.' : null,
      order: (index + 1) * 1000,
      last_activity_at: day(-Math.min(index, 9)),
    }));

    const created = await insert('tasks', rows);
    taskCount += created.length;

    await insert(
      'task_labels',
      created.slice(0, 4).map((task, index) => ({ task_id: task.id, label_id: labels[index % labels.length].id })),
    );

    await insert('subtasks', [
      { task_id: created[2].id, title: 'Draft the sequence diagram', done: true, order: 0 },
      { task_id: created[2].id, title: 'Handle the timeout path', done: false, order: 1 },
    ]);

    await insert('wiki_pages', {
      workspace_id: workspace.id,
      project_id: project.id,
      title: `${spec.name} — technical notes`,
      slug: `${spec.key.toLowerCase()}-technical-notes`,
      content: `# ${spec.name}\n\n${spec.description}\n\n## Decisions\n\n- Ship the smallest slice that a real user can complete end to end.\n- Anything touching money is reviewed by two people.\n`,
      author_id: users['owner@loop.dev'],
      is_shared: spec.withClient,
      version: 1,
    });
  }

  const channels = await insert('channels', [
    { workspace_id: workspace.id, name: 'general', topic: 'Everything and nothing', type: 'CHANNEL', is_private: false },
    { workspace_id: workspace.id, name: 'payments', topic: 'PAY project chatter', type: 'CHANNEL', is_private: false },
    { workspace_id: workspace.id, name: 'incidents', topic: 'Production issues', type: 'CHANNEL', is_private: true },
  ]);

  await insert(
    'channel_members',
    channels.flatMap((channel) =>
      PEOPLE.filter((p) => p.role !== 'CLIENT').map((p) => ({ channel_id: channel.id, user_id: users[p.email] })),
    ),
  );

  await insert('messages', [
    { workspace_id: workspace.id, channel_id: channels[0].id, author_id: users['owner@loop.dev'], body: 'Morning all — sprint review is Thursday at 3pm.', mentions: [] },
    { workspace_id: workspace.id, channel_id: channels[1].id, author_id: users['pm@loop.dev'], body: 'UPI is blocked on sandbox credentials. Chasing the provider today.', mentions: [] },
    { workspace_id: workspace.id, channel_id: channels[1].id, author_id: users['member@loop.dev'], body: 'Refund API is in review, should merge this afternoon.', mentions: [] },
  ]);

  console.log('\nSeeded:');
  console.log(`  workspace   Northwind Labs (${WORKSPACE_SLUG})`);
  console.log(`  people      ${PEOPLE.length}`);
  console.log(`  projects    ${PROJECTS.length}`);
  console.log(`  tasks       ${taskCount}`);
  console.log(`  channels    ${channels.length}`);
  report();
}

function report() {
  console.log('\nSign in with any of these — password is the same for all:');
  console.log(`  password    ${PASSWORD}\n`);
  for (const person of PEOPLE) {
    console.log(`  ${person.email.padEnd(20)} ${person.role.padEnd(7)} ${person.name}`);
  }
}

main().catch((error) => {
  console.error('\nSeed failed:', error.message);
  process.exit(1);
});
