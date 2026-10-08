/**
 * @file src/routes/(app)/config/collectionbuilder/collectionbuilder-utils.ts
 * @description Pure utility functions extracted from the Collection Builder page
 * for unit testability. No DOM or store dependencies.
 *
 * ### Features:
 * - Tree traversal for descendant ID collection
 * - Slug generation with deduplication
 * - Fail-closed payload parsers for remotes / form actions
 * - Minimum-viable guards for new builder entities (collection / category)
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

/**
 * Minimum a collection needs to survive the compilation pipeline: at least one
 * field, and every field resolvable — an identity (`db_fieldName`/`name`) plus
 * a widget/type (see `docs/reference/architecture/compilation-pipeline.mdx`).
 *
 * The compiler and the post-load schema contract tolerate empty fields only as
 * soft “draft” warnings; the builder must not write such stubs in the first
 * place — they provision no columns and reach the runtime as drafts.
 *
 * Accepts the client array shape or the server field-map (`FieldsData`).
 */
/**
 * Detect duplicate database column names (db_fieldName / name).
 * Prevents SQL column collisions and ambiguous schema properties.
 */
export function findDuplicateDatabaseFieldNames(fields: unknown): string[] {
  const list = Array.isArray(fields)
    ? fields
    : fields && typeof fields === "object"
      ? Object.values(fields as Record<string, unknown>)
      : [];
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const f = raw as { db_fieldName?: unknown; name?: unknown };
    const name =
      typeof f.db_fieldName === "string" && f.db_fieldName.trim()
        ? f.db_fieldName.trim().toLowerCase()
        : typeof f.name === "string" && f.name.trim()
          ? f.name.trim().toLowerCase()
          : "";
    if (!name) continue;
    if (seen.has(name)) {
      duplicates.add(name);
    } else {
      seen.add(name);
    }
  }

  return Array.from(duplicates);
}

export function validateMinimumCollectionFields(
  fields: unknown,
): { ok: true } | { ok: false; message: string } {
  const list = Array.isArray(fields)
    ? fields
    : fields && typeof fields === "object"
      ? Object.values(fields as Record<string, unknown>)
      : [];

  if (list.length === 0) {
    return {
      ok: false,
      message:
        "Add at least one field before saving — a collection without fields provisions no columns and loads as a draft.",
    };
  }

  for (const [index, raw] of list.entries()) {
    if (!raw || typeof raw !== "object") {
      return { ok: false, message: `Field ${index + 1} is not a valid field definition.` };
    }
    const field = raw as {
      db_fieldName?: unknown;
      name?: unknown;
      label?: unknown;
      type?: unknown;
      widget?: unknown;
    };
    const identity =
      typeof field.db_fieldName === "string" && field.db_fieldName.trim()
        ? field.db_fieldName.trim()
        : typeof field.name === "string" && field.name.trim()
          ? field.name.trim()
          : "";
    const label = typeof field.label === "string" && field.label.trim() ? field.label.trim() : "";

    if (!identity) {
      return {
        ok: false,
        message: `Field ${index + 1}${label ? ` (“${label}”)` : ""} needs a database field name (db_fieldName) before saving.`,
      };
    }

    const widget = field.widget;
    const hasWidget =
      (typeof widget === "string" && widget.trim().length > 0) ||
      (widget != null &&
        typeof widget === "object" &&
        [
          (widget as { Name?: unknown }).Name,
          (widget as { name?: unknown }).name,
          (widget as { type?: unknown }).type,
        ].some((value) => typeof value === "string" && value.trim().length > 0)) ||
      (typeof field.type === "string" && field.type.trim().length > 0);

    if (!hasWidget) {
      return { ok: false, message: `Field “${identity}” needs a widget (type) before saving.` };
    }
  }

  const duplicates = findDuplicateDatabaseFieldNames(list);
  if (duplicates.length > 0) {
    return {
      ok: false,
      message: `Duplicate database field name: "${duplicates.join(", ")}". Each field must have a unique identifier.`,
    };
  }

  return { ok: true };
}

/**
 * Minimum for a builder structural node: a path, and — where the operation
 * carries the node identity (create/rename/update) — a non-empty name. Empty
 * names previously persisted as unreachable tree junk.
 */
export function validateStructureOperation(op: ContentNodeOperation): string | null {
  const node = op.node as ContentNodeInput;
  const name = typeof node.name === "string" ? node.name.trim() : "";
  const path = typeof node.path === "string" ? node.path.trim() : "";

  if (!path) {
    return "A structure node needs a path before it can be saved.";
  }
  if ((op.type === "create" || op.type === "rename" || op.type === "update") && !name) {
    return node.nodeType === "category"
      ? "A category needs a name before it can be saved."
      : "A collection node needs a name before it can be saved.";
  }
  return null;
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
