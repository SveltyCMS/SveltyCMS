/**
 * @file src/content/content-utils.ts
 * @description
 * Shared utility functions, navigation logic, and performance metrics.
 * Safe for both client-side UI and server-side reconciliation.
 */
import { contentStore } from "@stores/content-store.svelte";
import type { ContentNode, NavigationNode, MinimalContentNode, Schema } from "./types";
import { logger } from "@utils/logger";

// --- PURE UTILITIES ---

/**
 * Generates category nodes based on the hierarchical paths of collection files.
 */
export function generateCategoryNodesFromPaths(files: Schema[]): Map<string, MinimalContentNode> {
  const folders = new Map<string, MinimalContentNode>();

  for (const file of files) {
    if (!file.path) continue;
    const parts = file.path.split("/").filter(Boolean);
    let path = "";
    for (let i = 0; i < parts.length - 1; i++) {
      const name = parts[i];
      path = `${path}/${name}`;
      if (!folders.has(path)) {
        folders.set(path, { name, path, nodeType: "category" });
      }
    }
  }
  return folders;
}

/**
 * Consistent sorting logic for content nodes.
 */
export function sortContentNodes<T extends { order?: number; name: string }>(a: T, b: T): number {
  const orderDiff = (a.order ?? 999) - (b.order ?? 999);
  if (orderDiff !== 0) return orderDiff;
  return a.name.localeCompare(b.name);
}

/**
 * Checks if a node with the same name already exists under the same parent.
 */
export function hasDuplicateSiblingName(
  nodes: any[],
  parentId: any,
  name: string,
  excludeId?: string,
): boolean {
  const pId = parentId?.toString() || undefined;
  const exId = excludeId?.toString() || undefined;
  return nodes.some(
    (node) =>
      node.name === name &&
      (node.parentId?.toString() || undefined) === pId &&
      node._id?.toString() !== exId,
  );
}

// --- NAVIGATION & TREE OPERATIONS ---

export const contentNavigation = {
  /**
   * Retrieves the entire content structure as a nested tree.
   */
  async getContentStructure(tenantId: string | null = null): Promise<ContentNode[]> {
    if (contentStore.initState === "initializing") {
      logger.warn("[ContentNavigation] getContentStructure called during initialization");
      return [];
    }

    // Fix: Filter by tenant BEFORE building the tree for better performance
    const allNodes = contentStore.getAllNodes();
    const filteredNodes = tenantId
      ? allNodes.filter((node) => !node.tenantId || node.tenantId === tenantId)
      : allNodes;

    const nodesMap = new Map<string, ContentNode>();
    for (const node of filteredNodes) {
      // Fix: getContentStructure key/lookup type mismatch between _id and parentId
      nodesMap.set(node._id.toString(), { ...node, children: [] as ContentNode[] });
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
    const tenantStructure = await this.getContentStructure(tenantId);

    const stripToNavigation = (nodes: ContentNode[]): NavigationNode[] => {
      return nodes.map((node) => ({
        _id: node._id.toString(),
        name: node.name,
        path: node.path,
        icon: node.icon,
        nodeType: node.nodeType,
        order: node.order,
        parentId: node.parentId?.toString(),
        translations: node.translations,
        children: node.children?.length ? stripToNavigation(node.children) : undefined,
      }));
    };

    return stripToNavigation(tenantStructure);
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
      if (targetTenantId && nTenantId && nTenantId !== targetTenantId) continue;

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
      // Fix: sortContentNodes inlined inconsistently in progressive version — now uses shared sort
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

    while (queue.length > 0) {
      const currentId = queue.shift()!;
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
      // Fix: getBreadcrumb silently drops unresolved path segments — now adds them with segment name if node missing
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
  // Fix: getDiagnostics is a strict subset of getHealthStatus — removed it (deprecated placeholder)
};
