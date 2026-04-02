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
  return nodes.some(
    (node) => node.name === name && node.parentId === parentId && node._id !== excludeId,
  );
}

// --- NAVIGATION & TREE OPERATIONS ---

export const contentNavigation = {
  /**
   * Retrieves the entire content structure as a nested tree.
   */
  async getContentStructure(): Promise<ContentNode[]> {
    if (contentStore.initState === "initializing") {
      logger.warn("[ContentNavigation] getContentStructure called during initialization");
      return [];
    }

    const nodes = new Map<string, ContentNode>();
    for (const node of contentStore.getAllNodes()) {
      nodes.set(node._id, { ...node, children: [] as ContentNode[] });
    }

    const tree: ContentNode[] = [];
    for (const node of nodes.values()) {
      if (node.parentId && nodes.has(node.parentId)) {
        nodes.get(node.parentId)?.children?.push(node as ContentNode);
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
    const fullStructure = await this.getContentStructure();

    const stripToNavigation = (nodes: ContentNode[]): NavigationNode[] => {
      return nodes
        .filter((node) => !(tenantId && node.tenantId) || node.tenantId === tenantId)
        .map((node) => ({
          _id: node._id,
          name: node.name,
          path: node.path,
          icon: node.icon,
          nodeType: node.nodeType,
          order: node.order,
          parentId: node.parentId,
          translations: node.translations,
          children: node.children?.length ? stripToNavigation(node.children) : undefined,
        }));
    };

    return stripToNavigation(fullStructure);
  },

  /**
   * Progressive navigation loading (depth-limited).
   */
  getNavigationStructureProgressive(options?: {
    maxDepth?: number;
    expandedIds?: Set<string>;
    tenantId?: string | null;
  }): NavigationNode[] {
    const maxDepth = options?.maxDepth ?? 1;
    const expandedIds = options?.expandedIds ?? new Set<string>();

    const buildTree = (parentId: string | undefined, currentDepth: number): NavigationNode[] => {
      const children: NavigationNode[] = [];

      for (const node of contentStore.getAllNodes()) {
        if (options?.tenantId && node.tenantId && node.tenantId !== options.tenantId) continue;
        if ((node.parentId || undefined) === (parentId || undefined)) {
          const nodeDepth = currentDepth + 1;
          const shouldLoadChildren = nodeDepth < maxDepth || expandedIds.has(node._id);

          let hasChildren = false;
          for (const n of contentStore.getAllNodes()) {
            if (n.parentId === node._id) {
              hasChildren = true;
              break;
            }
          }

          children.push({
            _id: node._id,
            name: node.name,
            path: node.path,
            icon: node.icon,
            nodeType: node.nodeType,
            order: node.order,
            parentId: node.parentId,
            translations: node.translations,
            children: shouldLoadChildren ? buildTree(node._id, nodeDepth) : undefined,
            hasChildren: hasChildren && !shouldLoadChildren,
          });
        }
      }
      return children.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
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

      for (const node of contentStore.getAllNodes()) {
        if (node.parentId === currentId) {
          descendants.push(node);
          queue.push(node._id);
        }
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
      if (node) breadcrumb.push({ name: node.name, path: currentPath });
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
  getDiagnostics() {
    return {
      nodeCount: contentStore.nodeCount,
      state: contentStore.initState,
      version: contentStore.contentVersion,
    };
  },
};
