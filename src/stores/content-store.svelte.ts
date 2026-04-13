/**
 * @file src/stores/content-store.svelte.ts
 * @description Reactive source of truth for the CMS content tree (collections + categories).
 * Optimized for Svelte 5 runes, performance, and multi-tenant safety.
 */

import type { ContentNode, Schema } from "@src/content/types";
import { browser } from "$app/environment";
import { logger } from "@utils/logger";
import { SvelteMap } from "svelte/reactivity";

class ContentStore {
  private static instance: ContentStore | null = null;

  // --- Reactive State ---
  nodeMap = $state(new SvelteMap<string, ContentNode>());
  pathMap = $state(new SvelteMap<string, string>()); // path → id
  version = $state(Date.now());
  state = $state<"uninitialized" | "initializing" | "initialized" | "error">("uninitialized");

  // Non-reactive internal state
  private currentVersion = 0;
  private pollingInterval: NodeJS.Timeout | null = null;
  private eventSource: EventSource | null = null;

  private constructor() {}

  static getInstance(): ContentStore {
    if (!ContentStore.instance) {
      ContentStore.instance = new ContentStore();
    }
    return ContentStore.instance;
  }

  // --- Derived Values ---
  sortedCollections = $derived.by(() => {
    const list: Schema[] = [];
    for (const node of this.nodeMap.values()) {
      if (node.nodeType === "collection" && node.collectionDef) {
        list.push(node.collectionDef);
      }
    }
    list.sort((a, b) => {
      const orderDiff = (a.order ?? 999) - (b.order ?? 999);
      return orderDiff !== 0 ? orderDiff : (a.path ?? "").localeCompare(b.path ?? "");
    });
    return list;
  });

  collectionCount = $derived.by(() => {
    let count = 0;
    for (const node of this.nodeMap.values()) {
      if (node.nodeType === "collection") count++;
    }
    return count;
  });

  isInitialized = $derived(this.state === "initialized");
  allNodes = $derived(Array.from(this.nodeMap.values()));

  get nodeCount() {
    return this.nodeMap.size;
  }

  // --- Core Methods ---
  getNode(id: string): ContentNode | undefined {
    return this.nodeMap.get(id);
  }

  getNodeByPath(path: string): ContentNode | undefined {
    const id = this.pathMap.get(path);
    return id ? this.nodeMap.get(id) : undefined;
  }

  getChildren(parentId: string | null = null, tenantId?: string | null): ContentNode[] {
    const children: ContentNode[] = [];
    const targetParent = parentId || null;

    for (const node of this.nodeMap.values()) {
      const pId = node.parentId || null;
      if (pId === targetParent && (!tenantId || node.tenantId === tenantId)) {
        children.push(node);
      }
    }
    return children;
  }

  getAllCollections(tenantId?: string | null): Schema[] {
    const collections = this.sortedCollections;
    if (!tenantId) return collections;
    return collections.filter((c) => !c.tenantId || c.tenantId === tenantId);
  }

  getCollection(identifier: string, tenantId?: string | null): Schema | null {
    // Fast path: direct ID lookup
    let node = this.getNode(identifier);

    if (!node) {
      // Try path variations
      const normalizedPath = identifier.startsWith("/") ? identifier : `/${identifier}`;
      node = this.getNodeByPath(normalizedPath);

      if (!node && normalizedPath.startsWith("/collection/")) {
        node = this.getNodeByPath(normalizedPath.replace("/collection", ""));
      }
    }

    // Fallback: search by collectionDef._id
    if (!node) {
      for (const n of this.nodeMap.values()) {
        if (n.collectionDef?._id === identifier) {
          node = n;
          break;
        }
      }
    }

    if (!node?.collectionDef) return null;

    // Tenant isolation
    if (tenantId && node.tenantId && node.tenantId !== tenantId) {
      return null;
    }

    return node.collectionDef;
  }

  getSmartFirstCollection(tenantId?: string | null): Schema | null {
    const collections = this.getAllCollections(tenantId);
    return collections[0] ?? null;
  }

  // --- Sync ---
  private lastSyncSignature = "";

  sync(nodes: ContentNode[]): void {
    if (!nodes.length) {
      this.nodeMap.clear();
      this.pathMap.clear();
      return;
    }

    // Fast structural change detection
    const signature = `${nodes.length}-${nodes[0]._id}`;
    if (signature === this.lastSyncSignature) return;
    this.lastSyncSignature = signature;

    this.nodeMap.clear();
    this.pathMap.clear();

    for (const rawNode of nodes) {
      const id = String(rawNode._id);
      this.nodeMap.set(id, rawNode);
      if (rawNode.path) this.pathMap.set(rawNode.path, id);
    }

    this.version = Date.now();
    this.state = "initialized";
  }

  // --- Live Sync (SSE + Polling fallback) ---
  startLiveSync(onUpdate: () => void): () => void {
    if (!browser) return () => {};

    const pathname = window.location?.pathname || "";
    if (
      /^\/(setup|login)/i.test(pathname) ||
      pathname.includes("/setup") ||
      pathname.includes("/login")
    ) {
      return () => {};
    }

    logger.debug("📡 Starting content live sync (SSE)");

    this.eventSource = new EventSource("/api/content/events");

    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.version && data.version > this.currentVersion) {
          this.currentVersion = data.version;
          onUpdate();
        }
      } catch (err) {
        logger.error("[SSE] Failed to parse update", err);
      }
    };

    this.eventSource.onerror = () => {
      logger.warn("[SSE] Connection lost — falling back to polling");
      this.eventSource?.close();
      this.startPolling(onUpdate);
    };

    return () => this.stopLiveSync();
  }

  private startPolling(onUpdate: () => void, intervalMs = 8000) {
    if (this.pollingInterval) return;

    const poll = async () => {
      try {
        const res = await fetch("/api/content/version");
        const { version } = await res.json();

        if (version > this.currentVersion) {
          this.currentVersion = version;
          onUpdate();
        }
      } catch (e) {
        logger.warn("Content version poll failed", e);
      }
    };

    poll();
    this.pollingInterval = setInterval(poll, intervalMs);
  }

  private stopLiveSync() {
    this.eventSource?.close();
    this.eventSource = null;
    this.stopPolling();
  }

  private stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  clear(): void {
    this.nodeMap.clear();
    this.pathMap.clear();
    this.version = Date.now();
    this.lastSyncSignature = "";
  }
}

const store = ContentStore.getInstance();

export const contentStore = {
  get contentVersion() {
    return store.version;
  },
  get initState() {
    return store.state;
  },
  set initState(v: any) {
    store.state = v;
  },

  get collectionCount() {
    return store.collectionCount;
  },
  get isInitialized() {
    return store.isInitialized;
  },
  get nodeCount() {
    return store.nodeCount;
  },
  get version() {
    return store.version;
  },

  getNode: (id: string) => store.getNode(id),
  getNodeByPath: (path: string) => store.getNodeByPath(path),
  getChildren: (parentId?: string | null, tenantId?: string | null) =>
    store.getChildren(parentId ?? null, tenantId),

  getAllCollections: (tenantId?: string | null) => store.getAllCollections(tenantId),
  getCollection: (id: string, tenantId?: string | null) => store.getCollection(id, tenantId),
  getSmartFirstCollection: (tenantId?: string | null) => store.getSmartFirstCollection(tenantId),

  getNodesEntries: () => store.nodeMap.entries(),
  getNodesForTenant: (tenantId?: string | null) => store.getChildren(null, tenantId),
  updateVersion: () => {
    store.version = Date.now();
  },

  getAllNodes: () => store.allNodes,
  sync: (nodes: ContentNode[]) => store.sync(nodes),
  startLiveSync: (onUpdate: () => void) => store.startLiveSync(onUpdate),
  clear: () => store.clear(),
};
