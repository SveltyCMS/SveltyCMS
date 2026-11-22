/**
 * @file src/services/collaboration/access.ts
 * @description Boolean collaboration ACL shared by the Yjs HTTP endpoints and the
 * `/api/events` SSE bridge.
 *
 * ### Features:
 * - admin bypass, then collection-scoped `collection:{action}` grant
 * - global `collection:{action}` fallback (same rule as `assertCollaborationAccess`)
 * - non-throwing, so stream filters can drop an event without exception control flow
 */

import { hasPermissionByAction, hasPermissionWithRoles } from "@src/databases/auth/permissions";
import { isAdmin } from "@src/databases/auth/constants";
import type { Role, User } from "@src/databases/auth/types";

/** Whether `user` may perform `action` on entries of `collectionId`. */
export function hasCollaborationAccess(
  user: User | null | undefined,
  roles: Role[] | undefined,
  action: "read" | "write",
  collectionId: string,
): boolean {
  if (!user || !collectionId) return false;
  if (isAdmin(user)) return true;

  const safeRoles = roles ?? [];
  return (
    hasPermissionByAction(user, action, "collection", collectionId, safeRoles) ||
    hasPermissionWithRoles(user, `collection:${action}`, safeRoles)
  );
}
