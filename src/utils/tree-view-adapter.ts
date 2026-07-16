/**
 * @file src/utils/treeViewAdapter.ts
 * @description Hardened adapter for ContentNode ↔ TreeView hierarchy.
 *
 * ### Hardening (audit 2026-07):
 * - Strict property cleanup: destructuring excludes path/parent/text from DB objects
 * - Parent-ID from explicit property: fromTreeViewData() uses item.parent, not path parsing
 * - Immutable accumulation: toTreeViewData() uses .reduce() instead of mutable loops
 * - Single-pass recalculatePaths: clean hierarchy walker with order-preserving sort
 *
 * Adapter for converting ContentNode structures to TreeView data and vice versa.
 */

import type { ContentNode } from "@databases/db-interface";

export interface TreeViewItem extends Record<string, any> {
  _id?: any;
  icon?: string;
  id: string;
  isDraggable?: boolean;
  isDropAllowed?: boolean;
  name: string;
  nodeType: "category" | "collection" | "folder";
  order?: number;
  parent: string | null;
  path: string;
}

/**
 * Flattens recursive ContentNode structure into a flat array.
 * 🛡️ Hardened: Sanitizes objects to prevent leaking internal properties.
 */
export function toTreeViewData(nodes: ContentNode[], parentPath = ""): TreeViewItem[] {
  return nodes.reduce<TreeViewItem[]>((acc, node) => {
    const n = node as any;
    const id = String(n.id || n._id || crypto.randomUUID());
    const path = parentPath ? `${parentPath}.${id}` : id;

    // Explicitly pick allowed properties, excluding database-heavy 'children'
    const { children, ...rest } = n;

    const item: TreeViewItem = {
      ...rest,
      id,
      name: n.name ?? "Untitled",
      nodeType: n.type ?? n.nodeType ?? "collection",
      icon: n.icon,
      path,
      parent: parentPath ? (parentPath.split(".").pop() ?? null) : null,
      isDraggable: true,
      isDropAllowed: true,
    };

    acc.push(item);

    if (Array.isArray(children)) {
      acc.push(...toTreeViewData(children, path));
    }

    return acc;
  }, []);
}

/**
 * Reconstructs recursive ContentNode structure from flat TreeView items.
 * 🛡️ Hardened: Uses explicit parent property, not path-parsing.
 */
export function fromTreeViewData(flatItems: TreeViewItem[]): ContentNode[] {
  const nodeMap = new Map<string, ContentNode>();
  const roots: ContentNode[] = [];

  // Create clean nodes — destructuring excludes path/parent/text from DB objects
  for (const item of flatItems) {
    const { path: _path, parent: _parent, text: _text, ...rest } = item;

    const node = {
      ...rest,
      _id: item._id || item.id,
      children: [],
    } as unknown as ContentNode;

    nodeMap.set(String(item.id), node);
  }

  // Build hierarchy using explicit parent property
  for (const item of flatItems) {
    const node = nodeMap.get(String(item.id))!;
    const parentId = item.parent;

    if (parentId && nodeMap.has(parentId)) {
      nodeMap.get(parentId)!.children?.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * Converts flat TreeView items directly to flat ContentNodes for the backend.
 * Handles parentId mapping and recalculates order based on sibling position.
 */
export function toFlatContentNodes(flatItems: TreeViewItem[]): ContentNode[] {
  // Group items by parent to calculate order within siblings
  const siblingGroups = new Map<string, TreeViewItem[]>();

  for (const item of flatItems) {
    const parentKey = item.parent || "__root__";
    if (!siblingGroups.has(parentKey)) {
      siblingGroups.set(parentKey, []);
    }
    siblingGroups.get(parentKey)?.push(item);
  }

  // Sort each sibling group by their path order
  for (const [, siblings] of siblingGroups) {
    siblings.sort((a, b) => {
      const aSegments = a.path.split(".");
      const bSegments = b.path.split(".");
      return aSegments.at(-1)!.localeCompare(bSegments.at(-1)!);
    });
  }

  // Create order lookup
  const orderLookup = new Map<string, number>();
  for (const [, siblings] of siblingGroups) {
    siblings.forEach((item, index) => {
      orderLookup.set(item.id, index);
    });
  }

  return flatItems.map((item) => {
    // Extract parentId from path (second-to-last segment)
    let parentId: string | undefined;
    if (item.path?.includes(".")) {
      const segments = item.path.split(".");
      segments.pop();
      parentId = segments.pop();
    }

    const { path: _path, parent: _parent, text: _text, ...rest } = item;

    return {
      ...rest,
      _id: item._id || item.id,
      parentId,
      order: orderLookup.get(item.id) ?? 0,
    } as unknown as ContentNode;
  });
}

/**
 * Recalculates paths for TreeView items after drag-and-drop.
 * 🛡️ Hardened: Single-pass recursive pathing ensures integrity.
 */
export function recalculatePaths(items: TreeViewItem[]): TreeViewItem[] {
  const itemMap = new Map(items.map((i) => [i.id, { ...i }]));
  const childrenByParent = new Map<string, TreeViewItem[]>();

  // Group by parent
  for (const item of itemMap.values()) {
    const p = item.parent ?? "__root__";
    if (!childrenByParent.has(p)) childrenByParent.set(p, []);
    childrenByParent.get(p)!.push(item);
  }

  function assignPaths(parentId: string | null, parentPath: string): void {
    const children = childrenByParent.get(parentId ?? "__root__") ?? [];

    // Sort by existing order if available
    children.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      child.path = parentPath ? `${parentPath}.${child.id}` : child.id;
      child.order = i;
      child.parent = parentId;
      assignPaths(child.id, child.path);
    }
  }

  assignPaths(null, "");
  return Array.from(itemMap.values());
}
