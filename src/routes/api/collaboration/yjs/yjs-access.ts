/**
 * @file src/routes/api/collaboration/yjs/yjs-access.ts
 * @description Access helpers for the Yjs collaboration endpoint.
 *
 * Lives outside `+server.ts` because SvelteKit only allows HTTP-verb exports from
 * endpoint files — extra exports fail the production build's route analysis.
 *
 * ### Features:
 * - parseEntryDocId: only `entry:{collectionId}:{entryId}` channels are accepted
 * - assertCollaborationAccess: collection-scoped `collection:read|write`, then global
 */

import { AppError } from "@utils/error-handling";
import { hasPermissionWithRoles, hasPermissionByAction } from "@src/databases/auth/permissions";
import { isAdmin } from "@src/databases/auth/constants";
import type { Role, User } from "@src/databases/auth/types";

/** Parse `entry:{collectionId}:{entryId}` — collection ids are kebab-case, entry ids are UUIDs. */
export function parseEntryDocId(docId: string): { collectionId: string; entryId: string } {
  if (typeof docId !== "string" || !docId.startsWith("entry:")) {
    throw new AppError("Invalid collaboration docId", 400, "BAD_REQUEST");
  }
  const rest = docId.slice("entry:".length);
  const sep = rest.lastIndexOf(":");
  if (sep <= 0 || sep === rest.length - 1) {
    throw new AppError("Invalid collaboration docId", 400, "BAD_REQUEST");
  }
  const collectionId = rest.slice(0, sep);
  const entryId = rest.slice(sep + 1);
  if (!collectionId || !entryId) {
    throw new AppError("Invalid collaboration docId", 400, "BAD_REQUEST");
  }
  return { collectionId, entryId };
}

export function assertCollaborationAccess(
  user: User,
  roles: Role[] | undefined,
  action: "read" | "write",
  collectionId: string,
): void {
  if (isAdmin(user)) return;
  const scoped = hasPermissionByAction(user, action, "collection", collectionId, roles ?? []);
  const global = hasPermissionWithRoles(user, `collection:${action}`, roles ?? []);
  if (!scoped && !global) {
    throw new AppError("Forbidden: Insufficient permissions for this entry", 403, "FORBIDDEN");
  }
}
