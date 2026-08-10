import type { Permission } from '@loop/shared';

/**
 * The database and the web app name permissions differently.
 *
 * `packages/shared` describes them at product granularity ('task.update.own',
 * 'workspace.audit.view'). The seeded `permissions` table — and, more
 * importantly, the RLS policies that were written against it — use a coarser
 * set ('task.update', 'workspace.manage'). The policy SQL hard-codes those
 * strings, so the database vocabulary is the one that cannot move; this table
 * translates on the way in.
 *
 * A `null` means the database has no matching permission because membership
 * alone is enough — RLS still scopes the rows, so the check is just skipped.
 */
const TO_DATABASE: Record<Permission, string | null> = {
  'workspace.update': 'workspace.manage',
  'workspace.delete': 'workspace.manage',
  'workspace.invite': 'member.manage',
  'workspace.member.manage': 'member.manage',
  // departments_manage is gated on member.manage, not workspace.manage.
  'workspace.department.manage': 'member.manage',
  'workspace.billing.view': 'workspace.manage',
  'workspace.integration.manage': 'workspace.manage',
  'workspace.analytics.view': 'analytics.read',
  'workspace.audit.view': 'workspace.manage',

  'project.create': 'project.create',
  'project.update': 'project.update',
  'project.delete': 'project.delete',
  'project.view': null,

  'sprint.manage': 'sprint.manage',

  'task.create': 'task.create',
  'task.update.any': 'task.update',
  'task.update.own': 'task.update',
  'task.delete': 'task.delete',
  'task.assign': 'task.update',
  'task.approve': 'task.update',
  'task.comment': 'comment.create',

  'wiki.read': 'wiki.read',
  'wiki.write': 'wiki.write',

  'file.upload': 'file.upload',
  'file.delete': 'file.delete',

  'chat.read': 'chat.read',
  'chat.write': 'chat.write',

  'time.log': 'time.log',
  'time.view.team': 'analytics.read',

  'meeting.manage': 'meeting.manage',
  'report.generate': 'analytics.read',

  'ai.suggestion.decide': 'suggestion.decide',
  'ai.ask': null,
};

export const toDatabasePermission = (permission: Permission): string | null => TO_DATABASE[permission] ?? null;
