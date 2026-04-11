/**
 * @file src/routes/api/collections/[collectionId]/[entryId]/+server.ts
 * @description Thin API wrapper for entry-level operations delegating to Local SDK.
 */

import { json } from "@sveltejs/kit";
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";

export const GET = apiHandler(async ({ params, locals }) => {
  const { collectionId, entryId } = params;
  const { tenantId, cms } = locals;
  if (!cms) throw new AppError("CMS not initialized", 500);

  if (entryId === "revisions") {
    const result = await cms.collections.getRevisions(collectionId, entryId, tenantId);
    return json({ success: true, data: result });
  }

  const result = await cms.collections.findById(collectionId, entryId, { tenantId });
  return json(result);
});

export const PATCH = apiHandler(async ({ params, request, locals }) => {
  const { collectionId, entryId } = params;
  const { user, tenantId, cms } = locals;
  if (!cms) throw new AppError("CMS not initialized", 500);

  const data = await request.json();
  const result = await cms.collections.update(collectionId, entryId, data, { user, tenantId });

  return json(result);
});

export const DELETE = apiHandler(async ({ params, url, locals }) => {
  const { collectionId, entryId } = params;
  const { user, tenantId, cms } = locals;
  if (!cms) throw new AppError("CMS not initialized", 500);

  const permanent = url.searchParams.get("permanent") === "true";
  const result = await cms.collections.delete(collectionId, entryId, { user, tenantId, permanent });

  return json(result);
});
