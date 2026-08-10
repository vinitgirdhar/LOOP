import { ROLE_LABELS, ROLE_PERMISSIONS, ROLES, PERMISSIONS } from '@loop/shared';
import { requireUser } from '@/lib/server/context';
import { ok, route } from '@/lib/server/http';

/** The role matrix, for the settings screen that explains who can do what. */
export const GET = route(async () => {
  await requireUser();

  return ok(
    ROLES.map((role) => ({
      key: role,
      label: ROLE_LABELS[role],
      permissions: ROLE_PERMISSIONS[role].map((permission) => ({
        key: permission,
        description: PERMISSIONS[permission],
      })),
    })),
  );
});
