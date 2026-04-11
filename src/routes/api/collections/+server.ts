/**
 * @file src/routes/api/collections/+server.ts
 * @description Thin API wrapper for listing collections delegating to Local SDK.
 */

import { json } from "@sveltejs/kit";
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";

export const GET = apiHandler(async ({ url, locals }) => {
  const { tenantId, cms } = locals;
  if (!cms) throw new AppError("CMS not initialized", 500);

  const includeFields = url.searchParams.get("includeFields") === "true";
  const includeStats = url.searchParams.get("includeStats") === "true";

  const collections = await cms.collections.list({ tenantId, includeFields, includeStats });

  if (url.searchParams.get("raw") === "true") {
    return json(collections);
  }
  return json({ success: true, data: collections });
});
