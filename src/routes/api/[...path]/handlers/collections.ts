/**
 * @file src/routes/api/[...path]/handlers/collections.ts
 * @description Collections management handlers for the dispatcher.
 */

import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import { successResponse, rawResponse } from "./base";
import { streamingJsonResponse } from "./streaming";

export async function handleCollectionsRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { request, url, locals } = event;
  const { user } = locals;
  const collectionId = segments[1];
  const entryId = segments[2];
  const subAction = segments[3];

  // --- Collection Search ---
  if (collectionId === "search" && request.method === "GET") {
    return handleCollectionSearch(event, cms, tenantId, user, url, locals);
  }

  // --- Revisions ---
  // Matches: /api/collections/:id/revisions OR /api/collections/:id/:entryId/revisions
  if (
    request.method === "GET" &&
    collectionId &&
    (entryId === "revisions" || subAction === "revisions")
  ) {
    const targetEntryId = subAction === "revisions" ? entryId : null;
    return successResponse(
      event,
      await cms.collections.getRevisions(collectionId, targetEntryId as string, { tenantId }),
    );
  }

  // --- Standard CRUD ---
  if (request.method === "GET") {
    if (!collectionId || collectionId === "list")
      return handleCollectionList(event, cms, tenantId, url);
    if (entryId) return handleCollectionEntry(event, cms, tenantId, collectionId, entryId);

    const limit = Number(url.searchParams.get("limit")) || 50;
    const offset = Number(url.searchParams.get("offset")) || 0;
    const sortField = url.searchParams.get("sortField") || undefined;
    const sortDirection = (url.searchParams.get("sortDirection") as "asc" | "desc") || "desc";

    // 🚀 Performance: Use Streaming for large datasets (>500 items) or if explicitly requested
    const isLargeRequest = limit > 500;
    if (url.searchParams.get("stream") === "true" || isLargeRequest) {
      const iterator = await cms.collections.findStreaming(collectionId, {
        tenantId,
        user,
        limit,
        offset,
        sortField,
        sortDirection,
      });

      // Get total count for metadata if requested
      let totalCount: number | undefined;
      if (url.searchParams.get("includeCount") === "true") {
        const countRes = await cms.collections.count(collectionId, { tenantId });
        if (countRes.success) totalCount = countRes.data;
      }

      return streamingJsonResponse(iterator, totalCount);
    }

    return successResponse(
      event,
      await cms.collections.find(collectionId, {
        tenantId,
        limit,
        offset,
        sortField,
        sortDirection,
      }),
    );
  }

  if (request.method === "POST" && entryId === "bulk")
    return handleCollectionBulkCreate(event, cms, tenantId, user, collectionId);
  if (request.method === "PATCH" && entryId === "bulk")
    return handleCollectionBulkUpdate(event, cms, tenantId, user, collectionId);
  if (request.method === "DELETE" && entryId === "bulk")
    return handleCollectionBulkDelete(event, cms, tenantId, user, collectionId);

  if (request.method === "POST")
    return handleCollectionCreate(event, cms, tenantId, user, collectionId);
  if (request.method === "PATCH" && entryId)
    return handleCollectionUpdate(event, cms, tenantId, user, collectionId, entryId);
  if (request.method === "DELETE" && entryId)
    return handleCollectionDelete(event, cms, tenantId, user, url, collectionId, entryId);

  throw new AppError(
    `Collections endpoint /api/collections/${segments.join("/")} not implemented`,
    404,
  );
}

export async function handleCollectionSearch(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
  url: URL,
  locals: any,
) {
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

export async function handleCollectionList(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  url: URL,
) {
  const includeFields = url.searchParams.get("includeFields") === "true";
  const includeStats = url.searchParams.get("includeStats") === "true";
  const result = await cms.collections.list({ tenantId, includeFields, includeStats });
  return url.searchParams.get("raw") === "true"
    ? rawResponse(event, result)
    : successResponse(event, result);
}

export async function handleCollectionEntry(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  collectionId: string,
  entryId: string,
) {
  return successResponse(
    event,
    await cms.collections.findById(collectionId, entryId, { tenantId }),
  );
}

export async function handleCollectionCreate(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
  collectionId: string,
) {
  const result = await cms.collections.create(collectionId, await event.request.json(), {
    user: user!,
    tenantId,
  });
  return successResponse(event, result, 201);
}

export async function handleCollectionUpdate(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
  collectionId: string,
  entryId: string,
) {
  const result = await cms.collections.update(collectionId, entryId, await event.request.json(), {
    user: user!,
    tenantId,
  });
  return successResponse(event, result);
}

export async function handleCollectionDelete(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
  url: URL,
  collectionId: string,
  entryId: string,
) {
  const permanent = url.searchParams.get("permanent") === "true";
  const result = await cms.collections.delete(collectionId, entryId, {
    user: user!,
    tenantId,
    permanent,
  });
  return successResponse(event, result);
}

export async function handleCollectionBulkCreate(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
  collectionId: string,
) {
  const result = await cms.collections.bulkCreate(collectionId, await event.request.json(), {
    user: user!,
    tenantId,
  });
  return successResponse(event, result, 201);
}

export async function handleCollectionBulkUpdate(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
  collectionId: string,
) {
  const result = await cms.collections.bulkUpdate(collectionId, await event.request.json(), {
    user: user!,
    tenantId,
  });
  return successResponse(event, result);
}

export async function handleCollectionBulkDelete(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
  collectionId: string,
) {
  const result = await cms.collections.bulkDelete(collectionId, await event.request.json(), {
    user: user!,
    tenantId,
  });
  return successResponse(event, result);
}
