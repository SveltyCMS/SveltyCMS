/**
 * @file src/plugins/smart-importer/delta-engine.ts
 * @description Delta/incremental migration engine.
 *
 * Inspired by Drupal's Migrate API highwater marks and Magento's Settings→Data→Delta workflow.
 * Tracks what was imported and only imports changed/new items on subsequent runs.
 *
 * ### Features:
 * - Highwater marks: track last import timestamp per collection
 * - Change detection: compare source timestamps against highwater
 * - Idempotent: uses externalId for upsert (no duplicates)
 * - Conflict resolution: skip | overwrite | merge | keep_both
 * - Stub generation: create placeholder entries for unresolved references
 * - Migration presets: save/load field mapping configurations
 */

import { logger } from "@utils/logger";
import { nowISODateString } from "@utils/date";
import type { SNCEnvelope, SNCEntry } from "./types";

// ============================================================================
// Types
// ============================================================================

export type ConflictStrategy = "skip" | "overwrite" | "merge" | "keep_both";

export interface DeltaState {
  collection: string;
  sourcePlatform: string;
  lastHighwater: string; // ISO timestamp of last import
  importedCount: number;
  lastImportToken: string;
  checksums: Record<string, string>; // externalId → content hash
}

export interface MigrationPreset {
  id: string;
  name: string;
  sourcePlatform: string;
  targetCollection: string;
  fieldMappings: Array<{ source: string; target: string }>;
  conflictStrategy: ConflictStrategy;
  contentTypes: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ScaffoldSchema {
  collectionName: string;
  fields: Array<{
    name: string;
    type: string;
    required: boolean;
    label: string;
  }>;
}

// ============================================================================
// Delta Engine
// ============================================================================

/**
 * Filters an SNC envelope to only include new/changed entries since the last import.
 * Uses highwater timestamps and content checksums for change detection.
 */
export function computeDelta(
  envelope: SNCEnvelope,
  previousState: DeltaState | null,
): { delta: SNCEntry[]; skipped: number; changed: number; new: number } {
  if (!previousState) {
    // First import — everything is new
    return {
      delta: envelope.entries,
      skipped: 0,
      changed: 0,
      new: envelope.entries.length,
    };
  }

  const delta: SNCEntry[] = [];
  let skipped = 0;
  let changed = 0;
  let newCount = 0;

  for (const entry of envelope.entries) {
    const prevHash = previousState.checksums[entry.externalId];
    const currentHash = computeContentHash(entry);

    if (!prevHash) {
      // New entry
      delta.push(entry);
      newCount++;
    } else if (prevHash !== currentHash) {
      // Changed entry
      delta.push({ ...entry, rawCustomFields: { ...entry.rawCustomFields, _deltaChanged: true } });
      changed++;
    } else if (entry.updatedAt && entry.updatedAt > previousState.lastHighwater) {
      // Updated since last import
      delta.push({ ...entry, rawCustomFields: { ...entry.rawCustomFields, _deltaUpdated: true } });
      changed++;
    } else {
      skipped++;
    }
  }

  logger.info(
    `[DeltaEngine] ${newCount} new, ${changed} changed, ${skipped} skipped (from ${envelope.entries.length} total)`,
  );

  return { delta, skipped, changed, new: newCount };
}

/**
 * Computes a simple content hash for change detection.
 * In production, this would use a proper hashing algorithm.
 */
export function computeContentHash(entry: SNCEntry): string {
  const key = [
    entry.title,
    entry.content || "",
    entry.excerpt || "",
    entry.status,
    entry.updatedAt || "",
    JSON.stringify(entry.taxonomies),
    JSON.stringify(entry.rawCustomFields),
  ].join("|");
  // Simple hash (in production, use crypto.subtle.digest or Bun.hash)
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
  }
  return String(hash);
}

// ============================================================================
// Conflict Resolution
// ============================================================================

/**
 * Resolves import conflicts based on the chosen strategy.
 */
export function resolveConflict(
  incoming: Record<string, any>,
  existing: Record<string, any> | null,
  strategy: ConflictStrategy,
): { action: "insert" | "update" | "skip"; data: Record<string, any> } {
  if (!existing) {
    return { action: "insert", data: incoming };
  }

  switch (strategy) {
    case "skip":
      return { action: "skip", data: existing };

    case "overwrite":
      return { action: "update", data: { ...existing, ...incoming, _id: existing._id } };

    case "merge":
      // Deep merge: keep existing values, only add missing fields from incoming
      const merged = { ...incoming, ...existing };
      // Preserve existing content if incoming is empty
      for (const key of ["content", "excerpt", "featuredImage"]) {
        if (!incoming[key] && existing[key]) {
          merged[key] = existing[key];
        }
      }
      return { action: "update", data: { ...merged, _id: existing._id } };

    case "keep_both":
      // Insert as new entry with modified slug to avoid collision
      return {
        action: "insert",
        data: { ...incoming, slug: `${incoming.slug}-imported-${Date.now()}`, _isDuplicate: true },
      };

    default:
      return { action: "insert", data: incoming };
  }
}

// ============================================================================
// Schema Scaffolding
// ============================================================================

/**
 * Analyzes source fields and auto-generates a SveltyCMS collection schema.
 * Inspired by Directus' schema-first import and Strapi's content-type builder.
 */
export function scaffoldCollectionSchema(
  sourceFields: string[],
  sourcePlatform: string,
  suggestedName: string,
): ScaffoldSchema {
  const fields: ScaffoldSchema["fields"] = [];
  const seen = new Set<string>();

  // Required base fields
  fields.push({ name: "title", type: "text", required: true, label: "Title" });
  seen.add("title");

  for (const field of sourceFields) {
    const normalized = normalizeFieldName(field);
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    const { type, label } = inferFieldType(field, sourcePlatform);
    fields.push({
      name: normalized,
      type,
      required: ["title", "slug", "status"].includes(normalized),
      label,
    });
  }

  return {
    collectionName: suggestedName || `imported_${sourcePlatform}`,
    fields,
  };
}

function normalizeFieldName(field: string): string {
  // Convert WP-style (post_title) and Drupal-style (field_tags) to camelCase
  return field
    .replace(/^(wp:|post_|field_)/, "")
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/_([a-z])/g, (_, c) => c.toUpperCase())
    .replace(/^[A-Z]/, (c) => c.toLowerCase());
}

function inferFieldType(field: string, platform: string): { type: string; label: string } {
  const lower = field.toLowerCase();

  if (lower.includes("title") || lower.includes("name")) return { type: "text", label: "Title" };
  if (
    lower.includes("content") ||
    lower.includes("body") ||
    lower.includes("richtext") ||
    lower.includes("encoded")
  )
    return { type: "richtext", label: "Content" };
  if (lower.includes("excerpt") || lower.includes("summary") || lower.includes("description"))
    return { type: "text", label: "Excerpt" };
  if (
    lower.includes("slug") ||
    lower.includes("path") ||
    lower.includes("alias") ||
    lower.includes("handle") ||
    lower.includes("url")
  )
    return { type: "text", label: "Slug" };
  if (lower.includes("status") || lower.includes("state"))
    return { type: "select", label: "Status" };
  if (
    lower.includes("date") ||
    lower.includes("created") ||
    lower.includes("updated") ||
    lower.includes("published") ||
    lower.includes("_at")
  )
    return { type: "date", label: "Date" };
  if (
    lower.includes("author") ||
    lower.includes("creator") ||
    lower.includes("uid") ||
    lower.includes("user")
  )
    return { type: "text", label: "Author" };
  if (
    lower.includes("image") ||
    lower.includes("media") ||
    lower.includes("thumbnail") ||
    lower.includes("cover") ||
    lower.includes("photo")
  )
    return { type: "media", label: "Media" };
  if (
    lower.includes("tag") ||
    lower.includes("category") ||
    lower.includes("taxonomy") ||
    lower.includes("topic")
  )
    return { type: "tags", label: "Taxonomy" };
  if (
    lower.includes("price") ||
    lower.includes("cost") ||
    lower.includes("amount") ||
    lower.includes("count") ||
    lower.includes("quantity") ||
    lower.includes("weight") ||
    lower.includes("order") ||
    lower.includes("sort")
  )
    return { type: "number", label: "Number" };
  if (lower.includes("email")) return { type: "text", label: "Email" };
  if (lower.includes("phone") || lower.includes("tel")) return { type: "text", label: "Phone" };
  if (lower.includes("color") || lower.includes("colour")) return { type: "text", label: "Color" };
  if (lower.includes("id") || lower.includes("uuid") || lower.includes("guid"))
    return { type: "text", label: "ID" };
  if (lower.includes("lang") || lower.includes("locale") || lower.includes("language"))
    return { type: "text", label: "Language" };

  return { type: "text", label: field.charAt(0).toUpperCase() + field.slice(1) };
}

// ============================================================================
// Migration Presets
// ============================================================================

/**
 * Saves a migration configuration as a reusable preset.
 * Presets can be loaded to quickly reconfigure mappings for similar imports.
 */
export function createMigrationPreset(
  name: string,
  sourcePlatform: string,
  targetCollection: string,
  fieldMappings: Array<{ source: string; target: string }>,
  conflictStrategy: ConflictStrategy = "skip",
  contentTypes: string[] = [],
): MigrationPreset {
  return {
    id: `preset_${sourcePlatform}_${Date.now()}`,
    name,
    sourcePlatform,
    targetCollection,
    fieldMappings,
    conflictStrategy,
    contentTypes,
    createdAt: nowISODateString(),
    updatedAt: nowISODateString(),
  };
}

// ============================================================================
// Post-Migration Validation
// ============================================================================

export interface ValidationResult {
  sourceCount: number;
  importedCount: number;
  failedCount: number;
  dlqCount: number;
  passed: boolean;
  issues: string[];
  spotChecks: Array<{ externalId: string; title: string; status: string }>;
}

/**
 * Validates a completed migration by comparing source vs target counts.
 * Inspired by Drupal's `migrate:status` and Magento's post-migration validation.
 */
export async function validateMigration(
  dbAdapter: any,
  envelope: SNCEnvelope,
  targetCollection: string,
  transactionToken: string,
): Promise<ValidationResult> {
  const issues: string[] = [];
  const sourceCount = envelope.entries.length;

  // Count imported entries
  let importedCount = 0;
  try {
    const result = await dbAdapter.crud.findMany(targetCollection, {
      _transactionToken: transactionToken,
    });
    importedCount = result.success && Array.isArray(result.data) ? result.data.length : 0;
  } catch {
    issues.push("Could not count imported entries");
  }

  // Count DLQ entries
  let dlqCount = 0;
  try {
    const dlqResult = await dbAdapter.crud.findMany("plugin_importer_dlq", {
      transactionToken,
    });
    dlqCount = dlqResult.success && Array.isArray(dlqResult.data) ? dlqResult.data.length : 0;
  } catch {
    // DLQ may not exist yet
  }

  // Spot checks on first 5 entries
  const spotChecks: ValidationResult["spotChecks"] = [];
  try {
    const spotResult = await dbAdapter.crud.findMany(
      targetCollection,
      {
        _transactionToken: transactionToken,
      },
      { limit: 5 },
    );
    if (spotResult.success && Array.isArray(spotResult.data)) {
      for (const item of spotResult.data) {
        spotChecks.push({
          externalId: String((item as any)._externalId || ""),
          title: String((item as any).title || ""),
          status: String((item as any).status || ""),
        });
      }
    }
  } catch {
    // Spot checks are non-critical
  }

  // Validate
  if (importedCount + dlqCount < sourceCount) {
    issues.push(`Missing entries: ${sourceCount - importedCount - dlqCount} not accounted for`);
  }

  const passed = importedCount > 0 && issues.length === 0;

  return {
    sourceCount,
    importedCount,
    failedCount: dlqCount,
    dlqCount,
    passed,
    issues,
    spotChecks,
  };
}
