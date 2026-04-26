/**
 * @file src/content/index.ts
 * @description Single Entry Point and Public API Facade for the SveltyCMS Content System.
 * 🛡️ SECURITY: This file is a browser-safe facade. All server-side logic is delegated
 * to init.server.ts to prevent sensitive module leakage into the client bundle.
 */
import { setContext, getContext } from "svelte";
import { browser as isBrowser } from "$app/environment";
import { contentStore } from "@stores/content-store.svelte";
import { contentNavigation, contentMetrics } from "./content-utils";
import type { ContentNodeOperation } from "./types";
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

/**
 * Central orchestrator for the SveltyCMS Content System.
 */
// --- SERVER MODULE CACHE (Internal) ---
let _serverContent: any = null;
async function resolveServerContent() {
  if (isBrowser) throw new Error("Server-only operation called in browser");
  if (!_serverContent) {
    const { getServerContentService } = await import("./init.server");
    _serverContent = await getServerContentService();
  }
  return _serverContent;
}

export const contentSystem = {
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

  // --- Lifecycle ---
  async initialize(
    tenantId: string | null = null,
    options: any = {},
    adapter?: DatabaseAdapter,
  ): Promise<void> {
    if (isBrowser) {
      if (contentStore.initState === "uninitialized") contentStore.initState = "initialized";
      const { contentLiveSync } = await import("./content-sse.svelte");
      contentLiveSync.start();
      return;
    }
    // 🛡️ SECURITY: Delegating server init to a .server module prevents bundler leak.
    const { initializeServerContent } = await import("./init.server");
    return initializeServerContent(tenantId, options, adapter);
  },

  async refresh(
    tenantId?: string | null,
    skipReconciliation?: boolean,
    incremental = false,
    adapter?: DatabaseAdapter,
  ) {
    if (isBrowser) return;
    const { initializeServerContent } = await import("./init.server");
    return initializeServerContent(tenantId, { skipReconciliation, incremental }, adapter);
  },

  /**
   * Generates the OpenAPI specification for a tenant.
   */
  async generateApiSpec(tenantId: string = "global", force = false) {
    if (isBrowser) return null;
    const { generateServerApiSpec } = await import("./init.server");
    return generateServerApiSpec(tenantId, force);
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

  // --- CRUD Pass-throughs (Server-Only) ---
  async find(collection: string, query: any, options?: any) {
    const content = await resolveServerContent();
    return content.find(collection, query, options);
  },
  async findOne(collection: string, query: any, options?: any) {
    const content = await resolveServerContent();
    return content.findOne(collection, query, options);
  },
  async insert(collection: string, data: any, options?: any) {
    const content = await resolveServerContent();
    return content.insert(collection, data, options);
  },
  async update(collection: string, query: any, data: any, options?: any) {
    const content = await resolveServerContent();
    return content.update(collection, query, data, options);
  },
  async delete(collection: string, query: any, options?: any) {
    const content = await resolveServerContent();
    return content.delete(collection, query, options);
  },

  // --- Node Operations ---
  async getNavigationStructure(tenantId: string | null = null) {
    return contentNavigation.getNavigationStructure(tenantId);
  },
  async getContentStructureFromDatabase(
    format: "flat" | "tree" = "tree",
    tenantId?: string | null,
  ): Promise<any[]> {
    if (isBrowser) return [];
    const content = await resolveServerContent();
    return content.getContentStructureFromDatabase(format, tenantId);
  },
  async reorderContentNodes(items: any[], tenantId?: string | null): Promise<any[]> {
    if (isBrowser) return contentStore.getNodesForTenant(tenantId);
    const content = await resolveServerContent();
    await content.reorderNodes(items, tenantId);
    contentStore.updateVersion();
    return contentStore.getNodesForTenant(tenantId);
  },
  async upsertContentNodes(operations: ContentNodeOperation[], tenantId?: string | null) {
    if (isBrowser) return;
    const content = await resolveServerContent();
    return content.upsertContentNodes(operations, tenantId);
  },
  async search(query: string, options?: any) {
    if (isBrowser) return { success: true, data: [] };
    const content = await resolveServerContent();
    return content.search(query, options);
  },
  async scanForCollections() {
    if (isBrowser) return [];
    const content = await resolveServerContent();
    return content.scanCompiledCollections();
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

// --- BACKWARD COMPATIBILITY ALIASES ---
export const setContentContext = (tenantId: string | null = null) =>
  contentSystem.setContext(tenantId);
export const useContent = () => contentSystem.getContext();

/**
 * Public initialization helper.
 */
export async function initializeContent(pageData?: any) {
  if (pageData?.contentNodes) contentStore.sync(pageData.contentNodes);
  await contentSystem.initialize(pageData?.tenantId, { skipReconciliation: true });
}
