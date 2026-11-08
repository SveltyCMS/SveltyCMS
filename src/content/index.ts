/**
 * @file src/content/index.ts
 * @description Single Entry Point and Public API Facade for the SveltyCMS Content System (Browser-safe).
 * 🛡️ SECURITY: This file MUST remain browser-safe. No server-only imports allowed.
 *
 * ### Features:
 * - re-exports the context (`context.ts`), tree helpers (`content-tree.ts`), and
 *   navigation/metrics (`content-navigation.ts`) modules
 * - `contentSystemBase` / `contentSystem` runtime entry points for server and SDK callers
 *
 * Client routes import `@src/content/context` and `@src/content/content-tree`
 * directly — importing this facade also loads the server-side navigation surface.
 */

const isBrowser = typeof window !== "undefined";
import { logger } from "@utils/logger";
import { contentStore } from "@stores/content-registry.svelte";
import { contentNavigation, contentMetrics } from "./content-navigation";
import { getCollectionRedirectPathFromSchema } from "./first-collection";
import { initializeContent, setContentContext, useContent } from "./context";

export * from "./types";
export { contentStore } from "@stores/content-registry.svelte";
export { contentNavigation, contentMetrics } from "./content-navigation";
export {
  sortContentNodes,
  generateCategoryNodesFromPaths,
  hasDuplicateSiblingName,
} from "./content-tree";
export { CONTENT_CONTEXT_KEY, setContentContext, useContent, initializeContent } from "./context";

export type { DatabaseAdapter } from "@src/databases/db-interface";

export const contentSystemBase = {
  get version() {
    return contentStore.contentVersion;
  },
  get isInitialized() {
    return contentStore.initState === "initialized";
  },
  get initState() {
    return contentStore.initState;
  },
  get nodeCount() {
    return contentStore.nodeCount;
  },

  isInitializedForTenant(tenantId?: string | null): boolean {
    return contentStore.isInitializedForTenant(tenantId);
  },

  collections: {
    getSmartFirst: (tenantId?: string | null) => contentStore.getSmartFirstCollection(tenantId),
  },

  getCollections(tenantId?: string | null) {
    return contentStore.getAllCollections(tenantId);
  },

  getCollection(id: string, tenantId?: string | null) {
    return contentStore.getCollection(id, tenantId);
  },

  async getFirstCollectionRedirectUrl(
    lang: string = "en",
    tenantId?: string | null,
  ): Promise<string | null> {
    const first = contentStore.getSmartFirstCollection(tenantId);
    if (!first) return null;
    return getCollectionRedirectPathFromSchema(first, lang);
  },

  async getNavigationStructure(tenantId: string | null = null) {
    return contentNavigation.getNavigationStructure(tenantId);
  },

  get isReloading(): boolean {
    return contentStore.isReloading;
  },
  async waitForReload(): Promise<void> {
    return contentStore.waitForReload();
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
  getNode(id: string, _tenantId?: string | null) {
    return contentStore.getNode(id);
  },

  setContext(tenantId: string | null = null) {
    return setContentContext(tenantId);
  },
  getContext() {
    return useContent();
  },

  getNavigationStructureProgressive: (options: any) =>
    contentNavigation.getNavigationStructureProgressive(options),
  getNodeChildren: (nodeId: string, tenantId?: string | null) =>
    contentNavigation.getNodeChildren(nodeId, tenantId),
  getBreadcrumb: (path: string) => contentNavigation.getBreadcrumb(path),
  getHealthStatus: () => contentMetrics.getHealthStatus(),
  getMetrics: () => contentMetrics.getMetrics(),
  getCollectionStats: (id: string, tenantId?: string | null) =>
    contentStore.getCollectionStats(id, tenantId),
  getDiagnostics: () => contentMetrics.getHealthStatus(),
};

export const contentSystem = {
  ...contentSystemBase,

  async initialize(
    _tenantId: string | null = null,
    _force = false,
    _adapter?: unknown,
  ): Promise<void> {
    await initializeContent();
  },

  async refresh(
    _tenantId?: string | null,
    _skipReconciliation?: boolean,
    _incremental = false,
  ): Promise<void> {
    if (!isBrowser) {
      logger.warn("[contentSystem] refresh() called on server from wrong entry point");
      return;
    }
    try {
      const store = await import("@src/stores/collection-store.svelte");
      // Snapshot the structure revision BEFORE the request: a save/reorder that
      // lands while this is in flight makes the response an older snapshot, and
      // applying it would roll the UI back over the newer state.
      const revisionAtRequest = store.getStructureRevision();

      const res = await fetch("/api/content-structure?action=getStructure", {
        credentials: "include",
      });
      if (!res.ok) return;
      const json = await res.json();
      const nodes = json?.data?.contentNodes;
      if (Array.isArray(nodes)) {
        if (store.getStructureRevision() !== revisionAtRequest) {
          logger.debug("[contentSystem] Refresh response is stale — newer structure applied");
          return;
        }
        contentStore.sync(nodes);
        // Also sync the sidebar's collection store so the Collections tree
        // reflects SSE-driven updates without requiring a page navigation
        store.applyRemoteContentStructure(nodes);
      }
    } catch (err) {
      logger.warn("[contentSystem] Client refresh failed:", err);
    }
  },

  async generateApiSpec(_tenantId: string = "global", _force = false) {
    return null;
  },

  async reorderContentNodes(_items: any[], tenantId?: string | null) {
    if (isBrowser) return contentStore.getNodesForTenant(tenantId);
    return [];
  },
};
