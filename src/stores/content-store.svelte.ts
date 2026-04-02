/**
 * @file src/stores/content-store.svelte.ts
 * @description
 * Single Reactive Store for the SveltyCMS Content System.
 * Replaces content-structure, content-collections, and content-polling.
 * Uses Svelte 5 runes for tree-shakable reactivity.
 */
import type { ContentNode, Schema } from "@src/content/types";
import { browser } from "$app/environment";
import { logger } from "@utils/logger";
import { SvelteMap } from "svelte/reactivity";

/**
 * Reactive store for the entire content structure.
 * Using a class-based singleton for Svelte 5 rune compatibility and testing stability.
 */
class ContentStore {
  private static instance: ContentStore | null = null;

  // --- STATE ---
  nodeMap = $state(new SvelteMap<string, ContentNode>());
  pathMap = $state(new SvelteMap<string, string>());
  version = $state(Date.now());
  state = $state<"uninitialized" | "initializing" | "initialized" | "error">("uninitialized");
  currentPollingVersion = $state(0);

  // --- POLLING STATE (Non-reactive) ---
  private pollingInterval: NodeJS.Timeout | null = null;

  private constructor() {}

  public static getInstance(): ContentStore {
    if (!ContentStore.instance) {
      ContentStore.instance = new ContentStore();
    }
    return ContentStore.instance;
  }

  // --- DERIVED ---
  sortedCollections = $derived.by(() => {
    void this.version; // Trigger dependency

    const list: Schema[] = [];
    for (const node of this.nodeMap.values()) {
      if (node.nodeType === "collection" && node.collectionDef) {
        list.push(node.collectionDef);
      }
    }

    list.sort((a, b) => {
      const orderDiff = (a.order ?? 999) - (b.order ?? 999);
      if (orderDiff !== 0) return orderDiff;
      return (a.path || "").localeCompare(b.path || "");
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
  contentNodes = $derived(Array.from(this.nodeMap.values()));

  // --- GETTERS ---
  get nodeCount() {
    return this.nodeMap.size;
  }

  // --- METHODS ---
  getNode(id: string) {
    return this.nodeMap.get(id);
  }

  getNodeByPath(path: string) {
    const id = this.pathMap.get(path);
    return id ? this.nodeMap.get(id) : undefined;
  }

  getChildren(parentId: string | null = null, tenantId?: string | null) {
    const children: ContentNode[] = [];
    for (const node of this.nodeMap.values()) {
      const nodeParentId = node.parentId || null;
      if (nodeParentId === parentId && (!tenantId || node.tenantId === tenantId)) {
        children.push(node);
      }
    }
    return children;
  }

  getAllCollections(tenantId?: string | null): Schema[] {
    const all = this.sortedCollections;
    if (!tenantId) return all;
    return all.filter((c) => !c.tenantId || c.tenantId === tenantId);
  }

  getCollection(identifier: string, tenantId?: string | null): Schema | null {
    let node = this.getNode(identifier);
    if (!node) {
      const path = identifier.startsWith("/") ? identifier : `/${identifier}`;
      node = this.getNodeByPath(path);
      if (!node) {
        node = path.startsWith("/collection/")
          ? this.getNodeByPath(path.replace("/collection", ""))
          : this.getNodeByPath(`/collection${path}`);
      }
    }
    if (!node) {
      const lowerId = identifier.toLowerCase();
      const lowerWithSlash = lowerId.startsWith("/") ? lowerId : `/${lowerId}`;
      for (const [pathKey, idValue] of this.pathMap.entries()) {
        if (pathKey.toLowerCase() === lowerId || pathKey.toLowerCase() === lowerWithSlash) {
          node = this.getNode(idValue);
          break;
        }
      }
    }
    if (!node) {
      for (const contentNode of this.nodeMap.values()) {
        if (contentNode.collectionDef?._id === identifier) {
          node = contentNode;
          break;
        }
      }
    }

    if (node?.collectionDef && tenantId && node.tenantId && node.tenantId !== tenantId) {
      return null;
    }
    return node?.collectionDef ?? null;
  }

  getSmartFirstCollection(tenantId?: string | null): Schema | null {
    const collections = this.getAllCollections(tenantId);
    return collections[0] || null;
  }

  getNodesForTenant(tenantId?: string | null): ContentNode[] {
    if (!tenantId) return Array.from(this.nodeMap.values());
    const results: ContentNode[] = [];
    for (const node of this.nodeMap.values()) {
      if (!node.tenantId || node.tenantId === tenantId) {
        results.push(node);
      }
    }
    return results;
  }

  getNodesEntries() {
    return Array.from(this.nodeMap.entries());
  }

  sync(nodes: ContentNode[]) {
    this.nodeMap.clear();
    this.pathMap.clear();
    for (const node of nodes) {
      this.nodeMap.set(node._id, node);
      if (node.path) this.pathMap.set(node.path, node._id);
    }
    this.version = Date.now();
    this.state = "initialized";
  }

  startLiveSync(onUpdate: () => void) {
    if (!browser) return;
    const pathname = window.location.pathname;
    const isRestricted =
      /^\/([a-z]{2,5}(-[a-zA-Z]+)?\/)?(setup|login)/i.test(pathname) ||
      pathname.includes("/setup") ||
      pathname.includes("/login");

    if (isRestricted) return;

    logger.info("📡 Initializing Real-time Content Sync (SSE)");
    const eventSource = new EventSource("/api/content/events");

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.version && data.version > this.currentPollingVersion) {
          this.currentPollingVersion = data.version;
          onUpdate();
        }
      } catch (err) {
        logger.error("[SSE] Failed to parse event data", err);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      this.startPolling(onUpdate);
    };

    return () => eventSource.close();
  }

  startPolling(onNewVersion: () => void, intervalMs = 10000) {
    if (!browser || this.pollingInterval) return;
    const checkVersion = async () => {
      try {
        const response = await fetch("/api/content/version");
        const data = await response.json();
        if (this.currentPollingVersion !== 0 && data.version > this.currentPollingVersion) {
          this.currentPollingVersion = data.version;
          onNewVersion();
        } else {
          this.currentPollingVersion = data.version;
        }
      } catch (error) {
        logger.warn("Failed to poll content version", error);
      }
    };
    checkVersion();
    this.pollingInterval = setInterval(checkVersion, intervalMs);
  }

  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }
}

// Global instance getter
const getStore = () => ContentStore.getInstance();

/**
 * Pure reactive store for the entire content structure.
 */
export const contentStore = {
  get contentVersion() {
    return getStore().version;
  },
  get initState() {
    return getStore().state;
  },
  set initState(value) {
    getStore().state = value;
  },
  get collectionCount() {
    return getStore().collectionCount;
  },
  get isInitialized() {
    return getStore().isInitialized;
  },
  get nodeCount() {
    return getStore().nodeCount;
  },
  get pollingVersion() {
    return getStore().currentPollingVersion;
  },

  getNode: (id: string) => getStore().getNode(id),
  getNodeByPath: (path: string) => getStore().getNodeByPath(path),
  getChildren: (pId: string | null = null, tId?: string | null) => getStore().getChildren(pId, tId),
  getAllCollections: (tId?: string | null) => getStore().getAllCollections(tId),
  getCollection: (id: string, tId?: string | null) => getStore().getCollection(id, tId),
  sync: (nodes: ContentNode[]) => getStore().sync(nodes),
  startLiveSync: (cb: () => void) => getStore().startLiveSync(cb),
  stopPolling: () => getStore().stopPolling(),
  getNodesEntries: () => getStore().getNodesEntries(),
  getSmartFirstCollection: (tId?: string | null) => getStore().getSmartFirstCollection(tId),
  getNodesForTenant: (tId?: string | null) => getStore().getNodesForTenant(tId),

  // Minimal set for compatibility - others can be added as needed
  clear: () => {
    getStore().nodeMap.clear();
    getStore().pathMap.clear();
    getStore().version = Date.now();
  },
  updateVersion: () => {
    getStore().version = Date.now();
  },
  getAllNodes: () => Array.from(getStore().nodeMap.values()),
};
