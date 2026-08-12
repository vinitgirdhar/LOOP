/**
 * Single source of truth for RBAC.
 *
 * The API enforces this matrix in one middleware layer; the web app imports the
 * same matrix only to hide controls the API would reject anyway. It is also
 * seeded into the `Role` / `Permission` / `RolePermission` tables so the
 * database is self-describing.
 */

export const ROLES = ['OWNER', 'PM', 'MEMBER', 'CLIENT'] as const;
export type Role = (typeof ROLES)[number];

/** Higher rank = more power. Used for "at least this role" checks. */
export const ROLE_RANK: Record<Role, number> = {
  CLIENT: 1,
  MEMBER: 2,
  PM: 3,
  OWNER: 4,
};

export const PERMISSIONS = {
  'workspace.update': 'Rename workspace, change logo and settings',
  'workspace.delete': 'Delete the workspace',
  'workspace.invite': 'Invite members by email or link',
  'workspace.member.manage': 'Change member roles, remove members',
  'workspace.department.manage': 'Create and edit departments',
  'workspace.billing.view': 'View the billing plan and seats',
  'workspace.integration.manage': 'Connect and configure integrations',
  'workspace.analytics.view': 'View workspace-wide analytics',
  'workspace.audit.view': 'Read the workspace audit log',

  'project.create': 'Create projects',
  'project.update': 'Edit project details, columns and milestones',
  'project.delete': 'Delete or archive projects',
  'project.view': 'View projects they belong to',

  'sprint.manage': 'Create, start and close sprints',

  'task.create': 'Create tasks',
  'task.update.any': 'Edit any task in the project',
  'task.update.own': 'Edit tasks assigned to them (status, time, subtasks)',
  'task.delete': 'Delete tasks',
  'task.assign': 'Assign tasks to people',
  'task.approve': 'Approve completed work / deliverables',
  'task.comment': 'Comment on tasks',

  'wiki.read': 'Read internal wiki pages',
  'wiki.write': 'Create and edit wiki pages',

  'file.upload': 'Upload files',
  'file.delete': 'Delete files',

  'chat.read': 'Read internal channels',
  'chat.write': 'Post messages',

  'time.log': 'Log time against tasks',
  'time.view.team': 'View time and utilisation for the whole team',

  'meeting.manage': 'Create and edit meetings',

  'report.generate': 'Generate and export reports',

  'ai.suggestion.decide': 'Accept or reject AI suggestions',
  'ai.ask': 'Use Ask the Workspace',
} as const;

export type Permission = keyof typeof PERMISSIONS;

const MEMBER_PERMISSIONS: Permission[] = [
  'project.view',
  'task.create',
  'task.update.own',
  'task.comment',
  'wiki.read',
  'wiki.write',
  'file.upload',
  'chat.read',
  'chat.write',
  'time.log',
  'ai.ask',
];

const PM_PERMISSIONS: Permission[] = [
  ...MEMBER_PERMISSIONS,
  'project.create',
  'project.update',
  'sprint.manage',
  'task.update.any',
  'task.delete',
  'task.assign',
  'task.approve',
  'file.delete',
  'time.view.team',
  'meeting.manage',
  'report.generate',
  'workspace.analytics.view',
  'ai.suggestion.decide',
];

const OWNER_PERMISSIONS: Permission[] = [
  ...PM_PERMISSIONS,
  'workspace.update',
  'workspace.delete',
  'workspace.invite',
  'workspace.member.manage',
  'workspace.department.manage',
  'workspace.billing.view',
  'workspace.integration.manage',
  'workspace.audit.view',
  'project.delete',
];

/** Clients are deliberately tiny: read progress, read shared docs, approve, comment. */
const CLIENT_PERMISSIONS: Permission[] = [
  'project.view',
  'task.comment',
  'task.approve',
  'ai.ask',
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  OWNER: OWNER_PERMISSIONS,
  PM: PM_PERMISSIONS,
  MEMBER: MEMBER_PERMISSIONS,
  CLIENT: CLIENT_PERMISSIONS,
};

export function can(role: Role | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** Every role that holds a permission, strongest first. */
export function rolesWith(permission: Permission): Role[] {
  return ROLES.filter((role) => ROLE_PERMISSIONS[role].includes(permission)).sort(
    (a, b) => ROLE_RANK[b] - ROLE_RANK[a],
  );
}

/**
 * A refusal a person can act on.
 *
 * "You do not have permission to do that" tells the reader nothing: not what
 * was needed, not whether it is worth asking someone, not who to ask. This
 * names the capability in plain words and lists the roles that hold it, which
 * is also what makes the RBAC model visible to anyone evaluating the product
 * rather than buried in a matrix they have to take on trust.
 */
export function explainPermission(permission: Permission, role?: Role | null): string {
  const holders = rolesWith(permission);
  const what = PERMISSIONS[permission] ?? permission;
  const who = holders.length === 0
    ? 'No role currently holds it'
    : holders.length === 1
      ? `Only ${ROLE_LABELS[holders[0]!]} can`
      : `${holders.slice(0, -1).map((r) => ROLE_LABELS[r]).join(', ')} and ${ROLE_LABELS[holders[holders.length - 1]!]} can`;

  const youAre = role ? ` You are signed in as ${ROLE_LABELS[role]}.` : '';
  return `This needs the "${what}" permission. ${who}.${youAre}`;
}

export function atLeast(role: Role | undefined | null, minimum: Role): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'Workspace Owner',
  PM: 'Project Manager',
  MEMBER: 'Team Member',
  CLIENT: 'Client',
};
export const DEFAULT_COLUMNS = [
  { key: 'backlog', name: 'Backlog', order: 0, isDone: false, color: '#94a3b8' },
  { key: 'todo', name: 'To Do', order: 1, isDone: false, color: '#60a5fa' },
  { key: 'in_progress', name: 'In Progress', order: 2, isDone: false, color: '#fbbf24', wipLimit: 5 },
  { key: 'code_review', name: 'Code Review', order: 3, isDone: false, color: '#a78bfa' },
  { key: 'testing', name: 'Testing', order: 4, isDone: false, color: '#22d3ee' },
  { key: 'completed', name: 'Completed', order: 5, isDone: true, color: '#34d399' },
] as const;

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type PriorityValue = (typeof PRIORITIES)[number];

export const PROJECT_STATUSES = ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'] as const;

/** Signals that make up the explainable project health score. Weights sum to 100. */
export const HEALTH_SIGNALS = [
  { key: 'overdue', label: 'Overdue ratio', weight: 30 },
  { key: 'blocked', label: 'Blocked dependency chains', weight: 20 },
  { key: 'velocity', label: 'Velocity trend', weight: 20 },
  { key: 'wip', label: 'WIP overload per person', weight: 15 },
  { key: 'silent', label: 'Silent tasks', weight: 15 },
] as const;

export const SILENT_TASK_DAYS = 5;
export const WIP_LIMIT_PER_PERSON = 4;

export const ALLOWED_UPLOAD_MIME = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/markdown',
  'text/csv',
  'video/mp4',
  'video/webm',
  'video/quicktime',
];

export const SOCKET_EVENTS = {
  messageNew: 'message:new',
  messageUpdate: 'message:update',
  reactionUpdate: 'reaction:update',
  taskUpdate: 'task:update',
  taskCreate: 'task:create',
  taskDelete: 'task:delete',
  notification: 'notification:new',
  presence: 'presence:update',
  typing: 'typing',
  suggestionNew: 'suggestion:new',
  activity: 'activity:new',
} as const;
