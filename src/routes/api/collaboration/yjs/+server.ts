/**
 * @file src/routes/api/collaboration/yjs/+server.ts
 * @description API endpoint for receiving Yjs updates from clients.
 *
 * Features:
 * - tenant-scoped Yjs docs (`tenantId:docId` in the service)
 * - docId must be `entry:{collectionId}:{entryId}` (reject arbitrary channels)
 * - collection:read for GET, collection:write for POST (admin fast-path)
 */

import { json } from "@sveltejs/kit";
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";
import { pubSub } from "@src/services/background/pub-sub";
import { encodeYjsToBase64, decodeBase64ToYjs } from "@utils/tenant";
import { hasPermissionWithRoles } from "@src/databases/auth/permissions";
import { isAdmin } from "@src/databases/auth/constants";
import type { Role, User } from "@src/databases/auth/types";

/** Parse `entry:{collectionId}:{entryId}` — collection ids are kebab-case, entry ids are UUIDs. */
function parseEntryDocId(docId: string): { collectionId: string; entryId: string } {
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

function assertCollaborationAccess(
  user: User,
  roles: Role[] | undefined,
  capability: "collection:read" | "collection:write",
): void {
  if (isAdmin(user)) return;
  if (!hasPermissionWithRoles(user, capability, roles ?? [])) {
    throw new AppError("Forbidden: Insufficient permissions", 403, "FORBIDDEN");
  }
}

export const POST = apiHandler(async ({ locals, request }) => {
  const { user, tenantId, roles } = locals;
  if (!user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");

  const { docId, updateBase64, awareness } = await request.json();
  if (!docId || !updateBase64) {
    throw new AppError("docId and updateBase64 are required", 400, "BAD_REQUEST");
  }

  parseEntryDocId(docId);
  assertCollaborationAccess(user as User, roles as Role[] | undefined, "collection:write");

  // Convert base64 back to Uint8Array using native helper
  const update = decodeBase64ToYjs(updateBase64);

  // Ensure the YjsService singleton is instantiated (its constructor starts
  // the pubSub subscription loop) — otherwise a POST arriving before any GET
  // would publish into the void.
  const { yjsService } = await import("@src/services/collaboration/yjs-service");

  // 👥 Awareness (presence / cursors): apply + broadcast to the doc's SSE
  // subscribers. Distinct from document updates — carried on the same channel
  // for the throttled SseProvider.
  if (awareness === true) {
    yjsService.handleAwarenessUpdate(docId, update, tenantId as string);
    return json({ success: true });
  }

  // Publish to internal event bus
  // The YjsService will pick this up and apply it to the server-side doc
  pubSub.publish("yjs:update", {
    docId,
    update,
    origin: user._id,
    tenantId: tenantId as string,
  });

  return json({ success: true });
});

/**
 * GET endpoint to fetch the full initial state of a document
 */
export const GET = apiHandler(async ({ locals, url }) => {
  const { user, tenantId, roles } = locals;
  if (!user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");

  const docId = url.searchParams.get("docId");
  if (!docId) throw new AppError("docId is required", 400, "BAD_REQUEST");

  parseEntryDocId(docId);
  assertCollaborationAccess(user as User, roles as Role[] | undefined, "collection:read");

  const { yjsService } = await import("@src/services/collaboration/yjs-service");
  const state = yjsService.getFullState(docId, tenantId as string);

  return json({
    success: true,
    stateBase64: encodeYjsToBase64(state),
  });
});
