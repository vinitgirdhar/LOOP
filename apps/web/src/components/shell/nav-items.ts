import type { Permission, Role } from '@loop/shared';
import type { IconName } from '@/components/icons';

/**
 * One navigation model, two surfaces.
 *
 * The **drawer** (hamburger, mobile) and the **sidebar** (desktop) show the
 * complete, grouped index of the workspace plus account controls. The **bottom
 * bar** is deliberately not that list: it carries only the handful of places a
 * given role actually lives in, plus the one action that role performs most.
 * Keeping the two surfaces different is the whole point — a bottom bar that
 * mirrors the drawer is just a worse drawer.
 */

export type NavGroup = 'work' | 'knowledge' | 'insights' | 'workspace';

export interface NavItem {
  id: string;
  href: string;
  label: string;
  /** Bottom-bar label: one word, so five items fit on a 320px screen. */
  short: string;
  icon: IconName;
  group: NavGroup;
  /** Hidden when the caller lacks this permission — the API blocks it anyway. */
  permission?: Permission;
  badge?: 'suggestions' | 'chat';
  exact?: boolean;
  /** Shown under the label in the drawer, where there is room to explain. */
  hint?: string;
}

export const NAV_GROUP_LABELS: Record<NavGroup, string> = {
  work: 'Work',
  knowledge: 'Knowledge',
  insights: 'Insights',
  workspace: 'Workspace',
};

export const navItems = (workspaceId: string): NavItem[] => {
  const w = `/w/${workspaceId}`;
  return [
    { id: 'dashboard', href: w, label: 'Dashboard', short: 'Home', icon: 'home', group: 'work', exact: true, hint: 'Your day at a glance' },
    { id: 'projects', href: `${w}/projects`, label: 'Projects', short: 'Projects', icon: 'board', group: 'work', hint: 'Boards, milestones and members' },
    { id: 'tasks', href: `${w}/tasks`, label: 'My tasks', short: 'Tasks', icon: 'check', group: 'work', permission: 'task.update.own', hint: 'Everything assigned to you' },
    { id: 'sprints', href: `${w}/sprints`, label: 'Sprints', short: 'Sprints', icon: 'sprint', group: 'work', permission: 'sprint.manage', hint: 'Capacity, burndown and velocity' },
    { id: 'autopilot', href: `${w}/autopilot`, label: 'Auto-Pilot', short: 'Auto', icon: 'bolt', group: 'work', badge: 'suggestions', permission: 'ai.suggestion.decide', hint: 'Suggestions waiting on a decision' },

    { id: 'chat', href: `${w}/chat`, label: 'Chat', short: 'Chat', icon: 'chat', group: 'knowledge', permission: 'chat.read', badge: 'chat', hint: 'Channels, threads and DMs' },
    { id: 'docs', href: `${w}/docs`, label: 'Docs', short: 'Docs', icon: 'doc', group: 'knowledge', permission: 'wiki.read', hint: 'Wiki pages across every project' },
    { id: 'boards', href: `${w}/boards`, label: 'Boards', short: 'Boards', icon: 'sparkles', group: 'knowledge', permission: 'wiki.write', hint: 'Mind maps and whiteboards' },
    { id: 'files', href: `${w}/files`, label: 'Files', short: 'Files', icon: 'folder', group: 'knowledge', permission: 'file.upload', hint: 'Every attachment in one place' },
    { id: 'ask', href: `${w}/ask`, label: 'Ask workspace', short: 'Ask', icon: 'sparkles', group: 'knowledge', permission: 'ai.ask', hint: 'Answers with citations you can open' },

    { id: 'calendar', href: `${w}/calendar`, label: 'Calendar', short: 'Calendar', icon: 'calendar', group: 'insights', hint: 'Deadlines and meetings by month' },
    { id: 'meetings', href: `${w}/meetings`, label: 'Meetings', short: 'Meets', icon: 'video', group: 'insights', permission: 'meeting.manage', hint: 'Agendas, notes and action items' },
    { id: 'time', href: `${w}/time`, label: 'Time', short: 'Time', icon: 'clock', group: 'insights', permission: 'time.log', hint: 'Timers, logs and utilisation' },
    { id: 'analytics', href: `${w}/analytics`, label: 'Analytics', short: 'Stats', icon: 'chart', group: 'insights', permission: 'workspace.analytics.view', hint: 'Throughput, health and workload' },

    { id: 'settings', href: `${w}/settings`, label: 'Settings', short: 'Settings', icon: 'settings', group: 'workspace', permission: 'workspace.update', hint: 'Members, roles and integrations' },
  ];
};

/**
 * The four destinations each role opens most. Order matters — it is the order
 * they appear in the bottom bar, left to right.
 */
const BOTTOM_BAR_BY_ROLE: Record<Role, string[]> = {
  // Owners run the workspace: health of everything, then the decisions queue.
  OWNER: ['dashboard', 'projects', 'autopilot', 'analytics'],
  // PMs live in delivery: boards and sprints, with the suggestion inbox close.
  PM: ['dashboard', 'projects', 'sprints', 'autopilot'],
  // Members live in their own queue and the conversation around it.
  MEMBER: ['dashboard', 'tasks', 'projects', 'chat'],
  // Clients get progress and answers, nothing operational.
  CLIENT: ['dashboard', 'projects', 'ask', 'calendar'],
};

/** Filled in when a role's preferred item is hidden by permissions. */
const BOTTOM_BAR_FALLBACK = ['dashboard', 'projects', 'tasks', 'chat', 'docs', 'calendar', 'ask', 'settings'];

export function bottomNavItems(items: NavItem[], role: Role | null): NavItem[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const wanted = role ? BOTTOM_BAR_BY_ROLE[role] : BOTTOM_BAR_BY_ROLE.MEMBER;
  const picked: NavItem[] = [];

  for (const id of [...wanted, ...BOTTOM_BAR_FALLBACK]) {
    if (picked.length === 4) break;
    const item = byId.get(id);
    if (item && !picked.includes(item)) picked.push(item);
  }
  return picked;
}

export interface QuickAction {
  id: string;
  label: string;
  hint: string;
  icon: IconName;
  href: string;
  permission?: Permission;
}

/**
 * The bottom bar's fifth slot. Not navigation — the things this role can add.
 * Anything the role cannot do is filtered out; a client can create nothing, so
 * the slot collapses and their bar shows four destinations instead.
 */
export function quickActions(workspaceId: string): QuickAction[] {
  const w = `/w/${workspaceId}`;
  return [
    { id: 'task', label: 'New task', hint: 'Add work to a board', icon: 'check', href: `${w}/projects?new=task`, permission: 'task.create' },
    { id: 'project', label: 'New project', hint: 'Board, wiki and channel', icon: 'board', href: `${w}/projects?new=1`, permission: 'project.create' },
    { id: 'timer', label: 'Log time', hint: 'Start or record a session', icon: 'clock', href: `${w}/time?new=1`, permission: 'time.log' },
    { id: 'meeting', label: 'Schedule meeting', hint: 'Agenda and attendees', icon: 'video', href: `${w}/meetings?new=1`, permission: 'meeting.manage' },
  ];
}
