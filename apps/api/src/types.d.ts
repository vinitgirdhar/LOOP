import type { Role } from '@loop/shared';

declare global {
  namespace Express {
    interface AuthUser {
      id: string;
      email: string;
      name: string;
      isPlatformAdmin: boolean;
      sessionId: string;
    }

    interface WorkspaceContext {
      workspaceId: string;
      role: Role;
      memberId: string | null;
      /** true when access came from platform-admin override rather than membership */
      viaAdmin: boolean;
    }

    interface Request {
      user?: AuthUser;
      ws?: WorkspaceContext;
      projectId?: string;
    }
  }
}

export {};
