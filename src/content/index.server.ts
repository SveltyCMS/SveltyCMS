/**
 * @file src/content/index.server.ts
 * @description Master Server-Side Entry Point for the SveltyCMS Content System.
 * 🛡️ SECURITY: STRICT server-only module.
 */

/// <reference types="vite/client" />

const isTest = !!(
  (typeof process !== "undefined" &&
    (process.env.NODE_ENV === "test" || !!process.env.VITEST || !!process.env.BUN_TEST)) ||
  import.meta.env?.MODE === "test" ||
  import.meta.env?.TEST ||
  (typeof globalThis !== "undefined" &&
    ((globalThis as any).vitest ||
      (globalThis as any).vi ||
      (globalThis as any).__vitest_worker__ ||
      (globalThis as any).describe ||
      (globalThis as any).it))
);

// Optional chaining: import.meta.env is undefined outside Vite (plain Node/Bun
// ESM execution), where direct property access would throw a TypeError.
if (!isTest && (import.meta.env?.SSR === false || typeof window !== "undefined")) {
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
export {
  syncContentState,
  detectCompilationDrift,
  detectOrganizationalDrift,
  reconcileOrganizationalManifest,
  ensureCompiledCollectionsFresh,
  beginGuiCompileSession,
  endGuiCompileSession,
  releaseGuiCompileSession,
  shouldSkipWatcherSync,
  type SyncContentReason,
  type SyncContentStateOptions,
  type SyncContentStateResult,
  type SyncContentMetrics,
  type CompilationDriftReport,
  type OrganizationalDriftReport,
} from "./sync-content-state.server";

import { syncContentState } from "./sync-content-state.server";

// Lazy-loaded services (avoid loading on import)
let contentService: any = null;
let apiSpecService: any = null;
let watcherStarted = false;

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

        await syncContentState({
          reason: "boot",
          tenantId,
          adapter: db,
          skipReconciliation: opts.skipReconciliation ?? false,
        });

        contentStore.initState = "initialized";
        contentStore.markInitializedForTenant(tenantId);
        initializedTenants.add(tenantId);

        // Guard against duplicate watcher registration across tenants / forced
        // re-inits (engine.startContentWatcher is also idempotent as backstop).
        if (
          !watcherStarted &&
          (process.env.NODE_ENV === "development" || process.env.TEST_MODE === "true")
        ) {
          watcherStarted = true;
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
            // Background task: attach an error handler so a rejection (DB down,
            // cache failure) never surfaces as an unhandled rejection crash.
            void apiSpecTask.catch((err) => {
              logger.error(
                `[ContentSystem] Background API spec generation failed for tenant ${tenantId}:`,
                err,
              );
            });
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
    // 🛡️ Benchmark servers: schema mode (see refreshContent) so DB-created
    // benchmark collections bootstrap config files instead of being pruned.
    const mode =
      process.env.TEST_MODE === "true" || process.env.BENCHMARK === "true" ? "schemas" : "full";
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
  // Adapter contract: crud.update(collection, id, data, options) — id-first.
  async update(collection: string, id: string, data: any, options?: any) {
    const svc = await getServerContentService();
    return svc.update(collection, id, data, options);
  },
  // Adapter contract: crud.delete(collection, id, options) — id-first.
  async delete(collection: string, id: string, options?: any) {
    const svc = await getServerContentService();
    return svc.delete(collection, id, options);
  },

  async getContentStructureFromDatabase(
    format: "flat" | "tree" = "tree",
    tenantId?: string | null,
    adapter?: DatabaseAdapter,
  ): Promise<any[]> {
    const svc = await getServerContentService();
    return svc.getContentStructureFromDatabase(format, tenantId, adapter);
  },

  async reorderContentNodes(items: any[], tenantId?: string | null): Promise<any[]> {
    const svc = await getServerContentService();
    await svc.reorderNodes(items, tenantId);
    const updated = await svc.getContentStructureFromDatabase("flat", tenantId);
    contentStore.batchUpsert(updated);

    const { buildOrganizationalManifestFromNodes, setOrganizationalManifest } =
      await import("@utils/collection-order.server");
    const { order, structureNodes } = buildOrganizationalManifestFromNodes(updated);
    await setOrganizationalManifest(order, structureNodes, tenantId ?? null);

    contentStore.updateVersion();
    return updated;
  },

  async upsertContentNodes(
    operations: ContentNodeOperation[],
    tenantId?: string | null,
    adapter?: DatabaseAdapter,
  ) {
    const svc = await getServerContentService();
    return svc.upsertContentNodes(operations, tenantId, adapter);
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
