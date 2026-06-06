/**
 * @file src/routes/api/[...path]/handlers/collections.ts
 * @description Enterprise collections CRUD, search, bulk operations, revision history, streaming, and atomic increments.
 *
 * Responsibilities:
 * - Full CRUD (list, find, create, update, delete) with filter/sort/pagination
 * - Bulk operations (create, update, delete) for batch workflows
 * - Atomic increment for counter fields (views, likes, etc.)
 * - Cross-collection search with pagination
 * - Revision history retrieval
 * - Streaming JSON responses for large datasets (>500 items)
 */

import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import { successResponse, rawResponse } from "./base";
import { streamingJsonResponse } from "./streaming";

// ─── Main Dispatcher ─────────────────────────────────────────────────────────

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

  try {
    // ── Cross-collection search ──
    if (collectionId === "search" && request.method === "GET") {
      return handleCollectionSearch(event, cms, tenantId, user, url, locals);
    }

    // ── Revision history ──
    // GET /api/collections/:id/revisions  or  GET /api/collections/:id/:entryId/revisions
    if (
      request.method === "GET" &&
      collectionId &&
      (entryId === "revisions" || subAction === "revisions")
    ) {
      const targetId = subAction === "revisions" ? entryId : null;
      return successResponse(
        event,
        await cms.collections.getRevisions(collectionId, targetId as string, {
          tenantId,
        }),
      );
    }

    // ── CRUD routing ──
    switch (request.method) {
      case "GET":
        return handleGetRoutes(event, cms, tenantId, user, collectionId, entryId, url);

      case "POST":
        return handlePostRoutes(event, cms, tenantId, user, collectionId, entryId, subAction);

      case "PATCH":
        return handlePatchRoutes(event, cms, tenantId, user, collectionId, entryId);

      case "DELETE":
        return handleDeleteRoutes(event, cms, tenantId, user, collectionId, entryId, url);
    }

    throw new AppError(
      `Collections endpoint /api/collections/${segments.join("/")} not implemented`,
      404,
    );
  } catch (err: any) {
    if (process.env.SVELTY_BENCHMARK_SUITE !== "true" && process.env.BENCHMARK !== "true") {
      console.error(`[CollectionsRoute Error] ${segments.join("/")}:`, err);
    }
    if (err instanceof AppError) throw err;
    throw new AppError(
      err instanceof Error ? err.message : String(err) || "Collection operation failed",
      500,
    );
  }
}

// ─── HTTP Method Routers ─────────────────────────────────────────────────────

async function handleGetRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
  collectionId: string | undefined,
  entryId: string | undefined,
  url: URL,
) {
  // List all collections
  if (!collectionId || collectionId === "list") {
    return handleCollectionList(event, cms, tenantId, url);
  }

  // Get single entry
  if (entryId) {
    return handleCollectionEntry(event, cms, tenantId, collectionId, entryId);
  }

  // Find entries with filter/sort/pagination/streaming
  return handleCollectionFind(event, cms, tenantId, user, collectionId, url);
}

async function handlePostRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
  collectionId: string,
  entryId: string | undefined,
  subAction: string | undefined,
) {
  if (entryId === "bulk")
    return handleCollectionBulkCreate(event, cms, tenantId, user, collectionId);
  if (subAction === "increment")
    return handleCollectionIncrement(event, cms, tenantId, user, collectionId, entryId!);
  return handleCollectionCreate(event, cms, tenantId, user, collectionId);
}

async function handlePatchRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
  collectionId: string,
  entryId: string | undefined,
) {
  if (entryId === "bulk")
    return handleCollectionBulkUpdate(event, cms, tenantId, user, collectionId);
  if (entryId) return handleCollectionUpdate(event, cms, tenantId, user, collectionId, entryId);
  throw new AppError("Entry ID required for update", 400);
}

async function handleDeleteRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
  collectionId: string,
  entryId: string | undefined,
  url: URL,
) {
  if (entryId === "bulk")
    return handleCollectionBulkDelete(event, cms, tenantId, user, collectionId);
  if (entryId)
    return handleCollectionDelete(event, cms, tenantId, user, url, collectionId, entryId);
  throw new AppError("Entry ID required for delete", 400);
}

// ─── Read Handlers ───────────────────────────────────────────────────────────

export async function handleCollectionList(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  url: URL,
) {
  const includeFields = url.searchParams.get("includeFields") === "true";
  const includeStats = url.searchParams.get("includeStats") === "true";
  const result = await cms.collections.list({
    tenantId,
    includeFields,
    includeStats,
  });
  return url.searchParams.get("raw") === "true"
    ? rawResponse(event, result)
    : successResponse(event, result);
}

export async function handleCollectionFind(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
  collectionId: string,
  url: URL,
) {
  const limit = Number(url.searchParams.get("limit")) || 50;
  const offset = Number(url.searchParams.get("offset")) || 0;
  const sortField = url.searchParams.get("sortField") || url.searchParams.get("sort") || undefined;
  const sortDirection = (url.searchParams.get("sortDirection") ||
    url.searchParams.get("order") ||
    "desc") as "asc" | "desc";
  const publicationFilter = url.searchParams.get("publicationFilter") as
    | "published"
    | "draft"
    | "all"
    | undefined;

  // Parse filters from both query string formats
  const filter: Record<string, any> = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (key.startsWith("filter[")) {
      filter[key.slice(7, -1)] = value;
    }
  }
  const filterJson = url.searchParams.get("filter");
  if (filterJson) {
    try {
      Object.assign(filter, JSON.parse(filterJson));
    } catch {
      /* ignore */
    }
  }

  // Streaming for large datasets or explicit stream requests
  const isLargeRequest = limit > 500;
  if (url.searchParams.get("stream") === "true" || isLargeRequest) {
    const iterator = await cms.collections.findStreaming(collectionId, {
      tenantId,
      user,
      limit,
      offset,
      sortField,
      sortDirection,
      filter,
      publicationFilter,
    });

    let totalCount: number | undefined;
    if (url.searchParams.get("includeCount") === "true") {
      const countRes = await cms.collections.count(collectionId, { tenantId });
      if (countRes.success) totalCount = countRes.data;
    }
    return streamingJsonResponse(iterator, totalCount);
  }

  const bypassCache =
    url.searchParams.get("bypassCache") === "true" || url.searchParams.get("nocache") === "true";

  return successResponse(
    event,
    await cms.collections.find(collectionId, {
      tenantId,
      limit,
      offset,
      sortField,
      sortDirection,
      filter,
      publicationFilter,
      bypassCache,
    }),
  );
}

export async function handleCollectionEntry(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  collectionId: string,
  entryId: string,
) {
  const bypassCache =
    event.url.searchParams.get("bypassCache") === "true" ||
    event.url.searchParams.get("nocache") === "true";
  return successResponse(
    event,
    await cms.collections.findById(collectionId, entryId, {
      tenantId,
      bypassCache,
    }),
  );
}

// ─── Write Handlers ──────────────────────────────────────────────────────────

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
  return successResponse(
    event,
    await cms.collections.update(collectionId, entryId, await event.request.json(), {
      user: user!,
      tenantId,
    }),
  );
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
  return successResponse(
    event,
    await cms.collections.delete(collectionId, entryId, {
      user: user!,
      tenantId,
      permanent,
    }),
  );
}

// ─── Bulk Operation Handlers ─────────────────────────────────────────────────

export async function handleCollectionBulkCreate(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
  collectionId: string,
) {
  return successResponse(
    event,
    await cms.collections.bulkCreate(collectionId, await event.request.json(), {
      user: user!,
      tenantId,
    }),
    201,
  );
}

export async function handleCollectionBulkUpdate(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
  collectionId: string,
) {
  return successResponse(
    event,
    await cms.collections.bulkUpdate(collectionId, await event.request.json(), {
      user: user!,
      tenantId,
    }),
  );
}

export async function handleCollectionBulkDelete(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
  collectionId: string,
) {
  return successResponse(
    event,
    await cms.collections.bulkDelete(collectionId, await event.request.json(), {
      user: user!,
      tenantId,
    }),
  );
}

// ─── Atomic Increment Handler ────────────────────────────────────────────────

/**
 * Atomically increments a numeric field on a collection entry.
 * Uses native adapter support ($inc for MongoDB, json_set UPDATE for SQL)
 * to prevent lost-update races under concurrent writes.
 *
 * Expects body: { field: string, amount: number }
 */
export async function handleCollectionIncrement(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  _user: any,
  collectionId: string,
  entryId: string,
) {
  const body = await event.request.json();
  const { field, amount } = body;

  if (!field || typeof amount !== "number") {
    throw new AppError("Invalid payload. Expected { field: string, amount: number }", 400);
  }

  // Resolve physical collection name from schema
  const schema = await (cms.collections as any).getSchema(collectionId, tenantId);
  const collectionName = `collection_${(schema._id as string).replace(/-/g, "")}`;

  let result: any;

  if (typeof (cms.db.crud as any).atomicIncrement === "function") {
    // Fast path: native atomic increment via adapter
    result = await (cms.db.crud as any).atomicIncrement(collectionName, entryId, field, amount, {
      tenantId,
      bypassSafeQuery: true,
    });
  } else {
    // Fallback: serialized findById + update with cache bypass
    const currentRes = await cms.collections.findById(collectionId, entryId, {
      tenantId,
      bypassCache: true,
    });
    if (!currentRes.success || !(currentRes as any).data) {
      throw new AppError(`Entry not found: ${entryId}`, 404);
    }
    const currentVal =
      typeof (currentRes as any).data[field] === "number" ? (currentRes as any).data[field] : 0;
    result = await cms.collections.update(
      collectionId,
      entryId,
      { [field]: currentVal + amount },
      { user: _user || { _id: "system", role: "admin" }, tenantId },
    );
  }

  if (!result.success) {
    throw new AppError(result.message || "Failed to increment field", 500);
  }

  // Invalidate cache so subsequent reads get the new value
  try {
    await cms.db.monitoring.cache.invalidateCollection(collectionId, tenantId);
  } catch {
    /* ignore */
  }

  return successResponse(event, result);
}

// ─── Cross-Collection Search Handler ─────────────────────────────────────────

/**
 * Searches across one or more collections with full-text query, pagination,
 * status filtering, and sort support.
 *
 * Query params:
 * - q: search query string
 * - collections: comma-separated collection IDs (optional, searches all if omitted)
 * - page, limit: pagination (default 1, 25)
 * - sortField, sortDirection: ordering (default updatedAt desc)
 * - status: filter by entry status
 * - filter: JSON string of additional field filters
 */
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

  let filter = {};
  const filterParam = url.searchParams.get("filter");
  if (filterParam) {
    try {
      filter = JSON.parse(filterParam);
    } catch {
      /* ignore */
    }
  }

  return successResponse(
    event,
    await cms.collections.search(query, {
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
    }),
  );
}
