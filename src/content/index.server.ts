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
import { contentStore } from "@stores/content-registry.svelte";
import type { DatabaseAdapter } from "@src/databases/db-interface";
import type { ContentNodeOperation } from "./types";
import { contentSystemBase } from "./index";

export { contentStore } from "@stores/content-registry.svelte";
export {
  contentNavigation,
  contentMetrics,
  sortContentNodes,
  generateCategoryNodesFromPaths,
  hasDuplicateSiblingName,
  setContentContext,
  useContent,
  initializeContent,
  CONTENT_CONTEXT_KEY,
} from "./index";

export * from "./types";

// Lazy-loaded services (avoid loading on import)
let contentService: any = null;
let apiSpecService: any = null;

async function getServerContentService() {
  if (!contentService) {
    const mod = await import("./engine.server");
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

const initPromises = new Map<string | null, Promise<void>>();
const initializedTenants = new Set<string | null>();

export interface ContentInitOptions {
  force?: boolean;
  skipReconciliation?: boolean;
  skipApiSpec?: boolean;
  awaitApiSpec?: boolean;
  incremental?: boolean;
  /** Passed through by seed/setup callers; not consumed by the init coordinator */
  transaction?: unknown;
}

/**
 * Single init coordinator — shared by hooks and direct callers to prevent reload storms.
 */
export async function ensureContentInitialized(
  tenantId: string | null = null,
  options: ContentInitOptions | boolean = {},
  adapter?: DatabaseAdapter,
): Promise<void> {
  const opts: ContentInitOptions = typeof options === "boolean" ? { force: options } : options;
  const isForced = opts.force === true;

  if (
    (process.env.BENCHMARK_MODE === "true" ||
      process.env.BENCHMARK_MODE === "1" ||
      process.env.BENCHMARK_STABLE === "true") &&
    !isForced
  ) {
    if (initializedTenants.has(tenantId)) return;
    await _benchmarkInitialize(tenantId, adapter);
    initializedTenants.add(tenantId);
    return;
  }

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

        const { refreshContent } = await import("./engine.server");
        await refreshContent(tenantId, {
          mode: "full",
          adapter: db,
          skipReconciliation: opts.skipReconciliation ?? false,
        });

        contentStore.initState = "initialized";
        initializedTenants.add(tenantId);

        if (process.env.NODE_ENV === "development" || process.env.TEST_MODE === "true") {
          try {
            const { startContentWatcher } = await import("./engine.server");
            startContentWatcher();
          } catch (e) {
            logger.warn("Content watcher failed to start", { error: e });
          }
        }

        const shouldGenerateApiSpec = !opts.skipReconciliation && opts.skipApiSpec !== true;
        if (shouldGenerateApiSpec) {
          const apiSpecTask = generateApiSpec(tenantId || "global", true);
          if (opts.awaitApiSpec === true) {
            await apiSpecTask;
          } else {
            void apiSpecTask;
          }
        }
      } catch (err) {
        logger.error(`[ContentSystem] Init failed for tenant ${tenantId}:`, err);
        initPromises.delete(tenantId);
        throw err;
      }
    })();
    initPromises.set(tenantId, initPromise);
  }

  return initPromise;
}

async function _benchmarkInitialize(tenantId: string | null, adapter?: DatabaseAdapter) {
  const { getDb, getDbInitPromise } = await import("@src/databases/db");

  if (!adapter) {
    await getDbInitPromise(false, "CORE").catch(() => {
      logger.debug("DB init promise resolution failed during benchmark init");
    });
  }

  const db: DatabaseAdapter | undefined = adapter || getDb() || undefined;
  const { refreshContent } = await import("./engine.server");
  await refreshContent(tenantId, { mode: "schemas", adapter: db });

  contentStore.initState = "initialized";
}

async function generateApiSpec(tenantId: string = "global", force = false) {
  const apiSpec = await getServerApiSpecService();
  if (force) {
    await apiSpec.invalidateCache(tenantId);
  }
  return apiSpec.generateFullSpec(tenantId);
}

export const contentSystem = {
  ...contentSystemBase,

  /** @deprecated Use getCollection — kept for SDK/REST backward compatibility */
  getCollectionById(id: string, tenantId?: string | null) {
    return contentStore.getCollection(id, tenantId);
  },

  initialize(
    tenantId: string | null = null,
    options: ContentInitOptions | boolean = {},
    adapter?: DatabaseAdapter,
  ) {
    return ensureContentInitialized(tenantId, options, adapter);
  },

  async refresh(
    tenantId?: string | null,
    skipReconciliation = false,
    _incremental = false,
    adapter?: DatabaseAdapter,
  ) {
    const { refreshContent } = await import("./engine.server");
    const mode =
      process.env.BENCHMARK === "true" || process.env.TEST_MODE === "true" ? "schemas" : "full";
    return refreshContent(tenantId, {
      mode,
      adapter,
      skipReconciliation,
    });
  },

  generateApiSpec,

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

export { contentSystem as default };
