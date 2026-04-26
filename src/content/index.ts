/**
 * @file src/content/index.ts
 * @description Single Entry Point and Public API Facade for the SveltyCMS Content System.
 */
import { setContext, getContext } from "svelte";
import { browser as isBrowser } from "$app/environment";
import { logger } from "@utils/logger";
import { contentStore } from "@stores/content-store.svelte";
import { contentNavigation, contentMetrics } from "./content-utils";
import type { ContentNodeOperation, Schema, NavigationNode } from "./types";
import type { DatabaseAdapter } from "@src/databases/db-interface";

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

// Lazy Holders for Server-Only Modules (Optimized for Cold-Starts & Build Safety)
let _contentService: any = null;
async function getContentService() {
  if (!_contentService) {
    const mod = await import(/* @vite-ignore */ "./content-service" + ".server");
    _contentService = mod.contentService || mod.default || mod;
  }
  return _contentService;
}

let _apiSpecService: any = null;
async function getApiSpecService() {
  if (!_apiSpecService) {
    // API Spec Service is located in services/system
    _apiSpecService = await import("@src/services/system/api-spec-service");
  }
  return _apiSpecService.apiSpecService || _apiSpecService.default || _apiSpecService;
}

// Memoization Cache for OpenAPI specs (per tenant)
const specCache = new Map<string, any>();

// --- STATE ---
let isReloading = false;
let reloadPromise: Promise<void> | null = null;

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
  get isReloading() {
    return isReloading;
  },
  get initState() {
    return contentStore.initState;
  },
  get nodeCount() {
    return contentStore.nodeCount;
  },

  /**
   * Returns a promise that resolves when any current reload is complete.
   */
  async waitForReload(): Promise<void> {
    if (reloadPromise) await reloadPromise;
  },

  // --- Lifecycle ---
  async initialize(
    tenantId: string | null = null,
    initializationParams?: { skipReconciliation?: boolean; incremental?: boolean } | boolean,
    adapter?: DatabaseAdapter,
  ): Promise<void> {
    if (isBrowser) {
      if (contentStore.initState === "uninitialized") contentStore.initState = "initialized";
      const { contentLiveSync } = await import("./content-sse.svelte");
      contentLiveSync.start();
      return;
    }

    const key = tenantId ?? "__global__";
    if (initializationPromises.has(key)) return initializationPromises.get(key)!;
    if (reloadPromise && key === "__global__") return reloadPromise;

    const promise = (async () => {
      const start = performance.now();
      contentStore.initState = "initializing";
      isReloading = true;
      try {
        const { getDb, ensureFullInitialization } = await import("@src/databases/db");
        let db = adapter || getDb();
        if (!db) {
          await ensureFullInitialization();
          db = getDb();
        }
        if (!db) throw new Error("Database not ready for content initialization");

        const skipReconciliation =
          typeof initializationParams === "boolean"
            ? initializationParams
            : (initializationParams?.skipReconciliation ?? false);

        // Use Lazy Holders
        const content = await getContentService();

        if (content && typeof content.fullReload === "function") {
          await content.fullReload(tenantId, skipReconciliation, db, null);
        } else {
          logger.error("❌ Content system fullReload not found on service object", {
            hasContent: !!content,
          });
        }

        // Optional: Start content watcher in dev mode
        if (process.env.NODE_ENV === "development") {
          try {
            const { startContentWatcher } = await import(
              /* @vite-ignore */ "./content-watcher" + ".server"
            );
            startContentWatcher();
          } catch (e) {
            logger.warn("Content watcher failed to start:", e);
          }
        }

        if (!skipReconciliation) {
          void this.generateApiSpec(tenantId || "global");
        }

        contentStore.initState = "initialized";
        contentMetrics.setInitializationTime(performance.now() - start);
        logger.debug("✅ Content system initialized (Server)", { tenantId });
      } catch (error) {
        contentStore.initState = "error";
        logger.error("Content initialization failed", { tenantId, error });
        throw error;
      } finally {
        isReloading = false;
        reloadPromise = null;
        initializationPromises.delete(key);
      }
    })();

    if (key === "__global__") reloadPromise = promise;
    initializationPromises.set(key, promise);
    return promise;
  },

  /**
   * Generates the OpenAPI specification for a tenant. Memoized.
   */
  async generateApiSpec(tenantId: string = "global", force = false) {
    if (isBrowser) return null;
    if (specCache.has(tenantId) && !force) return specCache.get(tenantId);

    try {
      const apiSpec = await getApiSpecService();
      const spec = await apiSpec.generateFullSpec(tenantId);
      specCache.set(tenantId, spec);
      return spec;
    } catch (err) {
      logger.warn("Failed to generate API spec:", err);
      return null;
    }
  },

  // --- Public Content API (Local SDK Bridge) ---
  collections: {
    getAll: (tenantId?: string | null) => contentStore.getAllCollections(tenantId),
    get: (id: string, tenantId?: string | null) => contentStore.getCollection(id, tenantId),
    getSmartFirst: (tenantId?: string | null) => contentStore.getSmartFirstCollection(tenantId),
  },

  // Compatibility wrappers for contentStore
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

  async find(collection: string, query: any, options?: any) {
    if (isBrowser) throw new Error("Content find is server-only");
    const content = await getContentService();
    return content.find(collection, query, options);
  },

  async findOne(collection: string, query: any, options?: any) {
    if (isBrowser) throw new Error("Content findOne is server-only");
    const content = await getContentService();
    return content.findOne(collection, query, options);
  },

  async insert(collection: string, data: any, options?: any) {
    if (isBrowser) throw new Error("Content insert is server-only");
    const content = await getContentService();
    return content.insert(collection, data, options);
  },

  async update(collection: string, query: any, data: any, options?: any) {
    if (isBrowser) throw new Error("Content update is server-only");
    const content = await getContentService();
    return content.update(collection, query, data, options);
  },

  async delete(collection: string, query: any, options?: any) {
    if (isBrowser) throw new Error("Content delete is server-only");
    const content = await getContentService();
    return content.delete(collection, query, options);
  },

  async refresh(
    tenantId?: string | null,
    skipReconciliation?: boolean,
    incremental = false,
    adapter?: DatabaseAdapter,
  ) {
    const key = tenantId ?? "__global__";
    logger.info(`[CONTENT] refresh called for ${key}. skipReconciliation: ${skipReconciliation}`);
    initializationPromises.delete(key);
    return this.initialize(tenantId, { skipReconciliation, incremental }, adapter);
  },

  async getNavigationStructure(tenantId: string | null = null) {
    return contentNavigation.getNavigationStructure(tenantId);
  },

  async getContentStructureFromDatabase(
    format: "flat" | "tree" = "tree",
    tenantId?: string | null,
  ): Promise<any[]> {
    if (isBrowser) return [];
    const content = await getContentService();
    return content.getContentStructureFromDatabase(format, tenantId);
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
    if (isBrowser) return contentStore.getNodesForTenant(tenantId);
    const content = await getContentService();
    await content.reorderNodes(items, tenantId);
    contentStore.updateVersion();
    return contentStore.getNodesForTenant(tenantId);
  },

  async upsertContentNodes(operations: ContentNodeOperation[], tenantId?: string | null) {
    if (isBrowser) return;
    const content = await getContentService();
    return content.upsertContentNodes(operations, tenantId);
  },

  async invalidateSpecificCaches(paths: string[], tenantId?: string | null) {
    if (isBrowser) return;
    const { cacheService } = await import("@src/databases/cache/cache-service");
    await cacheService.delete(paths[0], tenantId);
  },

  async scanForCollections() {
    if (isBrowser) return [];
    const content = await getContentService();
    return content.scanCompiledCollections();
  },

  getNode(id: string, _tenantId?: string | null) {
    return contentStore.getNode(id);
  },
  getNodeChildren(nodeId: string | null = null, tenantId?: string | null) {
    return contentStore.getChildren(nodeId, tenantId);
  },
  getBreadcrumb(path: string) {
    return contentNavigation.getBreadcrumb(path);
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

  getHealthStatus() {
    return contentMetrics.getHealthStatus();
  },
  getDiagnostics() {
    const m = contentMetrics.getMetrics();
    return {
      nodeCount: contentStore.nodeCount,
      collectionCount: contentStore.collectionCount,
      initTime: m.initializationTime,
      version: contentStore.contentVersion,
    };
  },
  validateStructure(tenantId?: string | null) {
    const nodes = contentStore.getNodesForTenant(tenantId);
    return { success: nodes.length > 0, count: nodes.length };
  },
  getMetrics() {
    return contentMetrics.getMetrics();
  },

  async getNavigationStructureProgressive(options: any = {}) {
    return contentNavigation.getNavigationStructureProgressive(options);
  },

  async loadSettings(tenantId?: string | null) {
    if (isBrowser) return null;
    const { getDb } = await import("@src/databases/db");
    const db = getDb();
    if (!db) return null;
    const dbInit = await import("../databases/db-init");
    return dbInit.loadSettingsFromDB(db, false, tenantId);
  },

  navigation: contentNavigation,
  metrics: contentMetrics,

  isInitializedForTenant(tenantId: string | null = null): boolean {
    const key = tenantId ?? "__global__";
    return contentStore.isInitialized && !initializationPromises.has(key);
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
