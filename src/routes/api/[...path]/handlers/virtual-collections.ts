/**
 * @file src/routes/api/[...path]/handlers/virtual-collections.ts
 * @description HTTP API for federated virtual collections (headless consumers).
 *
 * Routes:
 * - GET /api/virtual-collections — list virtual schemas
 * - GET /api/virtual-collections/:slug — read entries
 * - GET /api/virtual-collections/:slug/:entryId — read single entry
 * - GET /api/virtual-collections/health/:connectorId — connector health
 * - POST /api/virtual-collections/:slug — create entry
 * - PATCH /api/virtual-collections/:slug/:entryId — update entry
 * - DELETE /api/virtual-collections/:slug/:entryId — delete entry
 *
 * Features:
 * - Delegates to LocalCMS virtualCollections namespace (modifyRequest parity)
 * - Fail-closed permission gating via dispatcher
 * - Federation error envelope
 */

import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import { FederationError } from "@plugins/unified-data-hub/types";
import { successResponse } from "./base";

function parseQueryOptions(url: URL) {
  const limit = url.searchParams.get("limit");
  const offset = url.searchParams.get("offset");
  const sortField = url.searchParams.get("sortField");
  const sortDirection = url.searchParams.get("sortDirection") as "asc" | "desc" | null;
  const filterRaw = url.searchParams.get("filter");

  let filter: Record<string, unknown> | undefined;
  if (filterRaw) {
    try {
      filter = JSON.parse(filterRaw);
    } catch {
      throw new AppError("Invalid filter JSON", 400, "VALIDATION_ERROR");
    }
  }

  const includeRaw = url.searchParams.get("include");
  const include = includeRaw
    ? includeRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

  const cursor = url.searchParams.get("cursor") ?? undefined;

  return {
    limit: limit ? Number(limit) : undefined,
    offset: offset ? Number(offset) : undefined,
    cursor,
    sort: sortField
      ? {
          field: sortField,
          direction: sortDirection === "desc" ? ("desc" as const) : ("asc" as const),
        }
      : undefined,
    filter,
    bypassCache: url.searchParams.get("bypassCache") === "true",
    include,
  };
}

async function parseWriteBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new AppError("Invalid JSON body", 400, "VALIDATION_ERROR");
    }
    return body as Record<string, unknown>;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("Invalid JSON body", 400, "VALIDATION_ERROR");
  }
}

export async function handleVirtualCollectionsRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { request, url, locals } = event;
  const { user } = locals;
  const method = request.method;

  try {
    const slug = segments[1];
    const entryId = segments[2];
    const sub = segments[3];

    if (method === "POST" && slug && !entryId) {
      const data = await parseWriteBody(request);
      const result = await cms.virtualCollections.create(slug, data, {
        tenantId,
        user: user as any,
      });
      return successResponse(event, result, 201);
    }

    if (method === "PATCH" && slug && entryId && entryId !== "enrich" && sub !== "health") {
      const data = await parseWriteBody(request);
      const result = await cms.virtualCollections.update(slug, entryId, data, {
        tenantId,
        user: user as any,
      });
      return successResponse(event, result);
    }

    if (method === "DELETE" && slug && entryId && entryId !== "enrich" && sub !== "health") {
      const result = await cms.virtualCollections.delete(slug, entryId, {
        tenantId,
        user: user as any,
      });
      return successResponse(event, result);
    }

    if (method !== "GET") {
      throw new AppError("Method not allowed", 405, "METHOD_NOT_ALLOWED");
    }

    // GET /api/virtual-collections/health/:connectorId
    if (slug === "health" && entryId) {
      const result = await cms.virtualCollections.getConnectorHealth(entryId, {
        tenantId,
        user: user as any,
      });
      return successResponse(event, result);
    }

    // GET /api/virtual-collections
    if (!slug) {
      const result = await cms.virtualCollections.listSchemas({
        tenantId,
        user: user as any,
      });
      return successResponse(event, result);
    }

    const queryOpts = parseQueryOptions(url);

    // GET /api/virtual-collections/:slug/enrich?keys=1,2,3&field=id
    if (entryId === "enrich") {
      const keysRaw = url.searchParams.get("keys") ?? "";
      const keys = keysRaw
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
      const virtualKeyField = url.searchParams.get("field") ?? "id";
      const result = await cms.virtualCollections.enrichByKeys(slug, keys, {
        tenantId,
        user: user as any,
        virtualKeyField,
        bypassCache: queryOpts.bypassCache,
      });
      const response = successResponse(event, result);
      if (result.meta?.stitchWarning) {
        response.headers.set("X-Federation-Stitch-Warning", "true");
      }
      if (result.meta?.nearBudget) {
        response.headers.set("X-Federation-Near-Budget", "true");
      }
      if (result.meta?.warningCode && result.meta.warningCode !== "NONE") {
        response.headers.set("X-Federation-Warning-Code", result.meta.warningCode);
      }
      return response;
    }

    // GET /api/virtual-collections/:slug/:entryId
    if (entryId && sub !== "health") {
      const result = await cms.virtualCollections.findById(slug, entryId, {
        tenantId,
        user: user as any,
        ...queryOpts,
      });
      return successResponse(event, result);
    }

    // GET /api/virtual-collections/:slug
    const result = await cms.virtualCollections.find(slug, {
      tenantId,
      user: user as any,
      ...queryOpts,
    });

    const response = successResponse(event, result);
    if (result.meta?.clamped) {
      response.headers.set("X-Federation-Clamped", "true");
    }
    if (result.meta?.stitchWarning) {
      response.headers.set("X-Federation-Stitch-Warning", "true");
    }
    if (result.meta?.nearBudget) {
      response.headers.set("X-Federation-Near-Budget", "true");
    }
    if (result.meta?.nextCursor) {
      response.headers.set("X-Federation-Next-Cursor", result.meta.nextCursor);
    }
    return response;
  } catch (err) {
    if (err instanceof FederationError) {
      throw new AppError(err.message, err.status, err.code);
    }
    // SDK methods throw plain Error when plugin is not enabled (e.g. assertEnabled)
    if (err instanceof Error && err.message?.includes("not enabled")) {
      throw new AppError(err.message, 503, "PLUGIN_NOT_ENABLED");
    }
    throw err;
  }
}
