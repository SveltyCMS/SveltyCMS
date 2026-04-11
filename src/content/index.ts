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
    skipReconciliation = false,
    adapter?: IDBAdapter,
    incremental = false,
  ): Promise<void> {
    if (browser) {
      if (contentStore.initState === "uninitialized") contentStore.initState = "initialized";
      const { contentLiveSync } = await import("./content-sse.svelte");
      contentLiveSync.start();
      return;
    }

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
          return;
        }
      }

      // 2. Reload via Server Service (supports incremental)
      const { contentService } = await import("./content-service.server");
      await contentService.fullReload(tenantId, skipReconciliation, adapter, incremental);

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

      contentStore.initState = "initialized";
      contentMetrics.setInitializationTime(performance.now() - start);
    } catch (error) {
      contentStore.initState = "error";
      logger.error("Content initialization failed", error);
    }
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
    return `/${lang}/collection/${first.name}`;
  },
  async refresh(tenantId?: string | null, skipReconciliation?: boolean, incremental = false) {
    return this.initialize(tenantId, skipReconciliation, undefined, incremental);
  },
  async getNavigationStructure(tenantId: string | null = null) {
    return contentNavigation.getNavigationStructure(tenantId);
  },
  async getContentStructureFromDatabase(
    format: "flat" | "nested" = "nested",
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
  validateStructure(): any {
    return { success: true };
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
  getCollectionStats(_id: string, _tenantId?: string | null): any {
    return {};
  },

  navigation: contentNavigation,
  metrics: contentMetrics,

  async upsertContentNodes(_operations: ContentNodeOperation[], _tenantId?: string | null) {
    const { contentService } = await import("./content-service.server");
    // Trigger version update to indicate changes
    contentStore.updateVersion();
    logger.debug("Content updated (upsertContentNodes - reload recommended for consistency)", {
      contentService,
    });
  },

  /**
   * Check if the content system is ready for a specific tenant.
   */
  isInitializedForTenant(_tenantId: string | null = null): boolean {
    return contentStore.isInitialized;
  },

  // --- Context API ---
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
        return contentStore.isInitialized;
      },
    };
    setContext(CONTENT_CONTEXT_KEY, ctx);
    return ctx;
  },
};

/**
 * Backward compatibility alias for the Content System.
 * @deprecated Use contentSystem instead.
 */
export const contentManager = contentSystem;

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
  return (
    context || {
      get isReady() {
        return contentSystem.isInitialized;
      },
      get collections() {
        return contentSystem.collections;
      },
      get navigation() {
        return contentSystem.navigation || [];
      },
      tenantId: null as any,
      content: contentSystem,
    }
  );
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
  await contentSystem.initialize(pageData?.tenantId, true);
}
