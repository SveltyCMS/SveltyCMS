/**
 * @file src/stores/content-store.svelte.ts
 * @description Central store for managing compiled content types and schemas with HMR support.
 */

import type { ContentNode, Schema } from "@src/content/types";
const browser = typeof window !== "undefined";

// ✨ Absolute Global Singleton Pattern using 'process' to bypass bundler chunk isolation
const STORE_KEY = "__SVELTY_CONTENT_STORE_INSTANCE__";

export type ContentState = "uninitialized" | "initializing" | "initialized" | "error";

class ContentStore {
  private _collections = new Map<string, Schema[]>();
  private _nodes = new Map<string, ContentNode[]>();
  private _schemas = new Map<string, Schema>();
  private _allNodes = new Map<string, ContentNode>();

  public initState: ContentState = "uninitialized";
  public contentVersion: number = 0;

  constructor() {
    console.debug(
      `[ContentStore] New instance created: ${Math.random().toString(36).substring(7)}`,
    );
  }

  get isInitialized(): boolean {
    return this.initState === "initialized";
  }

  get nodeCount(): number {
    return this._allNodes.size;
  }

  get collectionCount(): number {
    return this._schemas.size;
  }

  getCollections(tenantId?: string | null): Schema[] {
    const tid = tenantId || "global";
    return this._collections.get(tid) || [];
  }

  getAllCollections(tenantId?: string | null): Schema[] {
    return this.getCollections(tenantId);
  }

  getCollection(id: string, _tenantId?: string | null): Schema | undefined {
    return this._schemas.get(id);
  }

  getSmartFirstCollection(_tenantId?: string | null): Schema | null {
    const first = Array.from(this._schemas.values())[0];
    return first || null;
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
    return this._schemas.get(schemaId);
  }

  sync(nodes: ContentNode[]) {
    for (const node of nodes) {
      if (node._id) {
        this._allNodes.set(node._id as string, node);
        const tid = node.tenantId || "global";
        const tNodes = this._nodes.get(tid) || [];
        if (!tNodes.find((n) => n._id === node._id)) {
          tNodes.push(node);
          this._nodes.set(tid, tNodes);
        }
      }
    }
    this.updateVersion();
  }

  updateVersion() {
    this.contentVersion++;
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

if (browser) {
  const win = window as any;
  if (!win[STORE_KEY]) win[STORE_KEY] = new ContentStore();
  instance = win[STORE_KEY];
} else {
  const proc = process as any;
  if (!proc[STORE_KEY]) proc[STORE_KEY] = new ContentStore();
  instance = proc[STORE_KEY];
}

export const contentStore = instance;
