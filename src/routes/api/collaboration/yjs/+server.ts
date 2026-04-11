/**
 * @file src/routes/api/collaboration/yjs/+server.ts
 * @description API endpoint for receiving Yjs updates from clients.
 */

import { json } from "@sveltejs/kit";
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";
import { pubSub } from "@src/services/pub-sub";
import { encodeYjsToBase64, decodeBase64ToYjs } from "@utils/tenant-utils";

export const POST = apiHandler(async ({ locals, request }) => {
  const { user, tenantId } = locals;
  if (!user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");

  const { docId, updateBase64 } = await request.json();
  if (!docId || !updateBase64) {
    throw new AppError("docId and updateBase64 are required", 400, "BAD_REQUEST");
  }

  // Convert base64 back to Uint8Array using native helper
  const update = decodeBase64ToYjs(updateBase64);

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
  const { user, tenantId } = locals;
  if (!user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");

  const docId = url.searchParams.get("docId");
  if (!docId) throw new AppError("docId is required", 400, "BAD_REQUEST");

  const { yjsService } = await import("@src/services/collaboration/yjs-service");
  const state = yjsService.getFullState(docId, tenantId as string);

  return json({
    success: true,
    stateBase64: encodeYjsToBase64(state),
  });
});
