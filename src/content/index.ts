/**
 * @file src/content/index.ts
 * @description
 * Single Entry Point and Public API Facade for the SveltyCMS Content System.
 * Consolidates manager, initializer, context, and re-exports.
 */
import { setContext, getContext } from "svelte";
import { browser } from "$app/environment";
import { logger } from "@utils/logger";
import { contentStore } from "@stores/content-store.svelte";
import { contentNavigation, contentMetrics } from "./content-utils";
import type { ContentNodeOperation, Schema, NavigationNode } from "./types";
import type { IDBAdapter } from "@src/databases/db-interface";
import { CacheCategory } from "@src/databases/cache/types";

// --- RE-EXPORTS ---
export * from "./types";
export { contentStore } from "@stores/content-store.svelte";
export {
  contentNavigation,
  contentMetrics,
  sortContentNodes,
  generateCategoryNodesFromPaths,
  hasDuplicateSiblingName,
} from "./content-utils";

// --- CACHE HELPERS ---
const getCacheService = async () =>
  (await import("@src/databases/cache/cache-service")).cacheService;
const getRedisTTL = async () => (await import("@src/databases/cache/cache-service")).REDIS_TTL_S;

// --- CONTEXT ---
const CONTENT_CONTEXT_KEY = Symbol("content-context");

// Map of tenant-keyed initialization promises for multi-tenant SSR isolation
const initializationPromises = new Map<string, Promise<void>>();

/**
 * Central orchestrator for the SveltyCMS Content System.
 */
export const contentSystem = {
  // --- Reactive State ---
  get version() {
    return contentStore.contentVersion;
  },
  get isInitialized() {
    return contentStore.isInitialized;
  },
  get initState() {
    return contentStore.initState;
  },
  get nodeCount() {
    return contentStore.nodeCount;
  },

  // --- Lifecycle ---
  async initialize(
    tenantId: string | null = null,
    initializationParams?: { skipReconciliation?: boolean; incremental?: boolean } | boolean,
    adapter?: IDBAdapter,
  ): Promise<void> {
    const skipReconciliation =
      typeof initializationParams === "boolean"
        ? initializationParams
        : (initializationParams?.skipReconciliation ?? false);
    const incremental =
      typeof initializationParams === "object"
        ? (initializationParams?.incremental ?? false)
        : false;

    const key = tenantId ?? "__global__";

    // If already in-flight for this tenant, return the existing promise
    // Unless this is a forced refresh which is handled via refresh()
    if (initializationPromises.has(key)) {
      return initializationPromises.get(key)!;
    }

    if (browser) {
      if (contentStore.initState === "uninitialized") contentStore.initState = "initialized";
      const { contentLiveSync } = await import("./content-sse.svelte");
      contentLiveSync.start();
      return;
    }

    const promise = (async () => {
      const { isSetupComplete } = await import("@utils/setup-check");
      const setupComplete = isSetupComplete();
      contentStore.initState = "initializing";
      const start = performance.now();

      try {
        // 1. Try Cache
        if (skipReconciliation && setupComplete) {
          const cacheService = await getCacheService();
          const cached = (await cacheService.get(
            "cms:content_structure",
            tenantId,
            CacheCategory.CONTENT,
          )) as any;
          if (cached?.nodes) {
            contentStore.sync(Object.values(cached.nodes));
            contentMetrics.setInitializationTime(performance.now() - start);
            contentStore.initState = "initialized";
            return;
          }
        }

        // 2. Reload via Server Service (supports incremental)
        const { contentService } = await import("./content-service.server");
        await contentService.fullReload(tenantId, skipReconciliation, adapter, incremental);

        // 2.5 Invalidate OpenAPI Spec if reconciliation occurred
        if (!skipReconciliation) {
          const { apiSpecService } = await import("@src/services/system/api-spec-service");
          void apiSpecService.invalidateCache(tenantId || undefined);
        }

        // 3. Populate Cache
        if (setupComplete) {
          const cacheService = await getCacheService();
          const ttl = await getRedisTTL();
          const state = {
            nodes: Object.fromEntries(contentStore.getNodesEntries()),
            version: contentStore.contentVersion,
          };
          await cacheService.set(
            "cms:content_structure",
            state,
            ttl,
            tenantId,
            CacheCategory.CONTENT,
            ["cms:content"],
          );
        }

        // Fix: Ensure initialized state is set ONLY after full success
        contentStore.initState = "initialized";
        contentMetrics.setInitializationTime(performance.now() - start);
      } catch (error) {
        contentStore.initState = "error";
        console.error(`[ContentSystem] Initialization failed for tenant ${tenantId}:`, error);
        logger.error("Content initialization failed", { tenantId, key, error });
        throw error; // Re-throw to allow callers to handle/retry
      } finally {
        initializationPromises.delete(key);
      }
    })();

    initializationPromises.set(key, promise);
    return promise;
  },

  // --- Public Content API ---
  collections: {
    getAll: (tenantId?: string | null) => contentStore.getAllCollections(tenantId),
    get: (id: string, tenantId?: string | null) => contentStore.getCollection(id, tenantId),
    getSmartFirst: (tenantId?: string | null) => contentStore.getSmartFirstCollection(tenantId),
  },

  // --- Compatibility Shims ---
  getCollections(tenantId?: string | null) {
    return contentStore.getAllCollections(tenantId);
  },
  getCollection(id: string, tenantId?: string | null) {
    return contentStore.getCollection(id, tenantId);
  },
  getCollectionById(id: string, tenantId?: string | null) {
    return contentStore.getCollection(id, tenantId);
  },
  getFirstCollection(tenantId?: string | null) {
    return contentStore.getSmartFirstCollection(tenantId);
  },
  async getFirstCollectionRedirectUrl(
    lang: string = "en",
    tenantId?: string | null,
  ): Promise<string | null> {
    const first = contentStore.getSmartFirstCollection(tenantId);
    if (!first) return null;
    // ✨ Redirect to canonical path (e.g. /en/collection/authors) instead of hardcoding /collection
    const pathValue = first.path || `/collection/${first._id}`;
    return `/${lang}${pathValue.startsWith("/") ? pathValue : `/${pathValue}`}`;
  },
  async refresh(tenantId?: string | null, skipReconciliation?: boolean, incremental = false) {
    const key = tenantId ?? "__global__";
    initializationPromises.delete(key); // Clear existing promise to force re-initialization
    return this.initialize(tenantId, { skipReconciliation, incremental });
  },
  async getNavigationStructure(tenantId: string | null = null) {
    return contentNavigation.getNavigationStructure(tenantId);
  },
  async getContentStructureFromDatabase(
    format: "flat" | "tree" = "tree",
    tenantId?: string | null,
  ): Promise<any[]> {
    const { contentService } = await import("./content-service.server");
    return contentService.getContentStructureFromDatabase(format, tenantId);
  },
  sync(nodes: any[]) {
    contentStore.sync(nodes);
  },
  getContentVersion(): number {
    return contentStore.contentVersion;
  },
  async getContentStructure(tenantId?: string | null): Promise<any[]> {
    return contentStore.getNodesForTenant(tenantId);
  },
  async reorderContentNodes(items: any[], tenantId?: string | null): Promise<any[]> {
    const { contentService } = await import("./content-service.server");
    await contentService.reorderNodes(items, tenantId);
    contentStore.updateVersion();
    return contentStore.getNodesForTenant(tenantId);
  },
  async invalidateSpecificCaches(paths: string[], tenantId?: string | null) {
    const cacheService = await getCacheService();
    await cacheService.delete(paths, tenantId);
  },
  async warmEntriesCache(collectionId: string, entryIds: string[], tenantId?: string | null) {
    // No-op or delegate to service if needed; for now, thin shim
    logger.debug("Warming entries cache (Shim)", { collectionId, entryIds, tenantId });
  },
  clearFirstCollectionCache() {
    // No-op in new architecture as we use runes
  },
  getMetrics(): any {
    return contentMetrics.getMetrics();
  },
  validateStructure(tenantId?: string | null): any {
    // Fix: validateStructure always returns { success: true } — now performs basic existence check
    const nodes = contentStore.getNodesForTenant(tenantId);
    return { success: nodes.length > 0, count: nodes.length };
  },
  getDiagnostics(): any {
    const m = contentMetrics.getMetrics();
    return {
      nodeCount: contentStore.nodeCount,
      collectionCount: contentStore.collectionCount,
      initTime: m.initializationTime,
      version: contentStore.contentVersion,
    };
  },
  getBreadcrumb(path: string): any {
    return contentNavigation.getBreadcrumb(path);
  },
  getHealthStatus(): any {
    return contentMetrics.getHealthStatus();
  },
  getNavigationStructureProgressive(options: any): any {
    return contentNavigation.getNavigationStructureProgressive(options);
  },
  getNode(id: string, _tenantId?: string | null): any {
    return contentStore.getNode(id);
  },
  getNodeChildren(nodeId: string | null = null, tenantId?: string | null): any {
    return contentStore.getChildren(nodeId, tenantId);
  },
  getCollectionStats(id: string, tenantId?: string | null): any {
    const col = contentStore.getCollection(id, tenantId);
    if (!col) return null;
    return {
      _id: col._id || id,
      name: col.name || id,
      icon: col.icon || "mdi:folder",
      path: col.path || `/collection/${col.name}`,
      fieldCount: (col.fields || []).length,
      hasRevisions: col.revision || false,
      hasLivePreview: !!col.livePreview,
      status: col.status || "active",
    };
  },

  navigation: contentNavigation,
  metrics: contentMetrics,

  async upsertContentNodes(operations: ContentNodeOperation[], tenantId?: string | null) {
    const { dbAdapter } = await import("@src/databases/db");
    if (!dbAdapter || operations.length === 0) return;

    const upsertOps = operations.filter((op) => op.type === "upsert" || !op.type);
    const deleteOps = operations.filter((op) => op.type === "delete");

    // 1. Handle Upserts/Updates
    if (upsertOps.length > 0) {
      const updates = upsertOps
        .map((op) => {
          const id = (op.node as any).id || op.node._id?.toString();
          if (!op.node.path) {
            logger.warn("[upsertContentNodes] Skipping node update due to missing path", op.node);
            return null;
          }
          return {
            path: op.node.path,
            id: id,
            changes: op.node,
          };
        })
        .filter((u): u is { path: string; id: string | undefined; changes: any } => u !== null);

      if (updates.length > 0) {
        await dbAdapter.content.nodes.bulkUpdate(updates, { tenantId: tenantId as any });
      }
    }

    // 2. Handle Deletions
    if (deleteOps.length > 0) {
      const pathsToDelete = deleteOps
        .map((op) => op.node.path)
        .filter((p): p is string => typeof p === "string" && p.length > 0);

      if (pathsToDelete.length > 0) {
        logger.info(`[upsertContentNodes] Deleting ${pathsToDelete.length} nodes by path`);
        await dbAdapter.content.nodes.deleteMany(pathsToDelete, { tenantId: tenantId as any });
      }
    }

    contentStore.updateVersion();
    logger.debug(`Content structure synced (${operations.length} operations processed)`);
  },

  /**
   * Check if the content system is ready for a specific tenant.
   */
  isInitializedForTenant(tenantId: string | null = null): boolean {
    const key = tenantId ?? "__global__";
    return contentStore.isInitialized && !initializationPromises.has(key);
  },

  // --- Context API ---
  /**
   * Scans for compiled schema files from disk (.compiledCollections).
   * Thin facade over the internal server-side scanner.
   */
  async scanForCollections() {
    const { contentService } = await import("./content-service.server");
    return contentService.scanCompiledCollections();
  },

  setContext(tenantId: string | null = null) {
    const ctx = {
      content: this,
      tenantId,
      get collections() {
        return contentStore.getAllCollections(tenantId);
      },
      get navigation() {
        return contentNavigation.getNavigationStructureProgressive({ tenantId, maxDepth: 999 });
      },
      get isReady() {
        return contentSystem.isInitializedForTenant(tenantId);
      },
    };
    setContext(CONTENT_CONTEXT_KEY, ctx);
    return ctx;
  },
};

export interface ContentContext {
  content: typeof contentSystem;
  tenantId: string | null;
  collections: Schema[];
  navigation: NavigationNode[];
  isReady: boolean;
}

/**
 * Hook to retrieve content context with proper typing.
 */
export function useContent(): ContentContext {
  const context = getContext<ContentContext>(CONTENT_CONTEXT_KEY);
  if (context) return context;

  // Fix: useContent fallback returns namespace object — now returns properly typed fallback
  return {
    get isReady() {
      return contentSystem.isInitialized;
    },
    get collections() {
      return contentSystem.collections.getAll();
    },
    get navigation() {
      return contentNavigation.getNavigationStructureProgressive({ maxDepth: 999 });
    },
    tenantId: null,
    content: contentSystem,
  };
}

/**
 * Setup content context for the application.
 */
export function setContentContext(tenantId: string | null = null) {
  return contentSystem.setContext(tenantId);
}

/**
 * Legacy/Standard entry for layouts.
 */
export async function initializeContent(pageData?: any) {
  if (pageData?.contentNodes) contentStore.sync(pageData.contentNodes);
  await contentSystem.initialize(pageData?.tenantId, { skipReconciliation: true });
}
