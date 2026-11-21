/**
 * @file src/routes/api/collaboration/yjs/+server.ts
 * @description API endpoint for receiving Yjs updates from clients.
 *
 * Features:
 * - tenant-scoped Yjs docs (`tenantId:docId` in the service)
 * - docId must be `entry:{collectionId}:{entryId}` (reject arbitrary channels)
 * - collection-scoped ACL: `hasPermissionByAction(..., collectionId)` then global `collection:read/write`
 */

import { json } from "@sveltejs/kit";
import { apiHandler } from "@utils/api-handler";
import { raise } from "@utils/error-handling";
import { pubSub } from "@src/services/background/pub-sub";
import { isSecureCookieContext } from "@src/databases/auth/constants";
import { validateCsrfForRequest } from "@utils/security/csrf-utils";
import { isMultiTenantEnabled } from "@utils/tenant-isolation.server";
import { encodeYjsToBase64, decodeBase64ToYjs } from "@utils/tenant";
import type { Role, User } from "@src/databases/auth/types";
import { assertCollaborationAccess, parseEntryDocId } from "./yjs-access.ts";

const MAX_YJS_UPDATE_BASE64_LENGTH = 2 * 1024 * 1024; // 2 MiB cap

export const POST = apiHandler(async ({ locals, request, cookies, url }) => {
  const { user, tenantId, roles } = locals;
  if (!user) raise(401, "Unauthorized", "UNAUTHORIZED");
  if (!tenantId && isMultiTenantEnabled()) {
    raise(403, "Tenant context is required", "TENANT_REQUIRED");
  }
  const isSecure = isSecureCookieContext(url.protocol, url.hostname);
  const csrf = validateCsrfForRequest(cookies, request, isSecure);
  if (!csrf.isValid) {
    raise(403, `Security violation: ${csrf.error}`, "CSRF_VIOLATION");
  }
  const declaredLen = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLen) && declaredLen > MAX_YJS_UPDATE_BASE64_LENGTH) {
    raise(413, "Yjs update payload too large", "PAYLOAD_TOO_LARGE");
  }

  let body: { docId?: unknown; updateBase64?: unknown; awareness?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    raise(400, "Invalid JSON body", "BAD_REQUEST");
  }

  const { docId, updateBase64, awareness } = body;
  if (typeof docId !== "string" || typeof updateBase64 !== "string" || !docId || !updateBase64) {
    raise(400, "docId and updateBase64 are required", "BAD_REQUEST");
  }
  if (updateBase64.length > MAX_YJS_UPDATE_BASE64_LENGTH) {
    raise(413, "Yjs update payload too large", "PAYLOAD_TOO_LARGE");
  }

  const { collectionId } = parseEntryDocId(docId);
  assertCollaborationAccess(user as User, roles as Role[] | undefined, "write", collectionId);

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
  if (!user) raise(401, "Unauthorized", "UNAUTHORIZED");
  if (!tenantId && isMultiTenantEnabled()) {
    raise(403, "Tenant context is required", "TENANT_REQUIRED");
  }

  const docId = url.searchParams.get("docId");
  if (!docId) raise(400, "docId is required", "BAD_REQUEST");

  const { collectionId } = parseEntryDocId(docId);
  assertCollaborationAccess(user as User, roles as Role[] | undefined, "read", collectionId);

  const { yjsService } = await import("@src/services/collaboration/yjs-service");
  const state = yjsService.getFullState(docId, tenantId as string);

  return json({
    success: true,
    stateBase64: encodeYjsToBase64(state),
  });
});
