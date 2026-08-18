/**
 * @file src/routes/(app)/config/collectionbuilder/collectionbuilder-utils.ts
 * @description Pure utility functions extracted from the Collection Builder page
 * for unit testability. No DOM or store dependencies.
 *
 * ### Features:
 * - Tree traversal for descendant ID collection
 * - Slug generation with deduplication
 * - Fail-closed payload parsers for remotes / form actions
 */

import type { ContentNodeInput, ContentNodeOperation } from "@src/content/types";

const NODE_ID_RE = /^[A-Za-z0-9_.:-]{1,128}$/;
const OP_TYPES = new Set(["create", "delete", "move", "rename", "update"]);
export const MAX_COLLECTION_BUILDER_IDS = 200;
export const MAX_COLLECTION_BUILDER_OPS = 500;

/** Parse a JSON array from a form field. Returns null on missing/invalid JSON. */
export function parseJsonArray(raw: FormDataEntryValue | null): unknown[] | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Validate a list of content-node ids (UUIDs, slugs, dotted paths). */
export function parseIdList(ids: unknown): string[] | null {
  if (!Array.isArray(ids) || ids.length > MAX_COLLECTION_BUILDER_IDS) return null;
  const out: string[] = [];
  for (const id of ids) {
    if (typeof id !== "string" || !NODE_ID_RE.test(id)) return null;
    out.push(id);
  }
  return out;
}

/** Validate GUI structure operations before they hit LocalCMS. */
export function parseOperations(ops: unknown): ContentNodeOperation[] | null {
  if (!Array.isArray(ops) || ops.length > MAX_COLLECTION_BUILDER_OPS) return null;
  const out: ContentNodeOperation[] = [];
  for (const raw of ops) {
    if (!raw || typeof raw !== "object") return null;
    const type = (raw as { type?: unknown }).type;
    const node = (raw as { node?: unknown }).node;
    if (typeof type !== "string" || !OP_TYPES.has(type)) return null;
    if (!node || typeof node !== "object") return null;
    const path = (node as { path?: unknown }).path;
    if (typeof path !== "string") return null;
    out.push({
      type: type as ContentNodeOperation["type"],
      node: node as ContentNodeInput,
    });
  }
  return out;
}

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
