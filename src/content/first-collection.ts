/**
 * @file src/content/first-collection.ts
 * @description
 * Shared first-collection resolution for redirects, setup seeding, and client navigation.
 *
 * ### Features:
 * - Tenant-safe node-based selection
 * - Stable order-first sorting with alphabetical fallback
 * - Unified system-collection skip policy
 */

import type { ContentNode, DatabaseId, Schema } from "./types";

const SYSTEM_COLLECTION_NAMES = new Set(["menu", "navigation", "form", "widgettest", "relation"]);
const SYSTEM_COLLECTION_PREFIXES = [
  "redirects",
  "404_logs",
  "plugin_",
  "workflow_",
  "system_",
  "system_content_structure",
  "system_settings",
  "system_themes",
];

export function getSchemaKey(schema?: Schema | null): string {
  return String(schema?._id || schema?.slug || schema?.name || "").toLowerCase();
}

export function getNodeCollectionKey(node?: ContentNode | null): string {
  return String(
    node?.collectionDef?._id ||
      node?.collectionDef?.slug ||
      node?._id ||
      node?.slug ||
      node?.name ||
      "",
  ).toLowerCase();
}

export function isUserFacingCollectionId(value: unknown): boolean {
  const id = String(value || "").toLowerCase();
  if (!id) return false;
  if (SYSTEM_COLLECTION_NAMES.has(id)) return false;
  return !SYSTEM_COLLECTION_PREFIXES.some((prefix) => id.startsWith(prefix));
}

export function isUserFacingCollectionSchema(schema?: Schema | null): boolean {
  if (!schema) return false;
  return isUserFacingCollectionId(getSchemaKey(schema));
}

export function isUserFacingCollectionNode(node?: ContentNode | null): boolean {
  if (!node || node.nodeType !== "collection" || !node.collectionDef) return false;
  return isUserFacingCollectionId(getNodeCollectionKey(node));
}

export function getSchemaPath(
  schema:
    | Partial<Schema>
    | { path?: string; slug?: string; _id?: string | DatabaseId; name?: string },
): string {
  const pathValue =
    schema.path ||
    `/collection/${String(schema.slug || schema._id || schema.name || "").toLowerCase()}`;
  return pathValue.startsWith("/") ? pathValue : `/${pathValue}`;
}

export function getNodePath(node: ContentNode): string {
  const pathValue =
    node.path ||
    node.collectionDef?.path ||
    `/collection/${String(node.collectionDef?._id || node._id || node.name).toLowerCase()}`;
  return pathValue.startsWith("/") ? pathValue : `/${pathValue}`;
}

export function compareCollectionNodes(
  order?: Record<string, number> | null,
): (a: ContentNode, b: ContentNode) => number {
  return (a, b) => {
    const aKey = getNodeCollectionKey(a);
    const bKey = getNodeCollectionKey(b);
    const aOrder = order?.[String(a._id)] ?? order?.[aKey] ?? a.order ?? 999;
    const bOrder = order?.[String(b._id)] ?? order?.[bKey] ?? b.order ?? 999;
    const orderDiff = aOrder - bOrder;
    if (orderDiff !== 0) return orderDiff;
    return String(a.name || aKey).localeCompare(String(b.name || bKey));
  };
}

export function compareCollectionSchemas(a: Schema, b: Schema): number {
  const aOrder = a.order ?? (a as any).manifestOrder ?? 999;
  const bOrder = b.order ?? (b as any).manifestOrder ?? 999;
  const orderDiff = aOrder - bOrder;
  if (orderDiff !== 0) return orderDiff;
  return String(a.name || a._id || "").localeCompare(String(b.name || b._id || ""));
}

export function getFirstCollectionNode(
  nodes: ContentNode[],
  order?: Record<string, number> | null,
): ContentNode | null {
  return (
    [...nodes].filter(isUserFacingCollectionNode).sort(compareCollectionNodes(order))[0] ?? null
  );
}

export function getFirstCollectionSchema(schemas: Schema[]): Schema | null {
  return (
    [...schemas].filter(isUserFacingCollectionSchema).sort(compareCollectionSchemas)[0] ?? null
  );
}

export function getCollectionRedirectPathFromNode(
  node: ContentNode,
  language: string = "en",
): string {
  return `/${language}${getNodePath(node)}`;
}

export function getCollectionRedirectPathFromSchema(
  schema: Schema,
  language: string = "en",
): string {
  return `/${language}${getSchemaPath(schema)}`;
}

export function getFirstCollectionRedirectPathFromNodes(
  nodes: ContentNode[],
  language: string = "en",
  order?: Record<string, number> | null,
): string | null {
  const first = getFirstCollectionNode(nodes, order);
  return first ? getCollectionRedirectPathFromNode(first, language) : null;
}
