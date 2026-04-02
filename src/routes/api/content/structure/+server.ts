/**
 * @file src/routes/api/content/structure/+server.ts
 * @description Thin API wrapper for content structure management delegating to Local SDK.
 */

import { json } from "@sveltejs/kit";
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";

/**
 * Supported RPC Actions for Content Structure
 */
type ContentStructureAction =
  | "getStructure"
  | "getContentStructure"
  | "reorderContentStructure"
  | "refresh"
  | "recompile"
  | "refreshCollections";

export const GET = apiHandler(async ({ url, locals }) => {
  const { tenantId, cms } = locals;
  const action = (url.searchParams.get("action") || "getStructure") as ContentStructureAction;

  if (!cms) throw new AppError("CMS not initialized", 500);

  switch (action) {
    case "getStructure":
    case "getContentStructure":
      const nodes = await cms.getContentStructure(tenantId ?? undefined);
      return json({
        success: true,
        contentNodes: nodes,
        version: cms.version,
      });

    default:
      throw new AppError(`Invalid GET action: ${action}`, 400, "INVALID_ACTION");
  }
});

export const POST = apiHandler(async ({ request, locals }) => {
  const { tenantId, cms } = locals;

  // Graceful JSON parsing
  let body: any;
  try {
    body = await request.json();
  } catch {
    throw new AppError("Malformed JSON payload", 400, "MALFORMED_JSON");
  }

  const { action, items } = body;
  if (!cms) throw new AppError("CMS not initialized", 500);

  switch (action as ContentStructureAction) {
    case "reorderContentStructure":
      // Strict Input Validation
      if (!Array.isArray(items)) {
        throw new AppError("Items must be an array for reordering", 422, "VALIDATION_ERROR");
      }
      const updated = await cms.collections.reorderContentNodes(items, tenantId ?? undefined);
      return json({ success: true, contentStructure: updated });

    case "refresh":
    case "recompile":
    case "refreshCollections":
      await cms.collections.refresh(tenantId ?? undefined);
      return json({ success: true, message: "Content structure refreshed" });

    default:
      throw new AppError(`Invalid POST action: ${action}`, 400, "INVALID_ACTION");
  }
});
