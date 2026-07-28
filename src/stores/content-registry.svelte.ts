/**
 * @file src/stores/content-registry.svelte.ts
 * @description Reactive registry of the content tree — ContentNode hierarchy and derived Schema catalog with HMR support.
 */

import type { ContentNode, Schema } from "@src/content/types";

// ✨ Absolute Global Singleton Pattern using 'process' to bypass bundler chunk isolation
const STORE_KEY = "__SVELTY_CONTENT_STORE_INSTANCE__";

export type ContentState = "uninitialized" | "initializing" | "initialized" | "error";

class ContentStore {
  private _collections = new Map<string, Schema[]>();
  private _nodes = new Map<string, ContentNode[]>();
  private _schemas = new Map<string, Schema>();
  private _allNodes = new Map<string, ContentNode>();

  #initState = $state<ContentState>("uninitialized");
  public contentVersion = $state(0);

  get initState(): ContentState {
    return this.#initState;
  }

  set initState(v: ContentState) {
    const wasReloading = this.#initState === "initializing";
    this.#initState = v;
    if (wasReloading && v !== "initializing") {
      this.#notifyReloadWaiters();
    }
  }

  constructor() {
    // No-op
  }

  get isInitialized(): boolean {
    return this.initState === "initialized";
  }

  get isReloading(): boolean {
    return this.initState === "initializing";
  }

  // Event-driven: waiting promises resolve when initState leaves "initializing"
  #reloadResolvers = new Set<() => void>();

  async waitForReload(): Promise<void> {
    if (!this.isReloading) return;
    return new Promise<void>((resolve) => {
      this.#reloadResolvers.add(resolve);
    });
  }

  /** @internal — called by initState setter to notify waiters */
  #notifyReloadWaiters(): void {
    for (const resolve of this.#reloadResolvers) resolve();
    this.#reloadResolvers.clear();
  }

  isInitializedForTenant(_tenantId?: string | null): boolean {
    return this.isInitialized;
  }

  get nodeCount(): number {
    return this._allNodes.size;
  }

  get collectionCount(): number {
    return this._schemas.size;
  }

  getCollections(tenantId?: string | null): Schema[] {
    const tid = tenantId || "global";
    const nodes = this._nodes.get(tid) || [];
    return nodes
      .filter((n) => n.nodeType === "collection" && n.collectionDef)
      .map((n) => n.collectionDef!);
  }

  getAllCollections(tenantId?: string | null): Schema[] {
    return this.getCollections(tenantId);
  }

  getCollection(id: string, _tenantId?: string | null): Schema | undefined {
    let schema = this._schemas.get(id);
    if (!schema) {
      const cleanId = id.replace(/^\/+/, "").toLowerCase();
      schema = Array.from(this._schemas.values()).find((s) => {
        const sId = ((s._id as string) || s.name || "").replace(/^\/+/, "").toLowerCase();
        const sPath = (s.path || "").replace(/^\/+/, "").toLowerCase();
        return (
          sId === cleanId ||
          sPath === cleanId ||
          sId === cleanId.replace(/^collection\//, "") ||
          sPath === cleanId.replace(/^collection\//, "")
        );
      });
    }
    return schema;
  }

  getSmartFirstCollection(_tenantId?: string | null): Schema | null {
    // Skip system-only collections (redirects, 404_logs, etc.) that are not user content
    const systemPrefixes = ["redirects", "404_logs", "plugin_", "workflow_"];
    for (const schema of this._schemas.values()) {
      const id = (schema._id || schema.name || "").toLowerCase();
      if (systemPrefixes.some((prefix) => id.startsWith(prefix))) continue;
      return schema;
    }
    // Fall back to first available if no user collection found
    return Array.from(this._schemas.values())[0] || null;
  }

  setCollections(tenantId: string, collections: Schema[]) {
    this._collections.set(tenantId, collections);
    for (const schema of collections) {
      if (schema._id) this._schemas.set(schema._id as string, schema);
    }
    this.updateVersion();
  }

  getNodes(tenantId: string = "global"): ContentNode[] {
    return this._nodes.get(tenantId) || [];
  }

  getAllNodes(): ContentNode[] {
    return Array.from(this._allNodes.values());
  }

  getNodesForTenant(tenantId?: string | null): ContentNode[] {
    const tid = tenantId || "global";
    return this._nodes.get(tid) || [];
  }

  getNode(id: string): ContentNode | undefined {
    return this._allNodes.get(id);
  }

  getChildren(parentId: string | null = null, tenantId?: string | null): ContentNode[] {
    const nodes = this.getNodesForTenant(tenantId);
    return nodes.filter((n) => n.parentId === parentId);
  }

  getNodeByPath(path: string): ContentNode | undefined {
    return Array.from(this._allNodes.values()).find((n) => n.path === path);
  }

  setNodes(tenantId: string, nodes: ContentNode[]) {
    this._nodes.set(tenantId, nodes);
    for (const node of nodes) {
      if (node._id) this._allNodes.set(node._id as string, node);
    }
    this.updateVersion();
  }

  getNodesEntries(): [string, ContentNode][] {
    return Array.from(this._allNodes.entries());
  }

  getSchema(schemaId: string): Schema | undefined {
    let schema = this._schemas.get(schemaId);
    if (!schema) {
      const lowerId = schemaId.toLowerCase();
      schema = Array.from(this._schemas.values()).find(
        (s) =>
          (s._id as string)?.toLowerCase() === lowerId ||
          s.name?.toLowerCase() === lowerId ||
          s.path?.toLowerCase() === lowerId,
      );
    }
    return schema;
  }

  sync(nodes: ContentNode[]) {
    for (const node of nodes) {
      this._upsertInternal(node);
    }
    this.updateVersion();
  }

  /**
   * Batch upsert — single version bump for N nodes.
   * Use instead of calling upsert() in a loop to avoid reactive churn.
   */
  batchUpsert(nodes: ContentNode[]) {
    for (const node of nodes) {
      this._upsertInternal(node);
    }
    this.updateVersion();
  }

  /**
   * Internal upsert without version bump — for use by sync/batchUpsert.
   */
  private _upsertInternal(node: ContentNode) {
    if (!node._id) return;
    const nodeId = node._id as string;
    const tid = node.tenantId || "global";

    // 1. Update global map
    this._allNodes.set(nodeId, node);

    // 2. Update tenant-specific nodes array
    let tNodes = this._nodes.get(tid) || [];
    const nodeIndex = tNodes.findIndex((n) => n._id === node._id);
    if (nodeIndex !== -1) {
      tNodes[nodeIndex] = node;
    } else {
      tNodes.push(node);
    }
    this._nodes.set(tid, tNodes);

    // 3. Update collections/schemas if it's a collection
    if (node.nodeType === "collection") {
      const schema = node.collectionDef;
      if (schema) {
        if (node.path) schema.path = node.path;
        const schemaId = (schema._id || node._id) as string;

        this._schemas.set(schemaId, schema);

        let tCollections = this._collections.get(tid) || [];
        const colIndex = tCollections.findIndex((c) => c._id === schemaId);
        if (colIndex !== -1) {
          tCollections[colIndex] = schema;
        } else {
          tCollections.push(schema);
        }
        this._collections.set(tid, tCollections);
      }
    }

    // No version bump here — callers (upsert, batchUpsert, sync) handle it
  }

  /**
   * Surgical update/insert for a single content node (with version bump).
   * Prefer batchUpsert() for bulk operations.
   */
  upsert(node: ContentNode) {
    this._upsertInternal(node);
    this.updateVersion();
  }

  updateVersion() {
    this.contentVersion++;
  }

  getCollectionStats(id: string, tenantId?: string | null) {
    const col = this.getCollection(id, tenantId);
    if (!col) return null;
    return {
      _id: col._id,
      name: col.name,
      icon: col.icon || "mdi:folder",
      path: col.path || `/collection/${col.name}`,
      fieldCount: (col.fields || []).length,
      hasRevisions: col.revision || false,
      hasLivePreview: !!col.livePreview,
      status: col.status || "active",
    };
  }

  clear(tenantId?: string) {
    if (tenantId) {
      this._collections.delete(tenantId);
      this._nodes.delete(tenantId);
      // Remove from allNodes too
      for (const [id, node] of this._allNodes.entries()) {
        if (node.tenantId === tenantId) this._allNodes.delete(id);
      }
    } else {
      this._collections.clear();
      this._nodes.clear();
      this._schemas.clear();
      this._allNodes.clear();
    }
    this.updateVersion();
  }
}

// Global Singleton logic
let instance: ContentStore;

const globalTarget = globalThis as any;
if (!globalTarget[STORE_KEY]) {
  globalTarget[STORE_KEY] = new ContentStore();
}
instance = globalTarget[STORE_KEY];

export const contentStore = instance;
