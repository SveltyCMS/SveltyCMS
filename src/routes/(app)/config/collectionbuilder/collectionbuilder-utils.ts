/**
 * @file src/routes/(app)/config/collectionbuilder/collectionbuilder-utils.ts
 * @description Pure utility functions extracted from the Collection Builder page
 * for unit testability. No DOM or store dependencies.
 *
 * ### Features:
 * - Tree traversal for descendant ID collection
 * - Slug generation with deduplication
 */

/** Collect category id and all descendant node ids from a flat node list. */
export function getDescendantIds(
  categoryId: string,
  flat: {
    _id?: { toString(): string } | string;
    parentId?: { toString(): string } | string;
  }[],
): string[] {
  const idSet = new Set<string>();
  const add = (id: string) => {
    if (idSet.has(id)) return;
    idSet.add(id);
    flat.filter((n) => String(n.parentId ?? "") === id).forEach((n) => add(String(n._id ?? "")));
  };
  add(categoryId);
  return Array.from(idSet);
}

/**
 * Generate a unique URL-safe path from a category name.
 * Deduplicates against existing paths.
 */
export function uniquePathForCategory(
  name: string,
  existingPaths: Set<string> = new Set(),
): string {
  const slug =
    name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "") || "category";
  let path = `/${slug}`;
  let n = 1;
  while (existingPaths.has(path.toLowerCase())) {
    path = `/${slug}-${n}`;
    n += 1;
  }
  return path;
}
