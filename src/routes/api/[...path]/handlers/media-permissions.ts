/**
 * @file src/routes/api/[...path]/handlers/media-permissions.ts
 * @description Shared media permission check for the media route handlers.
 *
 * Extracted from `media.ts` so the transcode/batch modules can reuse the exact
 * same admin-bypass + role-permission rule without importing the dispatcher
 * (which would create a module cycle).
 */

import { hasPermissionWithRoles } from "@src/databases/auth/permissions";
import type { User } from "@src/databases/auth/types";
import type { RequestEvent } from "@sveltejs/kit";

export function hasMediaPermission(
  event: RequestEvent,
  user: unknown,
  permission: string,
): boolean {
  if (event.locals.isAdmin) return true;
  return !!user && hasPermissionWithRoles(user as User, permission, event.locals.roles || []);
}
