/**
 * @file src/routes/api/collections/[collectionId]/+server.ts
 * @description Thin API wrapper for collection-level operations delegating to Local SDK.
 */

import { json } from "@sveltejs/kit";
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";

export const GET = apiHandler(async ({ params, url, locals }) => {
  const { collectionId } = params;
  const { tenantId, cms } = locals;
  if (!cms) throw new AppError("CMS not initialized", 500);

  const limit = Number(url.searchParams.get("limit")) || 50;
  const offset = Number(url.searchParams.get("offset")) || 0;
  const filterParam = url.searchParams.get("filter");

  let filter = {};
  if (filterParam) {
    try {
      filter = JSON.parse(filterParam);
    } catch {
      /* ignore */
    }
  }

  const result = await cms.collections.find(collectionId, { tenantId, limit, offset, filter });
  return json(result);
});

export const POST = apiHandler(async ({ params, request, locals }) => {
  const { collectionId } = params;
  const { user, tenantId, cms } = locals;
  if (!cms) throw new AppError("CMS not initialized", 500);

  const data = await request.json();
  const result = await cms.collections.create(collectionId, data, { user, tenantId });

  return json(result);
});
