/**
 * @file src/plugins/smart-importer/infer-collection.ts
 * @description Infer SveltyCMS target collection names from migration source data.
 *
 * ### Multi-content-type imports (current behavior)
 * When the user selects multiple source types (e.g. WordPress `post` + `page`), all matching
 * entries import into **one** target collection. The collection id is the **primary** type:
 * - With parsed entries: highest-frequency type among the selection wins.
 * - Without entries (wizard-only): first type in the active selection list wins.
 * Per-type collection split (separate `post` and `page` collections) is planned — see roadmap.
 */

import { normalizeCollectionId } from "./collection-scaffold";
import type { SNCEntry } from "./types";

export interface InferCollectionParams {
  format: string;
  /** All content types detected in the export */
  contentTypes?: string[];
  /** User-selected subset for import (wizard filters) */
  selectedContentTypes?: string[];
  /** Parsed entries — used for frequency-based primary type */
  entries?: SNCEntry[];
}

/** Last-resort collection id when inference cannot derive a name */
export const FALLBACK_MIGRATION_COLLECTION = "imported_content";

/**
 * Resolve explicit user input or infer collection name from migration metadata.
 */
export function resolveTargetCollection(
  explicitName: string | null | undefined,
  params: InferCollectionParams,
): string {
  const trimmed = explicitName?.trim();
  if (trimmed) return normalizeCollectionId(trimmed);
  return inferTargetCollectionFromMigration(params);
}

/**
 * Derive target collection from detected content types and/or parsed entries.
 */
export function inferTargetCollectionFromMigration(params: InferCollectionParams): string {
  const activeTypes = params.selectedContentTypes?.filter(Boolean).length
    ? params.selectedContentTypes!.filter(Boolean)
    : params.contentTypes?.filter(Boolean);

  if (activeTypes?.length) {
    const primary = pickPrimaryContentType(activeTypes, params.entries);
    const normalized = normalizeCollectionId(primary);
    if (normalized !== FALLBACK_MIGRATION_COLLECTION || primary.trim()) {
      return normalized;
    }
  }

  if (params.entries?.length) {
    return normalizeCollectionId(inferFromEntries(params.entries, params.format));
  }

  return normalizeCollectionId(platformFallback(params.format));
}

function pickPrimaryContentType(types: string[], entries?: SNCEntry[]): string {
  if (types.length === 1) return types[0];

  if (entries?.length) {
    const allowed = new Set(types.map((t) => t.toLowerCase()));
    const counts = new Map<string, number>();

    for (const entry of entries) {
      const type = extractEntryContentType(entry).toLowerCase();
      if (!type || !allowed.has(type)) continue;
      counts.set(type, (counts.get(type) || 0) + 1);
    }

    let best = types[0];
    let max = -1;
    for (const [type, count] of counts) {
      if (count > max) {
        max = count;
        best = type;
      }
    }
    return best;
  }

  return types[0];
}

function extractEntryContentType(entry: SNCEntry): string {
  const raw = entry.rawCustomFields as Record<string, unknown>;
  const type = raw.type ?? raw.post_type ?? raw._drupalType ?? raw._sourceTable;
  return type ? String(type) : "";
}

function inferFromEntries(entries: SNCEntry[], platform: string): string {
  const first = entries[0];
  const fromField = first ? extractEntryContentType(first) : "";
  if (fromField) return fromField;

  const firstMeta =
    (first?.rawCustomFields as Record<string, unknown> | undefined)?._sourceTable ||
    (first?.rawCustomFields as Record<string, unknown> | undefined)?._drupalType;
  if (firstMeta) return String(firstMeta);

  return platformFallback(platform);
}

function platformFallback(platform: string): string {
  switch (platform.toLowerCase()) {
    case "wordpress":
      return "posts";
    case "drupal":
      return "nodes";
    case "shopify":
      return "products";
    case "strapi":
      return "entries";
    case "directus":
    case "sveltycms":
      return "content";
    case "ghost":
      return "posts";
    case "markdown":
      return "pages";
    case "csv":
    case "webflow":
      return "imported_data";
    default:
      return platform && platform !== "unknown"
        ? `imported_${platform}`
        : FALLBACK_MIGRATION_COLLECTION;
  }
}
