/**
 * @file src/routes/api/collections/search/+server.ts
 * @description Thin API wrapper for searching collections delegating to Local SDK.
 */

import { json } from "@sveltejs/kit";
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";

export const GET = apiHandler(async ({ url, locals }) => {
  const { user, tenantId, cms, isAdmin } = locals;
  if (!cms) throw new AppError("CMS not initialized", 500);

  const query = url.searchParams.get("q") || "";
  const collectionsParam = url.searchParams.get("collections");
  const collections = collectionsParam
    ? collectionsParam.split(",").map((c: string) => c.trim())
    : undefined;

  const page = Number(url.searchParams.get("page") ?? 1);
  const limit = Number(url.searchParams.get("limit") ?? 25);
  const sortField = url.searchParams.get("sortField") || "updatedAt";
  const sortDirection = (url.searchParams.get("sortDirection") as "asc" | "desc") || "desc";
  const status = url.searchParams.get("status") || undefined;
  const filterParam = url.searchParams.get("filter");

  let filter = {};
  if (filterParam) {
    try {
      filter = JSON.parse(filterParam);
    } catch {
      /* ignore */
    }
  }

  const result = await cms.collections.search(query, {
    collections,
    tenantId,
    user,
    page,
    limit,
    sortField,
    sortDirection,
    filter,
    status,
    isAdmin,
  });

  return json({ success: true, data: result });
});
