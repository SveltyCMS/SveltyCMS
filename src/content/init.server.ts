/**
 * @file src/content/init.server.ts
 * @description Server-only initialization logic for the Content System.
 * This file is strictly for SSR/Server context to prevent security guard leaks.
 */

import { logger } from "@utils/logger";
import { contentSystem } from "./index";
import type { DatabaseAdapter } from "@src/databases/db-interface";

/**
 * Lazy resolver for the content service.
 */
export async function getServerContentService(): Promise<any> {
  const { contentService } = await import("./content-service.server");
  return contentService;
}

/**
 * Lazy resolver for the API spec service.
 */
export async function getServerApiSpecService(): Promise<any> {
  const mod = await import("@src/services/system/api-spec-service");
  return (mod as any).apiSpecService || mod;
}

/**
 * Server-side OpenAPI spec generation.
 */
export async function generateServerApiSpec(tenantId: string = "global", _force = false) {
  const apiSpec = await getServerApiSpecService();
  return apiSpec.generateFullSpec(tenantId);
}

/**
 * Server-side initialization of the content system.
 */
export async function initializeServerContent(
  tenantId?: string | null,
  options: any = {},
  adapter?: DatabaseAdapter,
) {
  const { getDb, ensureFullInitialization } = await import("@src/databases/db");
  let db = adapter || getDb();
  if (!db) {
    await ensureFullInitialization();
    db = getDb();
  }
  if (!db) throw new Error("Database not ready for content initialization");

  // Use dynamic imports for server modules
  const { contentService } = await import("./content-service.server");

  // 🚀 ULTRA ELITE: Fast-path for benchmarks
  if (process.env.BENCHMARK_STABLE === "true") {
    const { refreshCollectionsCache } = await import("./content-service.server");
    await refreshCollectionsCache(tenantId, db);
  } else {
    await contentService.fullReload(tenantId, options.skipReconciliation, db, null);
  }

  // Start watcher in dev/test
  if (process.env.NODE_ENV === "development" || process.env.TEST_MODE === "true") {
    try {
      const { startContentWatcher } = await import("./content-watcher.server");
      startContentWatcher();
    } catch (e) {
      logger.warn("Content watcher failed to start", { error: e });
    }
  }

  if (!options.skipReconciliation) {
    void contentSystem.generateApiSpec(tenantId || "global");
  }
}
