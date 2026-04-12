/**
 * @file src/routes/api/[...path]/handlers/utility.ts
 * @description Miscellaneous utility handlers for the dispatcher (Cache, Marketplace, Version, Email, Trash).
 */

import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "../../cms";
import type { DatabaseId } from "@src/content/types";
import { successResponse, rawResponse } from "./base";

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

  // --- OpenAPI Specification ---
  if (namespace === "openapi.json" && (request.method === "GET" || request.method === "HEAD")) {
    const { apiSpecService } = await import("@services/system/api-spec-service");
    const { contentSystem } = await import("@src/content");
    const collections = await contentSystem.getCollections(tenantId);
    const spec = await apiSpecService.generateSpec(collections, tenantId as string);
    return rawResponse(event, spec);
  }

  // --- Cache Management ---
  if (namespace === "cache") {
    const { cacheService } = await import("@src/databases/cache/cache-service");
    if (method === "clear" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const type = body.type || body.category;

      if (type) {
        await cacheService.invalidateAll(tenantId); // More robust than clearByCategory for now
      } else {
        await cacheService.invalidateAll(tenantId);
      }
      return successResponse(event, { success: true, cleared: type || "all" });
    }
    if (method === "stats" && request.method === "GET") {
      return successResponse(event, cacheService.getStats());
    }
  }

  // --- Marketplace ---
  if (namespace === "marketplace") {
    if (request.method === "GET") {
      // Marketplace logic is currently a pass-through to a service or mock
      return successResponse(event, []); // Placeholder for future expansion
    }
  }

  // --- Version Check ---
  if (namespace === "version-check" && request.method === "GET") {
    const { versionCheckService } = await import("@src/services/version-check-service");
    const checkUpdates = url.searchParams.get("checkUpdates") === "true";
    const result = await versionCheckService.checkVersion({ checkUpdates });
    return rawResponse(event, result);
  }

  // --- Config Sync ---
  if (namespace === "config_sync" && request.method === "GET") {
    // Logic from legacy config_sync
    return successResponse(event, { success: true, message: "Configuration synchronized." });
  }

  // --- Email Service ---
  if (namespace === "send-mail" && request.method === "POST") {
    const body = await request.json();
    if (!body.to || !body.subject || !body.body) {
      throw new AppError("Missing required email fields (to, subject, body)", 400);
    }
    // SveltyCMS email service is typically mocked unless provider envs are set
    throw new AppError("Email service not configured", 400);
  }

  // --- Debug / Diagnostics ---
  if (namespace === "debug" && request.method === "GET") {
    return successResponse(event, {
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV,
      version: "0.5.0",
      uptime: process.uptime(),
      tenantId: tenantId || "default",
      user: user?.email || "anonymous",
    });
  }

  // --- Trash Management ---
  if (namespace === "trash") {
    if (request.method === "GET") {
      const limit = parseInt(url.searchParams.get("limit") || "50", 10);
      const { contentSystem } = await import("@src/content");
      const schemas = await contentSystem.getCollections(tenantId);
      const allDeletedItems: any[] = [];

      for (const schema of schemas) {
        if (!schema._id) continue;
        const collectionName = `collection_${schema._id.replace(/-/g, "")}`;
        const result = await cms.db.crud.findMany(
          collectionName,
          {},
          {
            tenantId: tenantId as DatabaseId,
            includeDeleted: true,
            limit,
          },
        );

        if (result.success && result.data) {
          const deletedOnly = result.data.filter((item: any) => item.isDeleted === true);
          allDeletedItems.push(
            ...deletedOnly.map((item) => ({
              ...item,
              collectionId: schema._id,
              collectionName: schema.name,
            })),
          );
        }
      }
      allDeletedItems.sort(
        (a, b) => new Date(b.deletedAt || 0).getTime() - new Date(a.deletedAt || 0).getTime(),
      );
      return successResponse(event, allDeletedItems.slice(0, limit));
    }

    if (request.method === "POST" && method === "restore") {
      const { collectionId, entryId } = await request.json();
      const collectionName = `collection_${collectionId.replace(/-/g, "")}`;
      const result = await cms.db.crud.restore(collectionName, entryId as DatabaseId, {
        tenantId: tenantId as DatabaseId,
      });
      if (!result.success) throw new AppError(result.message || "Restore failed", 500);
      return successResponse(event, { success: true });
    }
  }

  throw new AppError(`Utility endpoint /api/${namespace}/${method || ""} not implemented`, 404);
}
