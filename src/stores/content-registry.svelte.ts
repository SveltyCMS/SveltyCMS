/**
 * @file src/stores/content-registry.svelte.ts
 * @description Reactive registry of the content tree — ContentNode hierarchy and derived Schema catalog with HMR support.
 */

import {
  getFirstCollectionSchema,
  getSchemaKey,
  getSchemaPath,
} from "@src/content/first-collection";
import type { ContentNode, Schema } from "@src/content/types";
import { deepClone } from "@utils/native-utils";

// ✨ Absolute Global Singleton Pattern using 'process' to bypass bundler chunk isolation
const STORE_KEY = "__SVELTY_CONTENT_STORE_INSTANCE__";

export type ContentState = "uninitialized" | "initializing" | "initialized" | "error";

class ContentStore {
  private _collections = new Map<string, Schema[]>();
  private _nodes = new Map<string, ContentNode[]>();
  private _schemas = new Map<string, Schema>();
  private _allNodes = new Map<string, ContentNode>();
  /** O(1) path → node id (invalidated with clear/upsert). */
  private _pathIndex = new Map<string, string>();
  /** O(1) lowercased schema id/name → schema id. */
  private _schemaAliasIndex = new Map<string, string>();
  /** Fast-path cached sanitized client nodes per tenant. */
  private _clientNodesCache = new Map<string, ContentNode[]>();
  /** Memoized first-collection per tenant, invalidated on contentVersion bump. */
  private _firstCollectionMemo = new Map<string, { version: number; schema: Schema | null }>();
  /** Tenants that completed content initialization, including empty tenants. */
  private _initializedTenants = new Set<string>();

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

  private _tenantKey(tenantId?: string | null): string {
    return tenantId || "global";
  }

  isInitializedForTenant(_tenantId?: string | null): boolean {
    return this.isInitialized;
  }

  markInitializedForTenant(tenantId?: string | null): void {
    this._initializedTenants.add(this._tenantKey(tenantId));
  }

  get nodeCount(): number {
    return this._allNodes.size;
  }

  get collectionCount(): number {
    return this._schemas.size;
  }

  getCollections(tenantId?: string | null): Schema[] {
    const tid = this._tenantKey(tenantId);
    const nodes = this._nodes.get(tid) || [];
    const fromNodes = nodes
      .filter((n) => n.nodeType === "collection" && n.collectionDef)
      .map((n) => n.collectionDef!);
    if (fromNodes.length > 0) return fromNodes;
    const explicit = this._collections.get(tid);
    if (explicit && explicit.length > 0) return explicit;
    if (tid === "global") return Array.from(this._schemas.values());
    return [];
  }

  getAllCollections(tenantId?: string | null): Schema[] {
    return this.getCollections(tenantId);
  }

  getCollection(id: string, tenantId?: string | null): Schema | undefined {
    const found = this._findCollectionInList(this.getCollections(tenantId), id);
    if (found) return found;

    let schema = this._schemas.get(id);
    if (schema) return schema;

    const cleanId = id.replace(/^\/+/, "").toLowerCase();
    const stripped = cleanId.replace(/^collection\//, "");
    const normalized = stripped.replace(/[-_]/g, "");
    const aliasId =
      this._schemaAliasIndex.get(cleanId) ||
      this._schemaAliasIndex.get(stripped) ||
      this._schemaAliasIndex.get(id.toLowerCase()) ||
      this._schemaAliasIndex.get(normalized);
    if (aliasId) {
      schema = this._schemas.get(aliasId);
      if (schema) return schema;
    }

    // Slow fallback + self-heal index (legacy / partial indexes)
    schema = Array.from(this._schemas.values()).find((s) => {
      const sId = ((s._id as string) || s.name || "").replace(/^\/+/, "").toLowerCase();
      const sPath = (s.path || "").replace(/^\/+/, "").toLowerCase();
      const sPathStripped = sPath.replace(/^collection\//, "");
      const sName = String(s.name || "").toLowerCase();
      const sSlug = String((s as { slug?: string }).slug || "").toLowerCase();
      return (
        sId === cleanId ||
        sId === stripped ||
        sId.replace(/[-_]/g, "") === normalized ||
        sPath === cleanId ||
        sPath === stripped ||
        sPathStripped === cleanId ||
        sPathStripped === stripped ||
        sPathStripped.replace(/[-_]/g, "") === normalized ||
        sName === cleanId ||
        sName === stripped ||
        sName.replace(/[-_]/g, "") === normalized ||
        sSlug === cleanId ||
        sSlug === stripped ||
        sSlug.replace(/[-_]/g, "") === normalized
      );
    });
    if (schema?._id) {
      this._indexSchemaAliases(schema);
    }
    return schema;
  }

  getSmartFirstCollection(tenantId?: string | null): Schema | null {
    const key = this._tenantKey(tenantId);
    const memo = this._firstCollectionMemo.get(key);
    if (memo && memo.version === this.contentVersion) return memo.schema;
    const collections = this.getCollections(tenantId);
    const schema = getFirstCollectionSchema(collections) || collections[0] || null;
    this._firstCollectionMemo.set(key, { version: this.contentVersion, schema });
    return schema;
  }

  setCollections(tenantId: string, collections: Schema[]) {
    this._collections.set(tenantId, collections);
    if (this._tenantKey(tenantId) === "global") {
      for (const schema of collections) {
        if (schema._id) {
          this._schemas.set(schema._id as string, schema);
          this._indexSchemaAliases(schema);
        }
      }
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

  /**
   * Fast-path sanitized client nodes (strips non-serializable function props
   * and caches the resulting structure until the next store mutation).
   */
  getClientNodes(tenantId?: string | null): ContentNode[] {
    const tid = tenantId || "global";
    const cached = this._clientNodesCache.get(tid);
    if (cached) return cached;

    const nodes = this.getNodesForTenant(tenantId);
    if (nodes.length === 0) return [];

    try {
      const sanitized = deepClone(nodes) as ContentNode[];
      this._clientNodesCache.set(tid, sanitized);
      return sanitized;
    } catch {
      return nodes;
    }
  }

  getNode(id: string): ContentNode | undefined {
    return this._allNodes.get(id);
  }

  getChildren(parentId: string | null = null, tenantId?: string | null): ContentNode[] {
    const nodes = this.getNodesForTenant(tenantId);
    return nodes.filter((n) => n.parentId === parentId);
  }

  getNodeByPath(path: string): ContentNode | undefined {
    const indexed = this._pathIndex.get(path);
    if (indexed) {
      const node = this._allNodes.get(indexed);
      if (node) return node;
    }
    const found = Array.from(this._allNodes.values()).find((n) => n.path === path);
    if (found?._id && found.path) {
      this._pathIndex.set(found.path, found._id as string);
    }
    return found;
  }

  setNodes(tenantId: string, nodes: ContentNode[]) {
    this._nodes.set(tenantId, nodes);
    for (const node of nodes) {
      if (node._id) {
        this._allNodes.set(node._id as string, node);
        if (node.path) this._pathIndex.set(node.path, node._id as string);
        if (node.collectionDef) this._indexSchemaAliases(node.collectionDef);
      }
    }
    this.updateVersion();
  }

  getNodesEntries(): [string, ContentNode][] {
    return Array.from(this._allNodes.entries());
  }

  getSchema(schemaId: string): Schema | undefined {
    let schema = this._schemas.get(schemaId);
    if (schema) return schema;

    const lowerId = schemaId.toLowerCase();
    const aliasId = this._schemaAliasIndex.get(lowerId);
    if (aliasId) {
      schema = this._schemas.get(aliasId);
      if (schema) return schema;
    }

    schema = Array.from(this._schemas.values()).find(
      (s) =>
        (s._id as string)?.toLowerCase() === lowerId ||
        s.name?.toLowerCase() === lowerId ||
        s.path?.toLowerCase() === lowerId,
    );
    if (schema) this._indexSchemaAliases(schema);
    return schema;
  }

  private _indexSchemaAliases(schema: Schema): void {
    const schemaId = (schema._id || schema.name || "") as string;
    if (!schemaId) return;
    this._schemaAliasIndex.set(schemaId.toLowerCase(), schemaId);
    if (schema.name) this._schemaAliasIndex.set(String(schema.name).toLowerCase(), schemaId);
    if (schema.path) {
      const p = schema.path.replace(/^\/+/, "").toLowerCase();
      this._schemaAliasIndex.set(p, schemaId);
      this._schemaAliasIndex.set(p.replace(/^collection\//, ""), schemaId);
    }
    const slug = (schema as { slug?: string }).slug;
    if (slug) this._schemaAliasIndex.set(String(slug).toLowerCase(), schemaId);
  }

  private _findCollectionInList(collections: Schema[], id: string): Schema | undefined {
    const cleanId = id.replace(/^\/+/, "").toLowerCase();
    const stripped = cleanId.replace(/^collection\//, "");
    const normalized = stripped.replace(/[-_]/g, "");
    return collections.find((schema) => {
      const schemaId = getSchemaKey(schema);
      const name = String(schema.name || "").toLowerCase();
      const path = (schema.path || "").replace(/^\/+/, "").toLowerCase();
      const pathStripped = path.replace(/^collection\//, "");
      const slug = String((schema as { slug?: string }).slug || "").toLowerCase();
      return (
        schemaId === cleanId ||
        schemaId === stripped ||
        schemaId.replace(/[-_]/g, "") === normalized ||
        name === cleanId ||
        name === stripped ||
        name.replace(/[-_]/g, "") === normalized ||
        path === cleanId ||
        path === stripped ||
        pathStripped === cleanId ||
        pathStripped === stripped ||
        pathStripped.replace(/[-_]/g, "") === normalized ||
        slug === cleanId ||
        slug === stripped ||
        slug.replace(/[-_]/g, "") === normalized
      );
    });
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

    // Drop stale path index when path changes
    const prev = this._allNodes.get(nodeId);
    if (prev?.path && prev.path !== node.path) {
      this._pathIndex.delete(prev.path);
    }

    // 1. Update global map
    this._allNodes.set(nodeId, node);
    if (node.path) this._pathIndex.set(node.path, nodeId);

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
        // Keep collection icon in sync with content-node (presets / builder define it on either)
        if (!schema.icon && node.icon) {
          schema.icon = node.icon;
        } else if (schema.icon && !node.icon) {
          node.icon = schema.icon;
        }
        const schemaId = (schema._id || node._id) as string;

        if (tid === "global") {
          this._schemas.set(schemaId, schema);
          this._indexSchemaAliases(schema);
        }

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
    this._clientNodesCache.clear();
    this._firstCollectionMemo.clear();
    this.contentVersion++;
  }

  getCollectionStats(id: string, tenantId?: string | null) {
    const col = this.getCollection(id, tenantId);
    if (!col) return null;
    return {
      _id: col._id,
      name: col.name,
      icon: col.icon || "mdi:folder",
      path: getSchemaPath(col as any),
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
      this._clientNodesCache.delete(tenantId);
      // Remove from allNodes + indexes
      for (const [id, node] of this._allNodes.entries()) {
        if (node.tenantId === tenantId) {
          this._allNodes.delete(id);
          if (node.path) this._pathIndex.delete(node.path);
          if (node.collectionDef?._id) {
            const sid = String(node.collectionDef._id);
            this._schemas.delete(sid);
            this._schemaAliasIndex.delete(sid.toLowerCase());
          }
        }
      }
    } else {
      this._collections.clear();
      this._nodes.clear();
      this._schemas.clear();
      this._allNodes.clear();
      this._pathIndex.clear();
      this._schemaAliasIndex.clear();
      this._initializedTenants.clear();
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
