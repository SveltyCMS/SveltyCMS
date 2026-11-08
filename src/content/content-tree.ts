/**
 * @file src/content/content-tree.ts
 * @description
 * Pure, browser-safe content tree helpers shared by the client Collection Builder
 * and the server reconciliation path.
 *
 * ### Features:
 * - Deterministic category nodes from hierarchical collection file paths
 * - Stable node sorting by `order` then name
 * - Sibling-name duplicate detection with self-exclusion
 *
 * 🛡️ No store, logger, cache, or facade imports: importing this module from a
 * client route never pulls the server-side navigation surface.
 */
import { nowISODateString } from "@utils/date";
import type { ContentNode, DatabaseId, Schema } from "./types";

/**
 * Minimal structural view of a tree node used by sibling-name checks — accepts
 * `ContentNode` as well as the builder's detached drafts.
 */
type SiblingId = string | number | null | undefined;

/**
 * Generates category nodes based on the hierarchical paths of collection files.
 */
export function generateCategoryNodesFromPaths(
  files: Schema[],
  tenantId?: string | null,
): ContentNode[] {
  const folders = new Map<string, ContentNode>();
  const now = nowISODateString();

  for (const file of files) {
    if (!file.path) continue;

    const parts = file.path.split("/").filter(Boolean);
    // Parts: ["collection", "subfolder", "posts"]

    let currentPath = "";
    let parentId: DatabaseId | null = null;

    for (let i = 0; i < parts.length - 1; i++) {
      const segment = parts[i];
      // Skip the root 'collection' segment which is just a path prefix
      if (segment.toLowerCase() === "collection") {
        currentPath = "/collection";
        continue;
      }

      const segmentPath = `${currentPath}/${segment.toLowerCase()}`;

      if (!folders.has(segmentPath)) {
        const node: ContentNode = {
          _id: segmentPath.replace(/\//g, "_") as DatabaseId, // Deterministic ID based on path
          name: segment.charAt(0).toUpperCase() + segment.slice(1),
          path: segmentPath,
          nodeType: "category",
          icon: "mdi:folder",
          tenantId: tenantId as DatabaseId | null | undefined,
          // Root categories keep the historical `null` payload (not `undefined`)
          // so the reconcile write is byte-identical to the pre-split output.
          parentId: parentId as DatabaseId,
          createdAt: now,
          updatedAt: now,
          order: 999,
          translations: [],
          source: "filesystem",
        };
        folders.set(segmentPath, node);
      }

      parentId = folders.get(segmentPath)!._id;
      currentPath = segmentPath;
    }
  }
  return Array.from(folders.values());
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
  nodes: ReadonlyArray<{ _id?: SiblingId; name: string; parentId?: SiblingId }>,
  parentId: SiblingId,
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
