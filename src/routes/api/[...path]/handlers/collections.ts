/**
 * @file src/routes/api/[...path]/handlers/collections.ts
 * @description Collections management handlers for the dispatcher.
 */

import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "../../cms";
import type { DatabaseId } from "@src/content/types";
import { successResponse, rawResponse } from "./base";

export async function handleCollectionsRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { request, url, locals } = event;
  const { user } = locals;
  const method = segments[1];
  const entryId = segments[2];

  // --- Collection Search ---
  if (method === "search" && request.method === "GET") {
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
      isAdmin: (locals as any).isAdmin,
    });
    return successResponse(event, result);
  }

  const collectionId = method;

  // --- Revisions ---
  if (request.method === "GET" && collectionId && entryId === "revisions") {
    const result = await cms.collections.getRevisions(collectionId, entryId, tenantId);
    return successResponse(event, result);
  }

  // --- Standard CRUD ---
  if (request.method === "GET") {
    if (!method || method === "list") {
      const includeFields = url.searchParams.get("includeFields") === "true";
      const includeStats = url.searchParams.get("includeStats") === "true";
      const result = await cms.collections.list({ tenantId, includeFields, includeStats });

      if (url.searchParams.get("raw") === "true") return rawResponse(event, result);
      return successResponse(event, result);
    }

    if (entryId) {
      const data = await cms.collections.findById(collectionId, entryId, { tenantId });
      return successResponse(event, data);
    } else {
      const limit = Number(url.searchParams.get("limit")) || 50;
      const offset = Number(url.searchParams.get("offset")) || 0;
      const result = await cms.collections.find(collectionId, { tenantId, limit, offset });
      return successResponse(event, result);
    }
  }

  if (request.method === "POST") {
    const data = await request.json();
    const result = await cms.collections.create(collectionId, data, { user: user!, tenantId });
    return successResponse(event, result, 201);
  }

  if (request.method === "PATCH" && entryId) {
    const data = await request.json();
    const result = await cms.collections.update(collectionId, entryId, data, {
      user: user!,
      tenantId,
    });
    return successResponse(event, result);
  }

  if (request.method === "DELETE" && entryId) {
    const permanent = url.searchParams.get("permanent") === "true";
    const result = await cms.collections.delete(collectionId, entryId, {
      user: user!,
      tenantId,
      permanent,
    });
    return successResponse(event, result);
  }

  throw new AppError(
    `Collections endpoint /api/collections/${segments.join("/")} not implemented`,
    404,
  );
}
