/**
 * @file src/content/index.server.ts
 * @description Master Server-Side Entry Point for the SveltyCMS Content System.
 * 🛡️ SECURITY: STRICT server-only module.
 */

/// <reference types="vite/client" />

const isTest = !!(
  (typeof process !== "undefined" &&
    (process.env.NODE_ENV === "test" || !!process.env.VITEST || !!process.env.BUN_TEST)) ||
  import.meta.env.MODE === "test" ||
  import.meta.env.TEST ||
  (typeof globalThis !== "undefined" &&
    ((globalThis as any).vitest ||
      (globalThis as any).vi ||
      (globalThis as any).__vitest_worker__ ||
      (globalThis as any).describe ||
      (globalThis as any).it))
);

if (!isTest && (import.meta.env.SSR === false || typeof window !== "undefined")) {
  throw new Error(
    "[SECURITY] content/index.server.ts is a server-only module and was imported on the client. This may expose server secrets!",
  );
}

import { logger } from "@utils/logger";
import { contentStore } from "@stores/content-store.svelte";
import { contentSystemBase } from "./core";
import type { DatabaseAdapter } from "@src/databases/db-interface";
import type { ContentNodeOperation } from "./types";

// Re-export shared safe items
export {
  contentNavigation,
  contentMetrics,
  sortContentNodes,
  generateCategoryNodesFromPaths,
  hasDuplicateSiblingName,
} from "./content-utils";

export * from "./types";
export { contentStore } from "@stores/content-store.svelte";
export { setContentContext, useContent, initializeContent } from "./index";

// Lazy-loaded services (avoid loading on import)
let contentService: any = null;
let apiSpecService: any = null;

async function getServerContentService() {
  if (!contentService) {
    const mod = await import("./content-service.server");
    contentService = mod.contentService;
  }
  return contentService;
}

async function getServerApiSpecService() {
  if (!apiSpecService) {
    const mod = await import("@src/services/system/api-spec-service");
    apiSpecService = (mod as any).apiSpecService || mod;
  }
  return apiSpecService;
}

// Module-level cache for initialization promises and initialized state
const initPromises = new Map<string | null, Promise<void>>();
const initializedTenants = new Set<string | null>();

// ===================================================================
// SERVER CONTENT SYSTEM (extends browser base)
// ===================================================================
export const contentSystem = {
  ...contentSystemBase,

  // --- Lifecycle ---
  async initialize(
    tenantId: string | null = null,
    options: any = {},
    adapter?: DatabaseAdapter,
  ): Promise<void> {
    const isForced = options === true || options?.force === true;

    // 🚀 Fast path for benchmarks: Skip if already initialized for this specific tenant
    if (
      (process.env.BENCHMARK_MODE === "true" ||
        process.env.BENCHMARK_MODE === "1" ||
        process.env.BENCHMARK_STABLE === "true") &&
      !isForced
    ) {
      if (initializedTenants.has(tenantId)) return;
      await this._benchmarkInitialize(tenantId, options, adapter);
      initializedTenants.add(tenantId);
      return;
    }

    // 🛡️ SAFETY: Use a shared promise per tenant to prevent initialization storms
    let initPromise = initPromises.get(tenantId);

    if (!initPromise || isForced) {
      initPromise = (async () => {
        try {
          const { getDb, ensureFullInitialization } = await import("@src/databases/db");

          let db = adapter || getDb();
          if (!db) {
            await ensureFullInitialization();
            db = getDb();
          }
          if (!db) throw new Error("Database not ready for content initialization");

          const svc = await getServerContentService();
          await svc.fullReload(tenantId, options.skipReconciliation ?? false, db, null);

          // Mark as initialized to prevent redundant initialization calls
          contentStore.initState = "initialized";
          initializedTenants.add(tenantId);

          // Dev watcher
          if (process.env.NODE_ENV === "development" || process.env.TEST_MODE === "true") {
            try {
              const { startContentWatcher } = await import("./content-watcher.server");
              startContentWatcher();
            } catch (e) {
              logger.warn("Content watcher failed to start", { error: e });
            }
          }

          if (!options.skipReconciliation) {
            void this.generateApiSpec(tenantId || "global", true);
          }
        } catch (err) {
          logger.error(`[ContentSystem] Init failed for tenant ${tenantId}:`, err);
          initPromises.delete(tenantId); // Allow retry on failure
          throw err;
        }
      })();
      initPromises.set(tenantId, initPromise);
    }

    return initPromise;
  },

  async _benchmarkInitialize(tenantId: string | null, _options: any, adapter?: DatabaseAdapter) {
    // Ultra-fast path for benchmarks or manual refreshes to avoid full reconciliation
    const { getDb, getDbInitPromise } = await import("@src/databases/db");

    // 🛡️ DEADLOCK PROTECTION: Only await DB init if we don't already have an adapter.
    // Background tasks (which run DURING init) provide the adapter to avoid waiting on themselves.
    if (!adapter) {
      await getDbInitPromise(false, "CORE").catch(() => {});
    }

    const db: DatabaseAdapter | undefined = adapter || getDb() || undefined;

    const { refreshCollectionsCache } = await import("./content-service.server");
    await refreshCollectionsCache(tenantId, db);

    // 🚀 Performance: Mark as initialized so benchmarks don't re-init on every request
    contentStore.initState = "initialized";
  },

  async refresh(
    tenantId?: string | null,
    skipReconciliation = false,
    incremental = false,
    adapter?: DatabaseAdapter,
  ) {
    if (process.env.BENCHMARK === "true" || process.env.TEST_MODE === "true") {
      const { refreshCollectionsCache } = await import("./content-service.server");
      return await refreshCollectionsCache(tenantId, adapter);
    }
    return this.initialize(tenantId, { skipReconciliation, incremental, force: true }, adapter);
  },

  async generateApiSpec(tenantId: string = "global", force = false) {
    const apiSpec = await getServerApiSpecService();
    if (force) {
      await apiSpec.invalidateCache(tenantId);
    }
    return apiSpec.generateFullSpec(tenantId);
  },

  // --- CRUD Pass-throughs (with lazy loading) ---
  async find(collection: string, query: any, options?: any) {
    const svc = await getServerContentService();
    return svc.find(collection, query, options);
  },
  async findOne(collection: string, query: any, options?: any) {
    const svc = await getServerContentService();
    return svc.findOne(collection, query, options);
  },
  async insert(collection: string, data: any, options?: any) {
    const svc = await getServerContentService();
    return svc.insert(collection, data, options);
  },
  async update(collection: string, query: any, data: any, options?: any) {
    const svc = await getServerContentService();
    return svc.update(collection, query, data, options);
  },
  async delete(collection: string, query: any, options?: any) {
    const svc = await getServerContentService();
    return svc.delete(collection, query, options);
  },

  // --- Node Operations ---
  async getContentStructureFromDatabase(
    format: "flat" | "tree" = "tree",
    tenantId?: string | null,
  ): Promise<any[]> {
    const svc = await getServerContentService();
    return svc.getContentStructureFromDatabase(format, tenantId);
  },

  async reorderContentNodes(items: any[], tenantId?: string | null): Promise<any[]> {
    const svc = await getServerContentService();
    await svc.reorderNodes(items, tenantId);
    contentStore.updateVersion();
    return contentStore.getNodesForTenant(tenantId);
  },

  async upsertContentNodes(operations: ContentNodeOperation[], tenantId?: string | null) {
    const svc = await getServerContentService();
    return svc.upsertContentNodes(operations, tenantId);
  },

  async search(query: string, options?: any) {
    const svc = await getServerContentService();
    return svc.search(query, options);
  },

  async scanForCollections() {
    const svc = await getServerContentService();
    return svc.scanCompiledCollections();
  },
};

// Export the server version as default for server imports
export { contentSystem as default };
