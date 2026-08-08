import type { Permission } from '@loop/shared';
import type { IconName } from '@/components/icons';

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** Hidden when the caller lacks this permission — the API blocks it anyway. */
  permission?: Permission;
  /** Shown in the mobile bottom bar rather than behind "More". */
  primary?: boolean;
  badge?: 'suggestions' | 'chat';
  exact?: boolean;
}

export const navItems = (workspaceId: string): NavItem[] => [
  { href: `/w/${workspaceId}`, label: 'Dashboard', icon: 'home', primary: true, exact: true },
  { href: `/w/${workspaceId}/projects`, label: 'Projects', icon: 'board', primary: true },
  { href: `/w/${workspaceId}/tasks`, label: 'My tasks', icon: 'check' },
  { href: `/w/${workspaceId}/sprints`, label: 'Sprints', icon: 'sprint', permission: 'project.view' },
  { href: `/w/${workspaceId}/autopilot`, label: 'Auto-Pilot', icon: 'bolt', badge: 'suggestions', primary: true },
  { href: `/w/${workspaceId}/ask`, label: 'Ask workspace', icon: 'sparkles', permission: 'ai.ask' },
  { href: `/w/${workspaceId}/chat`, label: 'Chat', icon: 'chat', permission: 'chat.read', primary: true, badge: 'chat' },
  { href: `/w/${workspaceId}/docs`, label: 'Docs', icon: 'doc' },
  { href: `/w/${workspaceId}/files`, label: 'Files', icon: 'folder' },
  { href: `/w/${workspaceId}/calendar`, label: 'Calendar', icon: 'calendar' },
  { href: `/w/${workspaceId}/meetings`, label: 'Meetings', icon: 'video' },
  { href: `/w/${workspaceId}/time`, label: 'Time', icon: 'clock', permission: 'time.log' },
  { href: `/w/${workspaceId}/analytics`, label: 'Analytics', icon: 'chart', permission: 'workspace.analytics.view' },
  { href: `/w/${workspaceId}/settings`, label: 'Settings', icon: 'settings' },
];
