/**
 * @file src/content/content-hmr.ts
 * @description Client-safe ContentSync HMR helpers — surgical contentStore patch from Vite WS payload.
 *
 * When the server sends `changedNodes` for a small set of schema updates, we
 * upsert into `contentStore` and optionally `patchActiveSchema` without
 * `invalidate("app:content")` (full layout data refetch).
 *
 * Falls back to full invalidate when:
 * - no nodes payload
 * - fullBuild / requiresLayoutInvalidate
 * - any changed id is new to the registry (route/shell may need loaders)
 */

import { contentStore } from "@stores/content-registry.svelte";
import { collections } from "@src/stores/collection-store.svelte";
import type { ContentNode, Schema } from "./types";

export interface ContentHmrPayload {
  noOp?: boolean;
  changedIds?: string[];
  contentVersion?: number;
  durationMs?: number;
  reason?: string;
  fullBuild?: boolean;
  requiresLayoutInvalidate?: boolean;
  /** Serializable collection nodes for surgical upsert */
  changedNodes?: ContentNode[];
  processed?: number;
  skipped?: number;
}

/**
 * Apply a surgical HMR patch. Returns true when layout invalidate can be skipped.
 */
export function applyContentHmrPatch(data: ContentHmrPayload | undefined | null): boolean {
  if (!data || data.noOp) return true;
  if (data.fullBuild || data.requiresLayoutInvalidate) return false;

  const nodes = data.changedNodes;
  if (!nodes?.length) return false;

  // New collections (not yet in registry) need layout loaders / routes
  for (const node of nodes) {
    const id = String(node._id || "");
    if (!id) return false;
    const existing =
      contentStore.getNode(id) ||
      contentStore.getCollection(id) ||
      contentStore.getCollection(String(node.name || ""));
    if (!existing) return false;
  }

  contentStore.batchUpsert(nodes);

  // Align version counter if server is ahead (batchUpsert already bumps once)
  if (
    typeof data.contentVersion === "number" &&
    data.contentVersion > contentStore.contentVersion
  ) {
    // Extra bumps so client version catches server for SSE/debug consumers
    while (contentStore.contentVersion < data.contentVersion) {
      contentStore.updateVersion();
    }
  }

  // Surgical active editor update without mode/value reset
  for (const node of nodes) {
    const schema = node.collectionDef as Schema | undefined;
    if (schema) collections.patchActiveSchema(schema);
  }

  return true;
}

/**
 * Decide if a server-side result should force layout invalidate on clients.
 */
export function shouldRequireLayoutInvalidate(options: {
  fullBuild?: boolean;
  orphanedCount?: number;
  changedIds?: string[];
  /** true when any id was not previously in the store at sync time */
  hasNewCollections?: boolean;
}): boolean {
  if (options.fullBuild) return true;
  if ((options.orphanedCount ?? 0) > 0) return true;
  if (options.hasNewCollections) return true;
  return false;
}
