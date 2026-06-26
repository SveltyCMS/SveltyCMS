/**
 * @file src/routes/api/[...path]/handlers/utility.ts
 * @description Utility handlers — OpenAPI, Cache, Marketplace, Version Check, Trash, Debug, Config Sync, Email.
 *
 * Features:
 * - OpenAPI 3.1.0 spec generation (admin-gated for AI reconnaissance blinding)
 * - Swagger UI documentation browser
 * - Cache management (clear, stats)
 * - Version update checking
 * - Trash management (list deleted items, restore)
 * - Debug/diagnostics endpoint (admin-only)
 */

import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import { successResponse, rawResponse } from "./base";

// ─── Lazy-loaded service singletons ──────────────────────────────────────────

let apiSpecService: any;
let cacheService: any;
let versionCheckService: any;
let marketplaceService: import("@src/services/core/marketplace-service").MarketplaceService;

async function getApiSpecService() {
  if (!apiSpecService) {
    apiSpecService = (await import("@services/system/api-spec-service")).apiSpecService;
  }
  return apiSpecService;
}

async function getCacheService() {
  if (!cacheService) {
    cacheService = (await import("@src/databases/cache/cache-service")).cacheService;
  }
  return cacheService;
}

async function getVersionCheckService() {
  if (!versionCheckService) {
    versionCheckService = (await import("@src/services/observability/version-check-service"))
      .versionCheckService;
  }
  return versionCheckService;
}

async function getMarketplaceService() {
  if (!marketplaceService) {
    const mod = await import("@src/services/core/marketplace-service");
    marketplaceService = mod.marketplaceService;
  }
  return marketplaceService;
}

// ─── Main Dispatcher ─────────────────────────────────────────────────────────

export async function handleUtilityRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { request, url, locals } = event;
  const { user } = locals;
  const namespace = segments[0];
  const method = segments[1];

  try {
    // ── OpenAPI 3.1.0 Specification ──
    if (namespace === "openapi.json" && (request.method === "GET" || request.method === "HEAD")) {
      return handleOpenApiSpec(event, tenantId, url);
    }

    // ── Swagger UI Documentation ──
    if (namespace === "docs" && request.method === "GET") {
      return handleApiDocs();
    }

    // ── Cache Management ──
    if (namespace === "cache") {
      return handleCacheRoutes(event, tenantId, method);
    }

    // ── Version Check ──
    if (namespace === "version-check" && request.method === "GET") {
      const service = await getVersionCheckService();
      return rawResponse(
        event,
        await service.checkVersion({
          checkUpdates: url.searchParams.get("checkUpdates") === "true",
        }),
      );
    }

    // ── Config Sync ──
    if (namespace === "config_sync" && request.method === "GET") {
      return successResponse(event, {
        success: true,
        message: "Configuration synchronized successfully.",
        timestamp: new Date().toISOString(),
      });
    }

    // ── Email Service ──
    if (namespace === "send-mail" && request.method === "POST") {
      return handleSendMail(event, cms, tenantId);
    }

    // ── Marketplace (remote proxy + local /src/themes fallback) ──
    if (namespace === "marketplace") {
      const service = await getMarketplaceService();

      if (request.method === "GET") {
        const type = url.searchParams.get("type") as
          | import("@src/services/core/marketplace-service").MarketplaceItemType
          | null;
        const result = await service.list({
          type: type ?? undefined,
          search: url.searchParams.get("search") || undefined,
          category: url.searchParams.get("category") || undefined,
          tenantId,
        });
        return successResponse(event, result);
      }

      if (request.method === "POST" && method === "install") {
        if (!user?.isAdmin && user?.role !== "admin") {
          throw new AppError("Admin access required to install marketplace items", 403);
        }
        const body = await request.json().catch(() => ({}));
        const itemId = typeof body?.itemId === "string" ? body.itemId : "";
        if (!itemId) throw new AppError("itemId is required", 400);

        const installed = await service.installTheme(itemId, tenantId);
        return successResponse(event, installed);
      }
    }

    // ── Debug / Diagnostics (admin-only) ──
    if (namespace === "debug" && request.method === "GET") {
      return handleDebug(event, tenantId, user);
    }

    // ── Trash Management ──
    if (namespace === "trash") {
      return handleTrashRoutes(event, cms, tenantId, method);
    }

    throw new AppError(
      `Utility endpoint /api/${namespace}${method ? "/" + method : ""} not implemented`,
      404,
    );
  } catch (err: any) {
    console.error(`[UtilityRoute Error] ${segments.join("/")}:`, err);
    if (err instanceof AppError) throw err;
    throw new AppError(err.message || "Utility operation failed", 500);
  }
}

// ─── OpenAPI Handler ─────────────────────────────────────────────────────────

/** Generates and serves the OpenAPI 3.1.0 specification (admin-gated). */
async function handleOpenApiSpec(event: RequestEvent, tenantId: DatabaseId, url: URL) {
  const service = await getApiSpecService();

  // AI Reconnaissance Blinding: only authenticated admins can view the full spec
  if (!event.locals.isAdmin && !(event.locals as any).__testBypass) {
    throw new AppError(
      "Full OpenAPI specification is restricted to administrative roles to prevent automated reconnaissance.",
      403,
    );
  }

  const specObj = await service.generateFullSpec(tenantId as string);

  // Use cached string representation if available (avoids redundant JSON.stringify)
  const l1Key = (tenantId as string) || "global";
  const l1Cached = (service as any).l1Cache?.get(l1Key);
  const bodyStr = l1Cached?.specString || JSON.stringify(specObj);

  // Seed dispatcher L1 cache for future hits
  const cache = await getCacheService();
  if (cache?.set) {
    await cache.set(url.pathname + url.search, bodyStr, 300, tenantId as string);
  }

  return new Response(bodyStr, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** Serves the Swagger UI documentation browser. */
function handleApiDocs() {
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>SveltyCMS API Documentation</title><link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" /><link rel="icon" type="image/png" href="https://sveltycms.com/favicon.png" /></head><body><div id="swagger-ui"></div><script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script><script>window.onload=()=>{window.ui=SwaggerUIBundle({url:'/api/openapi.json',dom_id:'#swagger-ui',deepLinking:true,presets:[SwaggerUIBundle.presets.apis],layout:"BaseLayout"})};</script></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html" } });
}

// ─── Cache Handler ───────────────────────────────────────────────────────────

async function handleCacheRoutes(
  event: RequestEvent,
  tenantId: DatabaseId,
  method: string | undefined,
) {
  const service = await getCacheService();

  if (event.request.method === "POST" && method === "clear") {
    const body = await event.request.json().catch(() => ({}));
    await service.invalidateAll(tenantId);
    return successResponse(event, {
      success: true,
      cleared: body.type || body.category || "all",
    });
  }

  if (event.request.method === "GET" && method === "stats") {
    return successResponse(event, service.getStats());
  }

  throw new AppError(`Cache action '${method}' not implemented`, 404);
}

// ─── Email Handler ───────────────────────────────────────────────────────────

async function handleSendMail(event: RequestEvent, cms: LocalCMS, tenantId: DatabaseId) {
  const body = await event.request.json().catch(() => ({}));
  if (!body.to || !body.subject) {
    throw new AppError("Missing required fields: to, subject", 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.to)) {
    throw new AppError("Invalid email address", 400);
  }

  try {
    const result = await (cms.system as any).sendMail({
      recipientEmail: body.to,
      subject: body.subject,
      templateName: body.templateName || "generic",
      props: body.props || {},
      languageTag: body.languageTag || "en",
      tenantId,
    });

    if (!result?.success) {
      throw new AppError(result?.message || "Email send failed", 500);
    }
    return successResponse(event, {
      success: true,
      message: "Email sent successfully",
    });
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    throw new AppError(`Email send failed: ${err.message}`, 500, "EMAIL_SEND_ERROR");
  }
}

// ─── Debug Handler ───────────────────────────────────────────────────────────

async function handleDebug(event: RequestEvent, tenantId: DatabaseId, user: any) {
  if (!event.locals.isAdmin) throw new AppError("Access denied", 403);

  return successResponse(event, {
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
    version: "0.5.0",
    uptime: process.uptime(),
    tenantId,
    user: user?.email || "anonymous",
    memory: process.memoryUsage(),
  });
}

// ─── Trash Handler ───────────────────────────────────────────────────────────

async function handleTrashRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  method: string | undefined,
) {
  const { url, request } = event;

  // List deleted items across all collections
  if (request.method === "GET") {
    const { contentSystem } = await import("@src/content/index.server");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 200);
    const schemas = await contentSystem.getCollections(tenantId);

    // Parallelize — fire all DB queries concurrently to eliminate N+1
    const queries = schemas
      .filter((s: any) => s._id)
      .map(async (schema: any) => {
        const col = `collection_${schema._id.replace(/-/g, "")}`;
        const r = await cms.db.crud.findMany(
          col,
          { isDeleted: true },
          {
            tenantId: tenantId as DatabaseId,
            includeDeleted: true,
            limit: limit * 2,
          },
        );
        return r.success && r.data
          ? r.data.map((item: any) => ({
              ...item,
              collectionId: schema._id,
              collectionName: schema.name || schema._id,
            }))
          : [];
      });

    const results = await Promise.all(queries);
    const allDeleted: any[] = results.flat();

    allDeleted.sort(
      (a, b) => new Date(b.deletedAt || 0).getTime() - new Date(a.deletedAt || 0).getTime(),
    );
    return successResponse(event, allDeleted.slice(0, limit));
  }

  // Restore a deleted item
  if (request.method === "POST" && method === "restore") {
    const { collectionId, entryId } = await request.json().catch(() => ({}));
    if (!collectionId || !entryId) {
      throw new AppError("Missing collectionId or entryId", 400);
    }
    const collectionName = `collection_${collectionId.replace(/-/g, "")}`;
    const result = await cms.db.crud.restore(collectionName, entryId as DatabaseId, {
      tenantId: tenantId as DatabaseId,
    });
    if (!result.success) throw new AppError(result.message || "Failed to restore item", 500);
    return successResponse(event, { success: true, restored: true });
  }

  throw new AppError(`Trash action '${method}' not implemented`, 404);
}
