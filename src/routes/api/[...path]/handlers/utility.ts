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

import { logger } from "@utils/logger";
import { AppError, raise } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import { successResponse, rawResponse } from "./base";
import { collectionTableName } from "@src/databases/core/collection-name";

// ─── Lazy-loaded service singletons ──────────────────────────────────────────

let apiSpecService: any;
let cacheService: any;
let versionCheckService: any;
let marketplaceService: import("@src/services/core/marketplace-service").MarketplaceService;
let configService: import("@src/services/core/config-service").ConfigService;

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

async function getConfigService() {
  if (!configService) {
    configService = (await import("@src/services/core/config-service")).configService;
  }
  return configService;
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
    if (namespace === "config_sync") {
      const service = await getConfigService();

      if (request.method === "GET") {
        const status = await service.getStatus(tenantId as string);
        return successResponse(event, status);
      }

      if (request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const action = typeof body?.action === "string" ? body.action : "";

        if (action === "import") {
          await service.performImport({ tenantId: tenantId as string });
          return successResponse(event, {
            success: true,
            message: "Configuration imported successfully.",
          });
        }

        throw new AppError(`Unknown config_sync action: "${action}". Valid actions: import.`, 400);
      }

      raise(405, "Method not allowed");
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
          | import("@src/services/core/marketplace-service").MarketplaceItem["type"]
          | null;
        const result = await service.list({
          type: type ?? undefined,
          search: url.searchParams.get("search") || undefined,
        });
        return successResponse(event, result);
      }

      if (request.method === "POST" && method === "install") {
        if (!user?.isAdmin && user?.role !== "admin") {
          raise(403, "Admin access required to install marketplace items");
        }
        const body = await request.json().catch(() => ({}));
        const itemId = typeof body?.itemId === "string" ? body.itemId : "";
        if (!itemId) raise(400, "itemId is required");

        const installed = await service.installTheme(itemId);
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

    // ── Remote Video Metadata ──
    if (
      (namespace === "remote-video" || namespace === "remoteVideo") &&
      request.method === "POST"
    ) {
      return handleRemoteVideo(event);
    }

    // ── SEO Link Suggestions ──
    if (
      namespace === "seo" &&
      (method === "link-suggestions" || !method) &&
      request.method === "POST"
    ) {
      return handleLinkSuggestions(event, cms, tenantId);
    }

    raise(404, `Utility endpoint /api/${namespace}${method ? "/" + method : ""} not implemented`);
  } catch (err: unknown) {
    logger.error(`[UtilityRoute Error] ${segments.join("/")}:`, err);
    if (err instanceof AppError) throw err;
    const msg = err instanceof Error ? err.message : "Utility operation failed";
    raise(500, msg);
  }
}

// ─── OpenAPI Handler ─────────────────────────────────────────────────────────

/** Generates and serves the OpenAPI 3.1.0 specification (admin-gated). */
async function handleOpenApiSpec(event: RequestEvent, tenantId: DatabaseId, url: URL) {
  const service = await getApiSpecService();

  // AI Reconnaissance Blinding: only authenticated admins can view the full spec
  if (!event.locals.isAdmin && !(event.locals as any).__testBypass) {
    raise(
      403,
      "Full OpenAPI specification is restricted to administrative roles to prevent automated reconnaissance.",
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
    raise(400, "Missing required fields: to, subject");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.to)) {
    raise(400, "Invalid email address");
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
      raise(500, result?.message || "Email send failed");
    }
    return successResponse(event, {
      success: true,
      message: "Email sent successfully",
    });
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    raise(500, `Email send failed: ${err.message}`, "EMAIL_SEND_ERROR");
  }
}

// ─── Debug Handler ───────────────────────────────────────────────────────────

async function handleDebug(event: RequestEvent, tenantId: DatabaseId, user: any) {
  if (!event.locals.isAdmin) raise(403, "Access denied");

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
        const col = collectionTableName(schema._id);
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
      raise(400, "Missing collectionId or entryId");
    }
    // 🐛 FIX (BUG-01): canonical physical name — replaces the manual
    // hyphen-stripping prefix (fragile duplicate of collectionTableName).
    const collectionName = collectionTableName(collectionId);
    const result = await cms.db.crud.restore(collectionName, entryId as DatabaseId, {
      tenantId: tenantId as DatabaseId,
    });
    if (!result.success) raise(500, result.message || "Failed to restore item");
    return successResponse(event, { success: true, restored: true });
  }

  raise(404, `Trash action '${method}' not implemented`);
}

// ── Lazy-loaded remote-video module ──
let _videoModule: typeof import("@widgets/custom/remote-video/video.server") | null = null;

/** Fetches remote video metadata (YouTube, Vimeo, etc.) with platform validation. */
async function handleRemoteVideo(event: RequestEvent) {
  const { request, locals } = event;
  if (!locals.user) {
    raise(401, "Unauthorized");
  }

  const body = await request.json().catch(() => null);
  if (!body || !body.url) {
    raise(400, "URL required in valid JSON body");
  }
  const { url, allowedPlatforms } = body;

  if (!_videoModule) {
    _videoModule = await import("@widgets/custom/remote-video/video.server");
  }
  const { getRemoteVideoData, detectPlatform } = _videoModule;

  const parsed = detectPlatform(url);
  if (!parsed) {
    raise(400, "Invalid or unsupported video URL");
  }

  if (
    allowedPlatforms &&
    allowedPlatforms.length > 0 &&
    !allowedPlatforms.includes(parsed.platform)
  ) {
    raise(403, `Platform '${parsed.platform}' is not allowed for this field.`);
  }

  const data = await getRemoteVideoData(url);
  if (!data) {
    raise(404, "Could not fetch video metadata. Please check the URL and try again.");
  }

  return successResponse(event, data);
}

/** High-performance internal link suggestions based on content keywords. */
async function handleLinkSuggestions(event: RequestEvent, cms: LocalCMS, tenantId: DatabaseId) {
  const { request, locals } = event;
  if (!locals.user) {
    raise(401, "Unauthorized");
  }
  if (!cms?.db) {
    raise(500, "Database adapter not initialized");
  }

  const dbAdapter = cms.db;
  const body = await request.json().catch(() => ({}));
  const { content, currentId, collectionId, focusKeyword } = body;
  if (!content && !focusKeyword) {
    return rawResponse(event, { success: true, suggestions: [] });
  }

  const searchKeywords: string[] = [];
  if (focusKeyword && typeof focusKeyword === "string") {
    searchKeywords.push(focusKeyword.toLowerCase());
  }

  if (content && typeof content === "string") {
    const words = content.toLowerCase().match(/\b\w{4,}\b/g) || [];
    const freq: Record<string, number> = {};

    for (const word of words) {
      if (word.startsWith("lt") || word.startsWith("gt") || word.startsWith("p")) continue;
      freq[word] = (freq[word] || 0) + 1;
    }

    const contentKeywords = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);

    for (const kw of contentKeywords) {
      if (!searchKeywords.includes(kw)) searchKeywords.push(kw);
    }
  }

  const keywordsToSearch = searchKeywords.slice(0, 2);
  if (keywordsToSearch.length === 0) {
    return rawResponse(event, { success: true, suggestions: [] });
  }

  const { contentSystem } = await import("@src/content/index.server");
  const allCollections = await contentSystem.getCollections(tenantId as string);
  const targetCollectionIds = new Set(["posts", "pages", "articles", "news", "blog", collectionId]);

  const searchCollections = allCollections.filter(
    (c) => c._id && targetCollectionIds.has(c._id as string),
  );

  if (searchCollections.length === 0 && collectionId) {
    const fallbackCol = allCollections.find((c) => c._id === collectionId);
    if (fallbackCol) searchCollections.push(fallbackCol);
  }

  const suggestions: Array<{
    title: string;
    url: string;
    score: number;
    collection: string;
  }> = [];

  const searchPromises: Promise<void>[] = [];

  for (const col of searchCollections) {
    const colId = col._id as string;
    const colName = col.name || colId;

    for (const keyword of keywordsToSearch) {
      const queryPromise = (async () => {
        try {
          const qb = dbAdapter.queryBuilder(colId);
          const result = await qb
            .search(keyword, ["title", "content"] as any)
            .where({
              status: "publish",
              tenantId: (tenantId as string) || "default",
            } as any)
            .limit(5)
            .execute();

          if (result.success && Array.isArray(result.data)) {
            for (const entry of result.data as any[]) {
              if (entry._id === currentId) continue;

              let score = 1.0;
              if (keyword === focusKeyword?.toLowerCase()) score += 0.5;
              if (entry.isCornerstone) score += 1.0;

              suggestions.push({
                title: entry.title || entry.name || entry.slug,
                url: `/${colId}/${entry.slug}`,
                score,
                collection: colName,
              });
            }
          }
        } catch (err) {
          logger.warn(`Error searching collection ${colId} for keyword "${keyword}":`, err);
        }
      })();

      searchPromises.push(queryPromise);
    }
  }

  await Promise.all(searchPromises);

  const uniqueSuggestions = Array.from(
    new Map(suggestions.sort((a, b) => b.score - a.score).map((s) => [s.url, s])).values(),
  ).slice(0, 8);

  return rawResponse(event, {
    success: true,
    suggestions: uniqueSuggestions,
    data: { suggestions: uniqueSuggestions },
  });
}
