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

    const key = tenantId ?? "__global__";

    // If already in-flight for this tenant, return the existing promise
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
      const start = performance.now();
      contentStore.initState = "initializing";

      try {
        // --- SERVER-ONLY LOGIC ---
        const { contentService } = await import("./content-service.server");

        // 1. Reconcile filesystem schemas with database nodes
        await contentService.fullReload(tenantId, skipReconciliation, adapter, null);

        // 2. Warm API Specification Cache in background
        if (!skipReconciliation) {
          const { apiSpecService } = await import("@src/services/system/api-spec-service");
          void apiSpecService.generateFullSpec(tenantId);
        }

        contentStore.initState = "initialized";
        contentMetrics.setInitializationTime(performance.now() - start);
        logger.debug("✅ Content system initialized (Server)", { tenantId });
      } catch (error) {
        contentStore.initState = "error";
        logger.error("Content initialization failed", { tenantId, error });
        throw error;
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
    const pathValue = first.path || `/collection/${first._id}`;
    return `/${lang}${pathValue.startsWith("/") ? pathValue : `/${pathValue}`}`;
  },
  async refresh(tenantId?: string | null, skipReconciliation?: boolean, incremental = false) {
    const key = tenantId ?? "__global__";
    initializationPromises.delete(key);
    return this.initialize(tenantId, { skipReconciliation, incremental });
  },
  async getNavigationStructure(tenantId: string | null = null) {
    return contentNavigation.getNavigationStructure(tenantId);
  },
  async getContentStructureFromDatabase(
    format: "flat" | "tree" = "tree",
    tenantId?: string | null,
  ): Promise<any[]> {
    if (browser) return [];
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
    if (browser) return contentStore.getNodesForTenant(tenantId);
    const { contentService } = await import("./content-service.server");
    await contentService.reorderNodes(items, tenantId);
    contentStore.updateVersion();
    return contentStore.getNodesForTenant(tenantId);
  },
  async upsertContentNodes(operations: ContentNodeOperation[], tenantId?: string | null) {
    if (browser) return;
    const { contentService } = await import("./content-service.server");
    return contentService.upsertContentNodes(operations, tenantId);
  },
  async invalidateSpecificCaches(paths: string[], tenantId?: string | null) {
    if (browser) return;
    // Cache invalidation is server-only
    const { cacheService } = await import("@src/databases/cache/cache-service");
    await cacheService.delete(paths, tenantId);
  },
  async warmEntriesCache(collectionId: string, entryIds: string[], tenantId?: string | null) {
    logger.debug("Warming entries cache (Shim)", { collectionId, entryIds, tenantId });
  },
  getMetrics(): any {
    return contentMetrics.getMetrics();
  },
  validateStructure(tenantId?: string | null): any {
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

  isInitializedForTenant(tenantId: string | null = null): boolean {
    const key = tenantId ?? "__global__";
    return contentStore.isInitialized && !initializationPromises.has(key);
  },

  async scanForCollections() {
    if (browser) return [];
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

export function useContent(): ContentContext {
  const context = getContext<ContentContext>(CONTENT_CONTEXT_KEY);
  if (context) return context;
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

export function setContentContext(tenantId: string | null = null) {
  return contentSystem.setContext(tenantId);
}

export async function initializeContent(pageData?: any) {
  if (pageData?.contentNodes) contentStore.sync(pageData.contentNodes);
  await contentSystem.initialize(pageData?.tenantId, { skipReconciliation: true });
}
