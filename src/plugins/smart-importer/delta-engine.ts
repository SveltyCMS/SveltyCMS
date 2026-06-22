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
      delta.push({
        ...entry,
        rawCustomFields: { ...entry.rawCustomFields, _deltaChanged: true },
      });
      changed++;
    } else if (entry.updatedAt && entry.updatedAt > previousState.lastHighwater) {
      // Updated since last import
      delta.push({
        ...entry,
        rawCustomFields: { ...entry.rawCustomFields, _deltaUpdated: true },
      });
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

const DELTA_STATE_COLLECTION = "plugin_importer_delta";

function unwrapDoc<T extends Record<string, unknown>>(result: unknown): T | null {
  if (!result || typeof result !== "object") return null;
  if ("success" in result) {
    const wrapped = result as { success: boolean; data: T | null };
    return wrapped.success ? (wrapped.data ?? null) : null;
  }
  return result as T;
}

/** Load persisted delta/highwater state for a collection + platform pair */
export async function loadDeltaState(
  dbAdapter: { crud: { findOne: (...args: unknown[]) => Promise<unknown> } },
  collection: string,
  sourcePlatform: string,
): Promise<DeltaState | null> {
  try {
    const row = unwrapDoc<Record<string, unknown>>(
      await dbAdapter.crud.findOne(DELTA_STATE_COLLECTION, {
        collection,
        sourcePlatform,
      }),
    );
    if (!row) return null;

    let checksums: Record<string, string> = {};
    if (typeof row.checksumsJson === "string") {
      try {
        checksums = JSON.parse(row.checksumsJson) as Record<string, string>;
      } catch {
        checksums = {};
      }
    }

    return {
      collection: String(row.collection),
      sourcePlatform: String(row.sourcePlatform),
      lastHighwater: String(row.lastHighwater || ""),
      importedCount: Number(row.importedCount || 0),
      lastImportToken: String(row.lastImportToken || ""),
      checksums,
    };
  } catch {
    return null;
  }
}

/** Persist delta state after a successful import */
export async function saveDeltaState(
  dbAdapter: {
    crud: {
      findOne: (...args: unknown[]) => Promise<unknown>;
      insert: (...args: unknown[]) => Promise<unknown>;
      updateOne: (...args: unknown[]) => Promise<unknown>;
    };
  },
  state: DeltaState,
): Promise<void> {
  const payload = {
    collection: state.collection,
    sourcePlatform: state.sourcePlatform,
    lastHighwater: state.lastHighwater,
    importedCount: state.importedCount,
    lastImportToken: state.lastImportToken,
    checksumsJson: JSON.stringify(state.checksums),
    updatedAt: nowISODateString(),
  };

  const existing = unwrapDoc<{ _id: string }>(
    await dbAdapter.crud.findOne(DELTA_STATE_COLLECTION, {
      collection: state.collection,
      sourcePlatform: state.sourcePlatform,
    }),
  );

  if (existing?._id) {
    await dbAdapter.crud.updateOne(DELTA_STATE_COLLECTION, { _id: existing._id }, payload);
  } else {
    await dbAdapter.crud.insert(DELTA_STATE_COLLECTION, {
      _id: `${state.sourcePlatform}_${state.collection}`,
      ...payload,
    });
  }
}

/** Build updated delta state from imported entries */
export function buildDeltaStateFromImport(
  collection: string,
  sourcePlatform: string,
  transactionToken: string,
  importedEntries: SNCEntry[],
  previous: DeltaState | null,
): DeltaState {
  const checksums: Record<string, string> = previous?.checksums ? { ...previous.checksums } : {};
  let lastHighwater = previous?.lastHighwater ?? "";

  for (const entry of importedEntries) {
    checksums[entry.externalId] = computeContentHash(entry);
    if (entry.updatedAt && entry.updatedAt > lastHighwater) {
      lastHighwater = entry.updatedAt;
    }
  }

  return {
    collection,
    sourcePlatform,
    lastHighwater: lastHighwater || nowISODateString(),
    importedCount: (previous?.importedCount ?? 0) + importedEntries.length,
    lastImportToken: transactionToken,
    checksums,
  };
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
      return {
        action: "update",
        data: { ...existing, ...incoming, _id: existing._id },
      };

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
        data: {
          ...incoming,
          slug: `${incoming.slug}-imported-${Date.now()}`,
          _isDuplicate: true,
        },
      };

    default:
      return { action: "insert", data: incoming };
  }
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
