/**
 * @file src/content/core.ts
 * @description Core base for the SveltyCMS Content System.
 * Contains shared reactive state and browser-safe logic.
 */
import { setContext, getContext } from "svelte";
import { contentStore } from "@stores/content-store.svelte";
import { contentNavigation, contentMetrics } from "./content-utils";

// --- CONTEXT ---
export const CONTENT_CONTEXT_KEY = Symbol("content-context");

/**
 * Base reactive state and shared logic for the Content System.
 */
export const contentSystemBase = {
  // --- Reactive State ---
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

  /**
   * Checks if the content system is initialized for a specific tenant.
   */
  isInitializedForTenant(tenantId?: string | null): boolean {
    return contentStore.isInitializedForTenant(tenantId);
  },

  // --- Public Content API ---
  collections: {
    getAll: (tenantId?: string | null) => contentStore.getAllCollections(tenantId),
    get: (id: string, tenantId?: string | null) => contentStore.getCollection(id, tenantId),
    getSmartFirst: (tenantId?: string | null) => contentStore.getSmartFirstCollection(tenantId),
  },

  getCollections(tenantId?: string | null) {
    return contentStore.getAllCollections(tenantId);
  },

  getCollectionById(id: string, tenantId?: string | null) {
    return contentStore.getCollection(id, tenantId);
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
    const pathValue = first.path || `/collection/${first._id}`;
    return `/${lang}${pathValue.startsWith("/") ? pathValue : `/${pathValue}`}`;
  },

  // --- Node Operations (Browser-Safe Parts) ---
  async getNavigationStructure(tenantId: string | null = null) {
    return contentNavigation.getNavigationStructure(tenantId);
  },

  // --- Reloading State ---
  get isReloading(): boolean {
    return contentStore.isReloading;
  },
  async waitForReload(): Promise<void> {
    return contentStore.waitForReload();
  },

  // --- Shared Logic ---
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

  // --- Context ---
  setContext(tenantId: string | null = null) {
    const ctx = { tenantId, version: this.version };
    setContext(CONTENT_CONTEXT_KEY, ctx);
    return ctx;
  },
  getContext() {
    return getContext(CONTENT_CONTEXT_KEY) as { tenantId: string | null; version: number };
  },

  // --- Delegated APIs ---
  getNavigationStructureProgressive: (options: any) =>
    contentNavigation.getNavigationStructureProgressive(options),
  getNodeChildren: (nodeId: string, tenantId?: string | null) =>
    contentNavigation.getNodeChildren(nodeId, tenantId),
  getBreadcrumb: (path: string) => contentNavigation.getBreadcrumb(path),
  getHealthStatus: () => contentMetrics.getHealthStatus(),
  getMetrics: () => contentMetrics.getMetrics(),
  getCollectionStats: (id: string, tenantId?: string | null) =>
    contentStore.getCollectionStats(id, tenantId),
  getDiagnostics: () => contentMetrics.getHealthStatus(), // Alias for deprecated diagnostic call
};
