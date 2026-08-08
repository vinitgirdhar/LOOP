import { env } from '../env.js';

/**
 * Hand-written OpenAPI document served at /api/docs.
 * Kept compact on purpose: schemas for the shapes that matter, and every
 * route group listed with its auth and role requirements.
 */

const bearer = [{ bearerAuth: [] }];
const wsHeader = {
  name: 'x-workspace-id',
  in: 'query',
  required: false,
  schema: { type: 'string' },
  description: 'Workspace scope. Send as the x-workspace-id header or as a query parameter.',
};

const envelope = (dataSchema: object) => ({
  type: 'object',
  properties: { success: { type: 'boolean' }, data: dataSchema },
});

const errorResponse = {
  description: 'Error',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: { success: { type: 'boolean', example: false }, error: { type: 'string' }, code: { type: 'string' } },
      },
    },
  },
};

const okResponse = (schema: object = { type: 'object' }) => ({
  description: 'Success',
  content: { 'application/json': { schema: envelope(schema) } },
});

function op(
  tag: string,
  summary: string,
  options: {
    auth?: boolean;
    role?: string;
    body?: object;
    params?: object[];
    response?: object;
  } = {},
) {
  return {
    tags: [tag],
    summary,
    ...(options.role ? { description: `Requires role: ${options.role}` } : {}),
    ...(options.auth === false ? {} : { security: bearer }),
    ...(options.params ? { parameters: options.params } : {}),
    ...(options.body
      ? { requestBody: { required: true, content: { 'application/json': { schema: options.body } } } }
      : {}),
    responses: { '200': okResponse(options.response), '400': errorResponse, '401': errorResponse, '403': errorResponse },
  };
}

const idParam = (name: string) => ({ name, in: 'path', required: true, schema: { type: 'string' } });

export const openapiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Loop API',
    version: '1.0.0',
    description:
      'Enterprise project management and team collaboration platform (DevFusion 4.0, Problem Statement 5).\n\n' +
      '**Auth:** send `Authorization: Bearer <accessToken>`. Get one from `POST /api/auth/login` or `POST /api/auth/refresh` ' +
      '(the refresh token lives in an httpOnly cookie and rotates on every use).\n\n' +
      '**Tenancy:** every business endpoint is scoped by workspace. Send `x-workspace-id: <id>`.\n\n' +
      '**Envelope:** every response is `{ success, data, error?, meta? }`.',
  },
  servers: [{ url: env.API_URL, description: 'This deployment' }],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      Task: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          number: { type: 'integer' },
          title: { type: 'string' },
          description: { type: 'string', nullable: true },
          status: { type: 'string', description: 'Matches a BoardColumn key' },
          priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
          storyPoints: { type: 'integer', nullable: true },
          dueDate: { type: 'string', format: 'date-time', nullable: true },
          isBlocked: { type: 'boolean' },
          assigneeId: { type: 'string', nullable: true },
          sprintId: { type: 'string', nullable: true },
        },
      },
      AiSuggestion: {
        type: 'object',
        description: 'A proposal — never applied without a human decision unless the project enables auto-apply.',
        properties: {
          id: { type: 'string' },
          kind: { type: 'string', enum: ['MOVE_STATUS', 'FLAG_BLOCKED', 'ASSIGN', 'LINK_COMMIT', 'SPRINT_PLAN', 'ESTIMATE'] },
          title: { type: 'string' },
          rationale: { type: 'string' },
          confidence: { type: 'number', format: 'float' },
          status: { type: 'string', enum: ['PENDING', 'ACCEPTED', 'REJECTED', 'AUTO_APPLIED'] },
          evidence: {
            type: 'array',
            items: {
              type: 'object',
              properties: { type: { type: 'string' }, label: { type: 'string' }, url: { type: 'string', nullable: true }, quote: { type: 'string' } },
            },
          },
          proposedChange: { type: 'object' },
        },
      },
      HealthScore: {
        type: 'object',
        description: 'Computed by deterministic arithmetic. The model only writes the narrative.',
        properties: {
          score: { type: 'integer', minimum: 0, maximum: 100 },
          signals: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                key: { type: 'string' },
                label: { type: 'string' },
                weight: { type: 'integer' },
                penalty: { type: 'number' },
                contribution: { type: 'number' },
                detail: { type: 'string' },
              },
            },
          },
          actions: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, gain: { type: 'number' } } } },
          narrative: { type: 'string', nullable: true },
        },
      },
    },
  },
  tags: [
    { name: 'Auth', description: 'Signup, login, Google OAuth, sessions, 2FA' },
    { name: 'Workspaces', description: 'Tenancy, members, roles, invites, departments, audit' },
    { name: 'Projects', description: 'Projects, board columns, milestones, labels, health' },
    { name: 'Tasks', description: 'Tasks, subtasks, dependencies, comments, attachments, bulk actions' },
    { name: 'Sprints', description: 'Sprints, burndown, velocity' },
    { name: 'Wiki', description: 'Documentation pages and version history' },
    { name: 'Files', description: 'Uploads, folders, versions' },
    { name: 'Chat', description: 'Channels, DMs, threads, reactions' },
    { name: 'Meetings', description: 'Meetings, action items, ICS invites' },
    { name: 'Calendar', description: 'Unified calendar feed and availability' },
    { name: 'Time', description: 'Timers, manual logs, utilisation' },
    { name: 'Notifications', description: 'In-app notifications' },
    { name: 'Search', description: 'Permission-aware global search' },
    { name: 'Analytics', description: 'Dashboard, workload, reports, CSV export' },
    { name: 'AI', description: 'Auto-Pilot suggestions, Ask the Workspace, standup, sprint planning' },
    { name: 'Admin', description: 'Platform-wide administration' },
    { name: 'Webhooks', description: 'GitHub events feeding the Auto-Pilot' },
  ],
  paths: {
    '/api/health': { get: op('Auth', 'Service liveness probe', { auth: false }) },

    '/api/auth/register': {
      post: op('Auth', 'Create an account (email verification required before workspace creation)', {
        auth: false,
        body: { type: 'object', required: ['name', 'email', 'password'], properties: { name: { type: 'string' }, email: { type: 'string' }, password: { type: 'string' } } },
      }),
    },
    '/api/auth/verify-email': {
      post: op('Auth', 'Verify email with a link token or a 6 digit OTP', { auth: false, body: { type: 'object', properties: { token: { type: 'string' }, email: { type: 'string' }, otp: { type: 'string' } } } }),
    },
    '/api/auth/login': {
      post: op('Auth', 'Password login. Returns a 2FA ticket when two-factor is on', {
        auth: false,
        body: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string' }, password: { type: 'string' } } },
      }),
    },
    '/api/auth/login/2fa': { post: op('Auth', 'Complete login with a TOTP code', { auth: false, body: { type: 'object', properties: { ticket: { type: 'string' }, code: { type: 'string' } } } }) },
    '/api/auth/google': { get: op('Auth', 'Start the Google OAuth flow', { auth: false }) },
    '/api/auth/google/callback': { get: op('Auth', 'Google OAuth callback — sets the refresh cookie and redirects to the app', { auth: false }) },
    '/api/auth/refresh': { post: op('Auth', 'Rotate the refresh cookie and issue a new access token', { auth: false }) },
    '/api/auth/logout': { post: op('Auth', 'Revoke the current session', { auth: false }) },
    '/api/auth/logout-all': { post: op('Auth', 'Revoke every session on every device') },
    '/api/auth/me': { get: op('Auth', 'Current user and workspace memberships') },
    '/api/auth/sessions': { get: op('Auth', 'List active sessions') },
    '/api/auth/sessions/{id}': { delete: op('Auth', 'Revoke one session', { params: [idParam('id')] }) },
    '/api/auth/forgot-password': { post: op('Auth', 'Send a reset link and OTP', { auth: false, body: { type: 'object', properties: { email: { type: 'string' } } } }) },
    '/api/auth/reset-password': { post: op('Auth', 'Set a new password with a token or OTP', { auth: false, body: { type: 'object', properties: { token: { type: 'string' }, password: { type: 'string' } } } }) },
    '/api/auth/2fa/setup': { post: op('Auth', 'Generate a TOTP secret and QR code', { role: 'OWNER or platform admin' }) },
    '/api/auth/2fa/enable': { post: op('Auth', 'Turn on two-factor', { body: { type: 'object', properties: { code: { type: 'string' } } } }) },

    '/api/workspaces': {
      get: op('Workspaces', 'List workspaces the caller belongs to'),
      post: op('Workspaces', 'Create a workspace (email must be verified)', { body: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, organizationName: { type: 'string' } } } }),
    },
    '/api/workspaces/{workspaceId}': {
      get: op('Workspaces', 'Workspace detail', { params: [idParam('workspaceId')] }),
      patch: op('Workspaces', 'Update workspace', { params: [idParam('workspaceId')], role: 'OWNER' }),
      delete: op('Workspaces', 'Delete workspace', { params: [idParam('workspaceId')], role: 'OWNER' }),
    },
    '/api/workspaces/{workspaceId}/members': { get: op('Workspaces', 'List members with presence', { params: [idParam('workspaceId')] }) },
    '/api/workspaces/{workspaceId}/members/{memberId}': {
      patch: op('Workspaces', 'Change role, department, title or capacity', { params: [idParam('workspaceId'), idParam('memberId')], role: 'OWNER' }),
      delete: op('Workspaces', 'Remove a member', { params: [idParam('workspaceId'), idParam('memberId')], role: 'OWNER' }),
    },
    '/api/workspaces/{workspaceId}/invites': {
      get: op('Workspaces', 'Pending invites', { params: [idParam('workspaceId')], role: 'OWNER' }),
      post: op('Workspaces', 'Invite by email', { params: [idParam('workspaceId')], role: 'OWNER', body: { type: 'object', properties: { email: { type: 'string' }, role: { type: 'string', enum: ['OWNER', 'PM', 'MEMBER', 'CLIENT'] } } } }),
    },
    '/api/workspaces/{workspaceId}/audit-logs': { get: op('Workspaces', 'Workspace audit trail', { params: [idParam('workspaceId')], role: 'OWNER' }) },
    '/api/invites/{token}': { get: op('Workspaces', 'Preview an invite', { auth: false, params: [idParam('token')] }) },
    '/api/invites/{token}/accept': { post: op('Workspaces', 'Accept an invite', { params: [idParam('token')] }) },

    '/api/projects': {
      get: op('Projects', 'List visible projects with progress and health', { params: [wsHeader] }),
      post: op('Projects', 'Create a project (creates the default six board columns and a chat channel)', { role: 'PM', body: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, key: { type: 'string' }, memberIds: { type: 'array', items: { type: 'string' } } } } }),
    },
    '/api/projects/{projectId}': {
      get: op('Projects', 'Project detail with columns, members, milestones', { params: [idParam('projectId')] }),
      patch: op('Projects', 'Update a project', { params: [idParam('projectId')], role: 'PM' }),
      delete: op('Projects', 'Archive (default) or hard delete with ?hard=true', { params: [idParam('projectId')], role: 'OWNER' }),
    },
    '/api/projects/{projectId}/board': { get: op('Projects', 'Columns plus ordered tasks for the Kanban board', { params: [idParam('projectId')] }) },
    '/api/projects/{projectId}/columns': { post: op('Projects', 'Add a custom column', { params: [idParam('projectId')], role: 'PM' }) },
    '/api/projects/{projectId}/health': {
      get: op('Projects', 'Explainable health score. ?refresh=true also persists a snapshot and writes the AI narrative', {
        params: [idParam('projectId')],
        response: { $ref: '#/components/schemas/HealthScore' },
      }),
    },

    '/api/tasks': {
      get: op('Tasks', 'Filterable task list', { params: [wsHeader], response: { type: 'array', items: { $ref: '#/components/schemas/Task' } } }),
      post: op('Tasks', 'Create a task', { role: 'MEMBER', response: { $ref: '#/components/schemas/Task' } }),
    },
    '/api/tasks/{id}': {
      get: op('Tasks', 'Task detail', { params: [idParam('id')], response: { $ref: '#/components/schemas/Task' } }),
      patch: op('Tasks', 'Update a task. Members may only change their own tasks and only safe fields', { params: [idParam('id')] }),
      delete: op('Tasks', 'Delete a task', { params: [idParam('id')], role: 'PM' }),
    },
    '/api/tasks/{id}/move': { post: op('Tasks', 'Drag and drop: set column and index', { params: [idParam('id')], body: { type: 'object', properties: { status: { type: 'string' }, index: { type: 'integer' } } } }) },
    '/api/tasks/bulk': { post: op('Tasks', 'Bulk status / assignee / priority / sprint / label / delete', { role: 'PM' }) },
    '/api/tasks/{id}/comments': { get: op('Tasks', 'List comments', { params: [idParam('id')] }), post: op('Tasks', 'Add a comment (@mentions notify)', { params: [idParam('id')] }) },
    '/api/tasks/{id}/attachments': { post: op('Tasks', 'Upload up to 5 files (multipart/form-data)', { params: [idParam('id')] }) },
    '/api/tasks/{id}/dependencies': { post: op('Tasks', 'Add a blocker (cycles rejected)', { params: [idParam('id')], role: 'PM' }) },

    '/api/sprints': { get: op('Sprints', 'List sprints'), post: op('Sprints', 'Create a sprint', { role: 'PM' }) },
    '/api/sprints/{id}': { get: op('Sprints', 'Sprint detail with tasks, completion and blockers', { params: [idParam('id')] }) },
    '/api/sprints/{id}/start': { post: op('Sprints', 'Start the sprint', { params: [idParam('id')], role: 'PM' }) },
    '/api/sprints/{id}/complete': { post: op('Sprints', 'Close the sprint and roll over unfinished work', { params: [idParam('id')], role: 'PM' }) },
    '/api/sprints/{id}/burndown': { get: op('Sprints', 'Ideal line, actual burndown and burnup', { params: [idParam('id')] }) },
    '/api/sprints/velocity/{projectId}': { get: op('Sprints', 'Velocity across the last ten sprints', { params: [idParam('projectId')] }) },

    '/api/wiki': { get: op('Wiki', 'List pages (clients only see shared pages)'), post: op('Wiki', 'Create a page', { role: 'MEMBER' }) },
    '/api/wiki/{id}': { get: op('Wiki', 'Read a page', { params: [idParam('id')] }), patch: op('Wiki', 'Edit a page (bumps the version)', { params: [idParam('id')] }) },
    '/api/wiki/{id}/versions': { get: op('Wiki', 'Version history', { params: [idParam('id')] }) },
    '/api/wiki/{id}/restore/{version}': { post: op('Wiki', 'Restore an old version', { params: [idParam('id'), idParam('version')] }) },

    '/api/files': { get: op('Files', 'List files'), post: op('Files', 'Upload files (multipart/form-data, type and size validated)') },
    '/api/files/folders': { get: op('Files', 'List folders'), post: op('Files', 'Create a folder') },
    '/api/files/{id}/versions': { get: op('Files', 'Version chain for a file', { params: [idParam('id')] }) },

    '/api/chat/channels': { get: op('Chat', 'Channels with unread counts'), post: op('Chat', 'Create a channel') },
    '/api/chat/dm': { post: op('Chat', 'Open or reuse a direct message channel') },
    '/api/chat/channels/{id}/messages': { get: op('Chat', 'Message history (cursor via ?before=)', { params: [idParam('id')] }), post: op('Chat', 'Post a message with optional files', { params: [idParam('id')] }) },
    '/api/chat/messages/{id}/reactions': { post: op('Chat', 'Toggle an emoji reaction', { params: [idParam('id')] }) },

    '/api/meetings': { get: op('Meetings', 'List meetings'), post: op('Meetings', 'Create a meeting', { role: 'PM' }) },
    '/api/meetings/{id}/action-items': { post: op('Meetings', 'Turn an action item into a real task', { params: [idParam('id')] }) },
    '/api/meetings/{id}/invite.ics': { get: op('Meetings', 'Download a calendar invite', { params: [idParam('id')] }) },
    '/api/calendar': { get: op('Calendar', 'Deadlines, meetings, sprint dates, milestones and holidays in one feed') },
    '/api/calendar/availability': { get: op('Calendar', 'Free hours per member for the coming week') },

    '/api/time/start': { post: op('Time', 'Start a timer') },
    '/api/time/stop': { post: op('Time', 'Stop the running timer') },
    '/api/time': { get: op('Time', 'Time entries with totals by project and by day'), post: op('Time', 'Log time manually') },
    '/api/time/utilisation': { get: op('Time', 'Team utilisation against capacity', { role: 'PM' }) },

    '/api/notifications': { get: op('Notifications', 'List notifications with the unread count') },
    '/api/notifications/read-all': { post: op('Notifications', 'Mark everything as read') },

    '/api/search': { get: op('Search', 'Global search across projects, tasks, people, docs, messages and files', { params: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' } }, wsHeader] }) },

    '/api/dashboard': { get: op('Analytics', 'Active projects, my tasks, deadlines, sprint progress, activity, productivity') },
    '/api/analytics/overview': { get: op('Analytics', 'Workspace totals and 30 day throughput', { role: 'PM' }) },
    '/api/analytics/workload': { get: op('Analytics', 'Workload distribution per person', { role: 'PM' }) },
    '/api/analytics/projects': { get: op('Analytics', 'Per-project progress and health', { role: 'PM' }) },
    '/api/analytics/export.csv': { get: op('Analytics', 'CSV export of tasks', { role: 'PM' }) },

    '/api/ai/status': { get: op('AI', 'Which providers are configured (frontier = Groq, fallback = Gemini)') },
    '/api/ai/suggestions': { get: op('AI', 'Auto-Pilot inbox', { response: { type: 'array', items: { $ref: '#/components/schemas/AiSuggestion' } } }) },
    '/api/ai/suggestions/{id}/{decision}': {
      post: op('AI', 'Accept or reject a suggestion. Accepting applies the change and writes an audit entry', {
        params: [idParam('id'), { name: 'decision', in: 'path', required: true, schema: { type: 'string', enum: ['accept', 'reject'] } }],
        role: 'PM',
      }),
    },
    '/api/ai/ask': {
      post: op('AI', 'Ask the Workspace — permission-aware RAG with citations', {
        body: { type: 'object', required: ['question'], properties: { question: { type: 'string' } } },
        response: {
          type: 'object',
          properties: {
            answer: { type: 'string' },
            citations: { type: 'array', items: { type: 'object' } },
            restricted: { type: 'boolean', description: 'true when the asker is a CLIENT and retrieval was limited to shared sources' },
          },
        },
      }),
    },
    '/api/ai/standup/{projectId}': { get: op('AI', 'Daily standup digest built from real activity', { params: [idParam('projectId')] }) },
    '/api/ai/sprint-plan': { post: op('AI', 'Fill a sprint to capacity (deterministic greedy fill, AI writes the rationale)', { role: 'PM' }) },
    '/api/ai/estimate/{taskId}': { post: op('AI', 'Estimate story points and hours from the team history', { params: [idParam('taskId')], role: 'PM' }) },
    '/api/ai/reindex': { post: op('AI', 'Rebuild the embedding index for this workspace', { role: 'OWNER' }) },

    '/api/integrations': { get: op('Admin', 'Workspace integrations'), post: op('Admin', 'Connect GitHub, Slack, Google Calendar or Drive', { role: 'OWNER' }) },

    '/api/admin/stats': { get: op('Admin', 'Platform statistics', { role: 'Platform admin' }) },
    '/api/admin/users': { get: op('Admin', 'All users', { role: 'Platform admin' }) },
    '/api/admin/users/{id}': { patch: op('Admin', 'Suspend or promote a user', { params: [idParam('id')], role: 'Platform admin' }) },
    '/api/admin/organizations': { get: op('Admin', 'All organizations with plans', { role: 'Platform admin' }) },
    '/api/admin/roles': { get: op('Admin', 'Role and permission matrix from the database', { role: 'Platform admin' }) },
    '/api/admin/feature-flags': { get: op('Admin', 'Feature flags', { role: 'Platform admin' }), post: op('Admin', 'Create or update a flag', { role: 'Platform admin' }) },
    '/api/admin/audit-logs': { get: op('Admin', 'Platform-wide audit log', { role: 'Platform admin' }) },

    '/api/webhooks/github': { post: op('Webhooks', 'GitHub events (HMAC SHA-256 verified) that feed the Auto-Pilot', { auth: false }) },
    '/api/webhooks/github/simulate': { post: op('Webhooks', 'Simulate a GitHub event so the demo works without a public tunnel', { auth: false }) },
  },
} as const;
