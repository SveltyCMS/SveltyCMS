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
 * - Weak collection-generation ETags (`W/"cv1|…"`) with If-None-Match 304
 * - Cursor-streamed NDJSON / CSV / JSON export (`GET …/export`)
 */

import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId, Schema } from "@src/content/types";
import { StatusTypes } from "@src/content/types";
import { prepareCollectionFields } from "@src/content/content-utils";
import { collectionTableName } from "@src/databases/core/collection-name";
import { hasPermissionWithRoles } from "@src/databases/auth/permissions";
import { logger } from "@utils/logger";
import { successResponse, rawResponse } from "./base";
import { streamingExportResponse, streamingJsonResponse } from "./streaming";
import {
  collectExportColumns,
  exportFileExtension,
  parseExportFormat,
  sanitizeExportBasename,
  utcDateStamp,
} from "@utils/export-encode";
import { setCollectionOrder } from "@utils/collection-order.server";
import { cacheService } from "@src/databases/cache/cache-service";
import { PROFILE_WRITE_ENABLED, profileSpan, profileMark } from "@utils/write-profiler";
import { parseCollectionQueryParams } from "@utils/api-params";
import { getUserCacheId } from "@utils/hook-utils";
import {
  collectionEtagResponseHeaders,
  currentCollectionWeakEtag,
  tryCollectionNotModified,
} from "@src/services/cache/collection-etag";

/** Maximum number of items allowed in a single bulk operation to prevent memory exhaustion. */
const MAX_BULK_ITEMS = 1000;
/** Default / cap for streamed collection exports (cursor-backed, not fully buffered). */
const DEFAULT_EXPORT_LIMIT = 100_000;
const MAX_EXPORT_LIMIT = 1_000_000;

/**
 * Admin list/edit clients historically wrapped writes as `{ data, tenantId }`.
 * Only unwrap when those are the sole keys so a real `data` widget field is preserved.
 */
function unwrapWritePayload(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const obj = raw as Record<string, unknown>;
  if (obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)) {
    let hasExtras = false;
    for (const k in obj) {
      if (Object.hasOwn(obj, k) && k !== "data" && k !== "tenantId") {
        hasExtras = true;
        break;
      }
    }
    if (!hasExtras) return obj.data;
  }
  return raw;
}

/** Accept `string[]`, `{ entryIds }`, `{ ids }`, or `{ entries: [{ _id }] }`. */
function extractEntryIds(payload: unknown): string[] {
  if (Array.isArray(payload)) {
    const ids: string[] = [];
    for (let i = 0; i < payload.length; i++) {
      const item = payload[i];
      if (typeof item === "string" && item.length > 0) {
        ids.push(item);
      } else if (item && typeof item === "object" && "_id" in item) {
        const id = (item as { _id?: unknown })._id;
        if (typeof id === "string" && id.length > 0) {
          ids.push(id);
        }
      }
    }
    return ids;
  }
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    const raw = obj.entryIds ?? obj.ids ?? obj.entries;
    return extractEntryIds(raw);
  }
  return [];
}

/**
 * Weak collection-generation ETag for a find/entry GET. Returns a 304 Response
 * when If-None-Match matches the current epoch + representation hash.
 */
function collectionConditionalGet(
  event: RequestEvent,
  collectionId: string,
  bypassCache?: boolean,
): Response | string | null {
  const notModified = tryCollectionNotModified({
    pathname: event.url.pathname,
    search: event.url.search,
    ifNoneMatch: event.request.headers.get("if-none-match"),
    tenantId: event.locals.tenantId ? String(event.locals.tenantId) : null,
    userCacheId: getUserCacheId(event.locals.user),
    bypass: bypassCache === true,
  });
  if (notModified) return notModified;
  return currentCollectionWeakEtag({
    collectionId,
    tenantId: event.locals.tenantId ? String(event.locals.tenantId) : null,
    pathname: event.url.pathname,
    search: event.url.search,
    userCacheId: getUserCacheId(event.locals.user),
  });
}

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

    // ── Collection order persistence ──
    if (collectionId === "reorder" && request.method === "POST") {
      return handleCollectionReorder(event, tenantId);
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
      case "PUT":
        return handlePatchRoutes(event, cms, tenantId, user, collectionId, entryId, subAction);

      case "DELETE":
        return handleDeleteRoutes(event, cms, tenantId, user, collectionId, entryId, url);
    }

    throw new AppError(
      `Collections endpoint /api/collections/${segments.join("/")} not implemented`,
      404,
    );
  } catch (err: any) {
    if (process.env.BENCHMARK !== "true") {
      logger.error(`[CollectionsRoute Error] ${segments.join("/")}:`, err);
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

  // Streamed collection export (NDJSON / CSV / JSON) — must run before entry lookup
  if (entryId === "export") {
    return handleCollectionExport(event, cms, tenantId, user, collectionId, url);
  }

  // Get single entry
  if (entryId) {
    return handleCollectionEntry(event, cms, tenantId, user, collectionId, entryId);
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
  if (collectionId === "warm-cache") {
    return handleCollectionWarmCache(event, cms, tenantId);
  }
  if (entryId === "batch" || entryId === "batch-clone") {
    return handleCollectionBatchAction(event, cms, tenantId, user, collectionId, entryId);
  }
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
  subAction?: string,
) {
  if (entryId === "bulk")
    return handleCollectionBulkUpdate(event, cms, tenantId, user, collectionId);
  if (entryId && subAction === "status") {
    return handleCollectionStatusUpdate(event, cms, tenantId, user, collectionId, entryId);
  }
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
  const params = parseCollectionQueryParams(url.searchParams);
  const bypassEtag = params.bypassCache || url.searchParams.get("refresh") === "true";

  const conditional = collectionConditionalGet(event, collectionId, bypassEtag);
  if (conditional instanceof Response) return conditional;

  // Streaming for large datasets or explicit stream requests
  const isLargeRequest = params.limit > 500;
  if (params.stream || isLargeRequest) {
    const iterator = await cms.collections.findStreaming(collectionId, {
      tenantId,
      user,
      limit: params.limit,
      offset: params.offset,
      sortField: params.sortField,
      sortDirection: params.sortDirection,
      filter: params.filter,
      publicationFilter: params.publicationFilter,
    });

    let totalCount: number | undefined;
    if (params.includeCount) {
      const countRes = await cms.collections.count(collectionId, {
        tenantId,
        user,
        publicationFilter: params.publicationFilter,
      });
      if (countRes.success) totalCount = countRes.data;
    }
    return streamingJsonResponse(iterator, totalCount);
  }

  const result = await cms.collections.find(collectionId, {
    tenantId,
    user,
    limit: params.limit,
    offset: params.offset,
    sortField: params.sortField,
    sortDirection: params.sortDirection,
    filter: params.filter,
    publicationFilter: params.publicationFilter,
    bypassCache: params.bypassCache,
    populate: params.populate,
    fields: params.fields,
  });
  return successResponse(
    event,
    result,
    200,
    typeof conditional === "string" ? collectionEtagResponseHeaders(conditional) : undefined,
  );
}

/**
 * Cursor-streamed collection export. NDJSON/CSV encode one record at a time;
 * JSON uses the existing chunked array stream. Never buffers the full result.
 */
export async function handleCollectionExport(
  _event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
  collectionId: string,
  url: URL,
) {
  const params = parseCollectionQueryParams(url.searchParams);
  const format = parseExportFormat(url.searchParams.get("format"));
  const rawLimit = url.searchParams.get("limit");
  const parsedLimit = rawLimit ? Number(rawLimit) : DEFAULT_EXPORT_LIMIT;
  const limit = Math.min(
    Math.max(1, Number.isFinite(parsedLimit) ? parsedLimit : DEFAULT_EXPORT_LIMIT),
    MAX_EXPORT_LIMIT,
  );

  const iterator = await cms.collections.findStreaming(collectionId, {
    tenantId,
    user,
    limit,
    offset: params.offset,
    sortField: params.sortField,
    sortDirection: params.sortDirection,
    filter: params.filter,
    publicationFilter: params.publicationFilter,
  });

  const filename = `${sanitizeExportBasename(collectionId)}-${utcDateStamp()}.${exportFileExtension(format)}`;

  if (format === "json") {
    const res = streamingJsonResponse(iterator, undefined, { maxItems: limit });
    res.headers.set("Content-Disposition", `attachment; filename="${filename}"`);
    res.headers.set("Cache-Control", "no-store");
    res.headers.set("X-Export-Format", "json");
    return res;
  }

  const schema = await cms.collections.getSchema(collectionId, tenantId);
  // FieldDefinition includes polymorphic widget placeholders without a
  // db_fieldName — collectExportColumns skips them via optional chaining.
  const columns = collectExportColumns(
    schema?.fields?.map((f) => ({
      db_fieldName: (f as { db_fieldName?: string } | null | undefined)?.db_fieldName,
    })),
  );
  return streamingExportResponse(iterator, {
    format,
    filename,
    columns,
    maxItems: limit,
  });
}

export async function handleCollectionEntry(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
  collectionId: string,
  entryId: string,
) {
  const params = parseCollectionQueryParams(event.url.searchParams);
  const bypassEtag = params.bypassCache || event.url.searchParams.get("refresh") === "true";
  const conditional = collectionConditionalGet(event, collectionId, bypassEtag);
  if (conditional instanceof Response) return conditional;
  const result = await cms.collections.findById(collectionId, entryId, {
    tenantId,
    user,
    publicationFilter: params.publicationFilter,
    bypassCache: params.bypassCache,
    populate: params.populate,
  });
  return successResponse(
    event,
    result,
    200,
    typeof conditional === "string" ? collectionEtagResponseHeaders(conditional) : undefined,
  );
}

// ─── Write Handlers ──────────────────────────────────────────────────────────

/**
 * Shared pre-validation for bulk update payloads (Array<{ id: string; data: Record }>).
 * Enforces field constraints on each entry's `.data` portion (null row stripping
 * and maxLength truncation) in a single pass. Sanitization is intentionally NOT
 * applied here — bulk update validation must not change sanitization behavior today.
 */
async function validateBulkUpdatePayload(
  cms: LocalCMS,
  collectionId: string,
  tenantId: DatabaseId,
  updates: Array<{ id: string; data: Record<string, unknown> }>,
): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  const schema = (await cms.collections.getSchema(collectionId, tenantId)) as Schema;
  if (!schema?.fields) return updates;

  return updates.map((entry) => ({
    ...entry,
    data: prepareCollectionFields(entry.data, schema as any, { constraints: true }),
  }));
}

export async function handleCollectionCreate(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
  collectionId: string,
) {
  const rawData = unwrapWritePayload(
    (event.locals as any)?.__parsedJsonBody ||
      (PROFILE_WRITE_ENABLED
        ? await profileSpan("handler:json", () => event.request.json())
        : await event.request.json()),
  );

  if (Array.isArray(rawData)) {
    const result = await cms.collections.bulkCreate(collectionId, rawData, {
      user: user!,
      tenantId,
    });
    return successResponse(event, result, 201);
  }

  const result = PROFILE_WRITE_ENABLED
    ? await profileSpan("handler:namespace.create", () =>
        cms.collections.create(collectionId, rawData, {
          user: user!,
          tenantId,
        }),
      )
    : await cms.collections.create(collectionId, rawData, {
        user: user!,
        tenantId,
      });
  if (!PROFILE_WRITE_ENABLED) return successResponse(event, result, 201);

  const end = profileMark("handler:successResponse");
  const res = successResponse(event, result, 201);
  end();
  return res;
}

export async function handleCollectionUpdate(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
  collectionId: string,
  entryId: string,
) {
  // 🚀 SKIP DOUBLE SCHEMA FETCH: validateWritePayload resolves the schema,
  // then cms.collections.update() resolves it AGAIN internally. The namespace
  // already does sanitization, numeric range validation, and hook processing —
  // the handler's pre-validation was pure duplication costing ~0.5ms per update.
  const rawData = unwrapWritePayload(
    (event.locals as any)?.__parsedJsonBody ||
      (PROFILE_WRITE_ENABLED
        ? await profileSpan("handler:json", () => event.request.json())
        : await event.request.json()),
  );
  const result = PROFILE_WRITE_ENABLED
    ? await profileSpan("handler:namespace.update", () =>
        cms.collections.update(collectionId, entryId, rawData, {
          user: user!,
          tenantId,
        }),
      )
    : await cms.collections.update(collectionId, entryId, rawData, {
        user: user!,
        tenantId,
      });
  if (!PROFILE_WRITE_ENABLED) return successResponse(event, result);

  const end = profileMark("handler:successResponse");
  const res = successResponse(event, result);
  end();
  return res;
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

// ─── Warm Cache Handler ──────────────────────────────────────────────────────

/** POST /api/collections/warm-cache — batch pre-load entry payloads for edit mode. */
export async function handleCollectionWarmCache(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
) {
  const body = (await event.request.json()) as {
    collectionId?: string;
    entryIds?: string[];
  };

  const { collectionId, entryIds } = body;
  if (!collectionId || !Array.isArray(entryIds) || entryIds.length === 0) {
    throw new AppError("collectionId and entryIds[] are required", 400);
  }
  if (entryIds.length > 20) {
    throw new AppError("warm-cache supports at most 20 entryIds per request", 400);
  }

  // Single bulk query instead of N individual lookups
  const tableName = collectionTableName(collectionId);
  const bulkResult = await cms.db.crud.findMany(
    tableName,
    { _id: { $in: entryIds as DatabaseId[] } },
    { tenantId, limit: entryIds.length },
  );

  // Fire-and-forget cache backfill
  if (bulkResult.success && Array.isArray(bulkResult.data)) {
    for (const doc of bulkResult.data) {
      if (!doc?._id) continue;
      const cacheKey = `collection:${collectionId}:${doc._id}`;
      cacheService.set(cacheKey, doc, 300, tenantId).catch(() => {});
    }
  }

  return successResponse(event, {
    warmed: entryIds.length,
    collectionId,
    success: true,
  });
}

// ─── Bulk Operation Handlers ─────────────────────────────────────────────────

export async function handleCollectionBulkCreate(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
  collectionId: string,
) {
  const rawData = await event.request.json();
  return successResponse(
    event,
    await cms.collections.bulkCreate(collectionId, rawData as any[], {
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
  const payload = await event.request.json();
  if (Array.isArray(payload) && payload.length > MAX_BULK_ITEMS) {
    throw new AppError(
      `Bulk update limit exceeded: ${payload.length} items. Maximum is ${MAX_BULK_ITEMS}.`,
      413,
    );
  }

  // 🛡️ BULK UPDATE DELETE GUARD: Prevent bypassing disableBulkDelete via bulk update
  const schema = await cms.collections.getSchema(collectionId, tenantId);
  if (schema?.disableBulkDelete && Array.isArray(payload)) {
    const hasDeleteIntent = payload.some(
      (entry: { data?: Record<string, unknown> }) =>
        entry.data?._deleted === true ||
        entry.data?.status === "deleted" ||
        entry.data?.status === "trashed",
    );
    if (hasDeleteIntent) {
      throw new AppError(
        `Bulk delete is disabled for collection "${schema.name || collectionId}". Use individual delete instead.`,
        403,
        "BULK_DELETE_DISABLED",
      );
    }
  }

  // 🛡️ Permission check: verify delete permission when bulk update includes deletion markers
  if (Array.isArray(payload)) {
    const hasDeleteIntent = payload.some(
      (entry: { data?: Record<string, unknown> }) =>
        entry.data?._deleted === true ||
        entry.data?.status === "deleted" ||
        entry.data?.status === "trashed",
    );
    if (hasDeleteIntent && user) {
      const roles = event.locals.roles || [];
      const canDelete =
        event.locals.isAdmin || hasPermissionWithRoles(user, "collection:delete", roles);
      if (!canDelete) {
        logger.warn(
          `[handleCollectionBulkUpdate] User "${user._id || user.email}" attempted bulk update with delete intent on "${collectionId}" without permission`,
        );
        throw new AppError(
          "You do not have permission to perform bulk delete operations via bulk update",
          403,
          "FORBIDDEN",
        );
      }
    }
  }

  // Validate field constraints and strip null rows from each entry's data
  const validPayload = Array.isArray(payload)
    ? await validateBulkUpdatePayload(cms, collectionId, tenantId, payload)
    : payload;

  return successResponse(
    event,
    await cms.collections.bulkUpdate(collectionId, validPayload, {
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
  const payload = await event.request.json();
  const ids = extractEntryIds(payload);
  return runBulkDelete(event, cms, tenantId, user, collectionId, ids);
}

/**
 * POST /api/collections/:id/batch  `{ action: "delete"|"clone"|"status", entryIds, status? }`
 * POST /api/collections/:id/batch-clone `{ entries }` or `{ entryIds }`
 *
 * Previously these URLs fell through to create(), so delete/clone/status
 * inserted a new document instead of mutating the selected rows.
 */
async function handleCollectionBatchAction(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
  collectionId: string,
  entryId: string,
) {
  const body = (await event.request.json().catch(() => ({}))) as Record<string, unknown>;
  const action =
    entryId === "batch-clone"
      ? "clone"
      : typeof body.action === "string"
        ? body.action.toLowerCase()
        : "";

  if (!action) {
    throw new AppError(
      'Batch action required. Expected { action: "delete" | "clone" | "status", entryIds }',
      400,
    );
  }

  if (action === "delete") {
    return runBulkDelete(event, cms, tenantId, user, collectionId, extractEntryIds(body));
  }

  if (action === "status") {
    const ids = extractEntryIds(body);
    const status = body.status;
    if (typeof status !== "string" || !status) {
      throw new AppError("status is required for batch status updates", 400);
    }
    return runBulkStatusUpdate(event, cms, tenantId, user, collectionId, ids, status, body);
  }

  if (action === "clone") {
    return runBulkClone(event, cms, tenantId, user, collectionId, body);
  }

  throw new AppError(`Unsupported batch action: ${action}`, 400);
}

/** PATCH /api/collections/:id/:entryId/status — single or `{ entries: ids[] }` bulk. */
async function handleCollectionStatusUpdate(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
  collectionId: string,
  entryId: string,
) {
  const body = (await event.request.json().catch(() => ({}))) as Record<string, unknown>;
  const status = body.status;
  if (typeof status !== "string" || !status) {
    throw new AppError("status is required", 400);
  }

  const ids = extractEntryIds(body);
  if (ids.length > 0) {
    return runBulkStatusUpdate(event, cms, tenantId, user, collectionId, ids, status, body);
  }

  const extra = extraStatusFields(body);
  return successResponse(
    event,
    await cms.collections.update(collectionId, entryId, { status, ...extra }, { user, tenantId }),
  );
}

function extraStatusFields(body: Record<string, unknown>): Record<string, unknown> {
  const skip = new Set([
    "action",
    "entryIds",
    "ids",
    "entries",
    "status",
    "data",
    "tenantId",
    "role",
    "isAdmin",
    "permissions",
    "password",
    "secret",
    "token",
    "hash",
    "_id",
    "_collection",
    "createdAt",
    "createdBy",
    "updatedAt",
    "updatedBy",
  ]);
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!skip.has(key)) extra[key] = value;
  }
  return extra;
}

async function runBulkDelete(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
  collectionId: string,
  ids: string[],
) {
  if (ids.length === 0) {
    throw new AppError("entryIds[] is required for bulk delete", 400);
  }
  if (ids.length > MAX_BULK_ITEMS) {
    throw new AppError(
      `Bulk delete limit exceeded: ${ids.length} items. Maximum is ${MAX_BULK_ITEMS}.`,
      413,
    );
  }

  // Schema disableBulkDelete + tenant-scoped DELETE/UPDATE WHERE _id IN (...) live in the SDK.
  return successResponse(
    event,
    await cms.collections.bulkDelete(collectionId, ids, {
      user: user!,
      tenantId,
    }),
  );
}

async function runBulkStatusUpdate(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
  collectionId: string,
  ids: string[],
  status: string,
  body: Record<string, unknown>,
) {
  if (ids.length === 0) {
    throw new AppError("entryIds[] is required for bulk status updates", 400);
  }
  if (ids.length > MAX_BULK_ITEMS) {
    throw new AppError(
      `Bulk update limit exceeded: ${ids.length} items. Maximum is ${MAX_BULK_ITEMS}.`,
      413,
    );
  }

  const extra = extraStatusFields(body);
  const updates = ids.map((id) => ({
    id,
    data: { status, ...extra },
  }));

  return successResponse(
    event,
    await cms.collections.bulkUpdate(collectionId, updates, {
      user: user!,
      tenantId,
    }),
  );
}

async function runBulkClone(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: any,
  collectionId: string,
  body: Record<string, unknown>,
) {
  let clones: Record<string, unknown>[] = [];

  if (Array.isArray(body.entries) && body.entries.length > 0) {
    clones = body.entries.map((entry) => {
      const row = { ...(entry as Record<string, unknown>) };
      delete row._id;
      delete row.createdAt;
      delete row.updatedAt;
      if (!row.status) row.status = StatusTypes.draft;
      return row;
    });
  } else {
    const ids = extractEntryIds(body);
    if (ids.length === 0) {
      throw new AppError("entries[] or entryIds[] is required for clone", 400);
    }
    if (ids.length > MAX_BULK_ITEMS) {
      throw new AppError(
        `Bulk clone limit exceeded: ${ids.length} items. Maximum is ${MAX_BULK_ITEMS}.`,
        413,
      );
    }

    const found = await cms.collections.findByIds(collectionId, ids, { tenantId, user });
    const source = (found?.data ?? []) as Record<string, unknown>[];
    clones = source.map((entry) => {
      const { _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = entry;
      return {
        ...rest,
        clonedFrom: _id,
        status: StatusTypes.draft,
      };
    });
  }

  if (clones.length === 0) {
    throw new AppError("No entries found to clone", 404);
  }
  if (clones.length > MAX_BULK_ITEMS) {
    throw new AppError(
      `Bulk clone limit exceeded: ${clones.length} items. Maximum is ${MAX_BULK_ITEMS}.`,
      413,
    );
  }

  return successResponse(
    event,
    await cms.collections.bulkCreate(collectionId, clones, {
      user: user!,
      tenantId,
    }),
    201,
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
  const collectionName = collectionTableName(schema._id as string);

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
    await cms.db.monitoring.cache.invalidateCollection(collectionId, { tenantId });
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

// ─── Collection Order Persistence ───────────────────────────────────────────

/**
 * Persists the sidebar collection display order to the compilation manifest.
 * POST /api/collections/reorder  { order: { posts: 0, authors: 1, ... } }
 */
async function handleCollectionReorder(event: RequestEvent, tenantId: DatabaseId) {
  const { order } = await event.request.json();
  if (!order || typeof order !== "object") {
    throw new AppError("Invalid order payload — expected { order: { [id]: number } }", 400);
  }
  await setCollectionOrder(order, tenantId as string | null);
  return successResponse(event, { success: true, order });
}
