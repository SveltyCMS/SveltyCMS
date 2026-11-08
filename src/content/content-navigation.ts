/**
 * @file src/content/content-navigation.ts
 * @description
 * Navigation tree assembly and runtime metrics for the content system.
 *
 * ### Features:
 * - Nested / flat navigation trees with tenant filtering
 * - Progressive (depth-limited) tree loading for SSR payloads
 * - L1 in-memory cache plus a server-registered L2 cache seam
 * - Breadcrumb, descendants, and children lookups
 * - Health and performance metrics over the content registry
 *
 * Server consumers may import this module directly; client code must not — it
 * carries the navigation surface that only SSR and API handlers need.
 */
import { logger } from "@utils/logger";
import { contentStore } from "@stores/content-registry.svelte";
import type { ContentNode, NavigationNode } from "./types";
import { sortContentNodes } from "./content-tree";

/**
 * Server-only navigation cache hook.
 *
 * This module is browser-safe by construction (no database/cache imports), so
 * the server entry (`content/index.server.ts`) registers the real L2 provider
 * here at boot; the client simply has no provider and skips L2.
 */
export interface NavigationCacheProvider {
  get(key: string, tenantId: string | null): Promise<NavigationNode[] | null>;
  set(key: string, value: NavigationNode[], tenantId: string | null): Promise<void>;
}

let navigationCacheProvider: NavigationCacheProvider | null = null;

export function setNavigationCacheProvider(provider: NavigationCacheProvider | null): void {
  navigationCacheProvider = provider;
}

// In-memory L1 navigation tree cache keyed by `${tenantId || "global"}`
let _lastNavCacheVersion = -1;
const _navL1Cache = new Map<string, NavigationNode[]>();

export const contentNavigation = {
  /**
   * Retrieves the entire content structure as a nested tree.
   */
  async getContentStructure(tenantId: string | null = null): Promise<ContentNode[]> {
    if (contentStore.initState === "initializing") {
      logger.warn("[ContentNavigation] getContentStructure called during initialization");
      return [];
    }

    // Filter by tenant BEFORE building the tree for better performance
    const allNodes = contentStore.getAllNodes();
    const filteredNodes = tenantId
      ? allNodes.filter((node) => node.tenantId === tenantId)
      : allNodes;

    const nodesMap = new Map<string, ContentNode>();
    for (const node of filteredNodes) {
      // getContentStructure key/lookup type mismatch between _id and parentId
      nodesMap.set(node._id.toString(), {
        ...node,
        children: [] as ContentNode[],
      });
    }

    const tree: ContentNode[] = [];
    for (const node of nodesMap.values()) {
      const pId = node.parentId?.toString();
      if (pId && nodesMap.has(pId)) {
        nodesMap.get(pId)?.children?.push(node as ContentNode);
      } else {
        tree.push(node as ContentNode);
      }
    }
    return tree;
  },

  /**
   * Returns a lightweight navigation structure for client serialization.
   */
  async getNavigationStructure(tenantId: string | null = null): Promise<NavigationNode[]> {
    if (contentStore.initState === "initializing") {
      logger.warn("[ContentNavigation] getNavigationStructure called during initialization");
      return [];
    }

    const version = contentStore.contentVersion;
    if (version !== _lastNavCacheVersion) {
      _navL1Cache.clear();
      _lastNavCacheVersion = version;
    }

    const tid = tenantId || "global";
    const l1Hit = _navL1Cache.get(tid);
    if (l1Hit) return l1Hit;

    const cacheKey = `navigation:tree:${tid}:${version}`;

    if (typeof window === "undefined" && import.meta.env.SSR && navigationCacheProvider) {
      try {
        const cached = await navigationCacheProvider.get(cacheKey, tenantId);
        if (cached) {
          _navL1Cache.set(tid, cached);
          return cached;
        }
      } catch {
        logger.trace("[NavigationCache] Read failed or skipped");
      }
    }

    const allNodes = contentStore.getAllNodes();
    const filteredNodes = tenantId
      ? allNodes.filter((node) => node.tenantId === tenantId)
      : allNodes;

    const navMap = new Map<string, NavigationNode>();
    for (const node of filteredNodes) {
      navMap.set(node._id.toString(), {
        _id: node._id.toString(),
        name: node.name,
        path: node.path,
        icon: node.icon,
        nodeType: node.nodeType,
        order: node.order,
        parentId: node.parentId?.toString(),
        translations: node.translations,
        children: undefined,
      });
    }

    const result: NavigationNode[] = [];
    for (const navNode of navMap.values()) {
      const pId = navNode.parentId;
      if (pId && navMap.has(pId)) {
        const parent = navMap.get(pId)!;
        (parent.children ??= []).push(navNode);
      } else {
        result.push(navNode);
      }
    }

    _navL1Cache.set(tid, result);

    if (typeof window === "undefined" && import.meta.env.SSR && navigationCacheProvider) {
      try {
        await navigationCacheProvider.set(cacheKey, result, tenantId);
      } catch {
        logger.trace("[NavigationCache] Write failed or skipped");
      }
    }

    return result;
  },

  /**
   * Progressive navigation loading (depth-limited).
   * Optimized O(n) version using pre-built parent->children map.
   */
  getNavigationStructureProgressive(options?: {
    maxDepth?: number;
    expandedIds?: Set<string>;
    tenantId?: string | null;
  }): NavigationNode[] {
    const maxDepth = options?.maxDepth ?? 1;
    const expandedIds = options?.expandedIds ?? new Set<string>();
    const targetTenantId = options?.tenantId?.toString() || undefined;

    const allNodes = contentStore.getAllNodes();
    const parentToChildrenMap = new Map<string | undefined, ContentNode[]>();

    // Single pass to build map: O(n)
    for (const node of allNodes) {
      const nTenantId = node.tenantId?.toString() || undefined;
      if (targetTenantId && nTenantId !== targetTenantId) continue;

      const rawParentId = node.parentId?.toString() || undefined;
      const nParentId = rawParentId === "null" || rawParentId === "" ? undefined : rawParentId;

      if (!parentToChildrenMap.has(nParentId)) {
        parentToChildrenMap.set(nParentId, []);
      }
      parentToChildrenMap.get(nParentId)!.push(node);
    }

    const buildTree = (parentId: string | undefined, currentDepth: number): NavigationNode[] => {
      const nodes = parentToChildrenMap.get(parentId) || [];
      const children: NavigationNode[] = [];

      for (const node of nodes) {
        const nodeDepth = currentDepth + 1;
        const node_id = node._id.toString();
        const shouldLoadChildren = nodeDepth < maxDepth || expandedIds.has(node_id);
        const hasChildren = parentToChildrenMap.has(node_id);

        children.push({
          _id: node_id,
          name: node.name,
          path: node.path,
          icon: node.icon,
          nodeType: node.nodeType,
          order: node.order,
          parentId: parentId,
          translations: node.translations,
          children: shouldLoadChildren ? buildTree(node_id, nodeDepth) : undefined,
          hasChildren: hasChildren && !shouldLoadChildren,
        });
      }
      //  sortContentNodes inlined inconsistently in progressive version — now uses shared sort
      return children.sort(sortContentNodes);
    };

    return buildTree(undefined, 0);
  },

  getNodeChildren(nodeId: string, tenantId?: string | null): ContentNode[] {
    return contentStore.getChildren(nodeId, tenantId).sort(sortContentNodes);
  },

  getDescendants(nodeId: string): ContentNode[] {
    const descendants: ContentNode[] = [];
    const queue: string[] = [nodeId];
    const visited = new Set<string>();
    let head = 0;

    while (head < queue.length) {
      const currentId = queue[head++];
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const children = contentStore.getChildren(currentId);
      for (const child of children) {
        descendants.push(child);
        queue.push(child._id.toString());
      }
    }
    return descendants;
  },

  getBreadcrumb(path: string): Array<{ name: string; path: string }> {
    const segments = path.split("/").filter(Boolean);
    const breadcrumb: Array<{ name: string; path: string }> = [];
    let currentPath = "";
    for (const segment of segments) {
      currentPath += `/${segment}`;
      const node = contentStore.getNodeByPath(currentPath);
      //  getBreadcrumb silently drops unresolved path segments — now adds them with segment name if node missing
      breadcrumb.push({
        name: node ? node.name : segment.charAt(0).toUpperCase() + segment.slice(1),
        path: currentPath,
      });
    }
    return breadcrumb;
  },
};

// --- METRICS & MONITORING ---

interface MetricsStore {
  initializationTime: number;
  cacheHits: number;
  cacheMisses: number;
  lastRefresh: number;
  operationCounts: Record<string, number>;
}

const metrics: MetricsStore = {
  initializationTime: 0,
  cacheHits: 0,
  cacheMisses: 0,
  lastRefresh: 0,
  operationCounts: { create: 0, update: 0, delete: 0, move: 0 },
};

export const contentMetrics = {
  getMetrics() {
    return {
      ...metrics,
      uptime: Date.now() - metrics.lastRefresh,
      cacheHitRate: metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses) || 0,
    };
  },
  trackCacheHit(hit: boolean) {
    if (hit) metrics.cacheHits++;
    else metrics.cacheMisses++;
  },
  setInitializationTime(ms: number) {
    metrics.initializationTime = ms;
    metrics.lastRefresh = Date.now();
  },
  getHealthStatus() {
    return {
      state: contentStore.initState,
      nodeCount: contentStore.nodeCount,
      collectionCount: contentStore.collectionCount,
      version: contentStore.contentVersion,
    };
  },
  // getDiagnostics is a strict subset of getHealthStatus — removed it (deprecated placeholder)
};
