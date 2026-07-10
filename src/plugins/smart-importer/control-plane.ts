/**
 * @file src/plugins/smart-importer/control-plane.ts
 * @description Migration Control Plane — surgical import control for full and partial migrations.
 *
 * Enables:
 * 1. Smart Filters:   date range, status, content type, field values, sample size
 * 2. Field Selection:  import only specific fields, ignore others
 * 3. Resumable:        checkpoint every N items, resume from last checkpoint
 * 4. Per-Field Merge:  different conflict strategy per field
 * 5. Import Preview:   diff between source and what would change
 * 6. Chunked Rollback: rollback specific date ranges or content types
 * 7. Dry-Run Diff:     show exact changes without writing
 */

import type { SNCEnvelope, SNCEntry } from "./types";
import { logger } from "@utils/logger";

// ============================================================================
// 1. Smart Filter Builder
// ============================================================================

export interface ImportFilter {
  /** Only import entries created after this date (ISO string) */
  createdAfter?: string;
  /** Only import entries created before this date */
  createdBefore?: string;
  /** Only import entries modified after this date */
  modifiedAfter?: string;
  /** Only import specific statuses */
  statuses?: Array<"published" | "draft" | "pending" | "archived">;
  /** Only import specific content types (post, page, product, etc.) */
  contentTypes?: string[];
  /** Only import entries matching field conditions */
  fieldConditions?: Array<{
    field: string;
    operator: "equals" | "contains" | "startsWith" | "regex" | "exists" | "gt" | "lt";
    value?: string;
  }>;
  /** Import only a sample: { type: 'first', count: 10 } or { type: 'random', count: 50 } */
  sample?: { type: "first" | "random" | "every_nth"; count: number };
  /** Skip entries matching these external IDs */
  excludeIds?: string[];
  /** Only import entries with these external IDs */
  includeIds?: string[];
  /** Only import entries where this field has a non-empty value */
  requireFields?: string[];
  /** Import entries in this language only */
  language?: string;
}

/**
 * Applies import filters to an SNC envelope.
 * Returns filtered entries and a report of what was excluded.
 */
export function applyImportFilters(
  envelope: SNCEnvelope,
  filter: ImportFilter,
): {
  filtered: SNCEnvelope;
  report: {
    total: number;
    passed: number;
    excluded: number;
    reasons: Record<string, number>;
  };
} {
  const reasons: Record<string, number> = {};
  let passed = 0;
  let excluded = 0;

  let entries = [...envelope.entries];

  // Date filters
  if (filter.createdAfter) {
    const cutoff = new Date(filter.createdAfter).getTime();
    const before = entries.length;
    entries = entries.filter((e) => {
      const d = e.createdAt ? new Date(e.createdAt).getTime() : 0;
      return d >= cutoff;
    });
    const excludedCount = before - entries.length;
    if (excludedCount > 0) reasons["created_before_cutoff"] = excludedCount;
    excluded += excludedCount;
  }

  if (filter.createdBefore) {
    const cutoff = new Date(filter.createdBefore).getTime();
    const before = entries.length;
    entries = entries.filter((e) => {
      const d = e.createdAt ? new Date(e.createdAt).getTime() : Infinity;
      return d <= cutoff;
    });
    const excludedCount = before - entries.length;
    if (excludedCount > 0) reasons["created_after_cutoff"] = excludedCount;
    excluded += excludedCount;
  }

  if (filter.modifiedAfter) {
    const cutoff = new Date(filter.modifiedAfter).getTime();
    const before = entries.length;
    entries = entries.filter((e) => {
      const d = e.updatedAt ? new Date(e.updatedAt).getTime() : 0;
      return d >= cutoff;
    });
    const excludedCount = before - entries.length;
    if (excludedCount > 0) reasons["not_modified_since"] = excludedCount;
    excluded += excludedCount;
  }

  // Status filter
  if (filter.statuses && filter.statuses.length > 0) {
    const before = entries.length;
    entries = entries.filter((e) => filter.statuses!.includes(e.status));
    const excludedCount = before - entries.length;
    if (excludedCount > 0) reasons["status_mismatch"] = excludedCount;
    excluded += excludedCount;
  }

  // Content type filter
  if (filter.contentTypes && filter.contentTypes.length > 0) {
    const before = entries.length;
    entries = entries.filter((e) => {
      const type =
        (e.rawCustomFields as any)?.type ||
        (e.rawCustomFields as any)?._drupalType ||
        (e.rawCustomFields as any)?._sourceTable ||
        "default";
      return filter.contentTypes!.some((ct) => type.toLowerCase().includes(ct.toLowerCase()));
    });
    const excludedCount = before - entries.length;
    if (excludedCount > 0) reasons["content_type_mismatch"] = excludedCount;
    excluded += excludedCount;
  }

  // Field conditions
  if (filter.fieldConditions) {
    for (const cond of filter.fieldConditions) {
      const before = entries.length;
      entries = entries.filter((e) => {
        const rawVal = e.rawCustomFields[cond.field];
        const val = rawVal !== undefined ? String(rawVal) : "";

        switch (cond.operator) {
          case "equals":
            return val === (cond.value || "");
          case "contains":
            return val.toLowerCase().includes((cond.value || "").toLowerCase());
          case "startsWith":
            return val.toLowerCase().startsWith((cond.value || "").toLowerCase());
          case "regex":
            return new RegExp(cond.value || "", "i").test(val);
          case "exists":
            return rawVal !== undefined && rawVal !== null && val !== "";
          case "gt":
            return parseFloat(val) > parseFloat(cond.value || "0");
          case "lt":
            return parseFloat(val) < parseFloat(cond.value || "0");
          default:
            return true;
        }
      });
      const excludedCount = before - entries.length;
      if (excludedCount > 0) reasons[`condition_${cond.field}_${cond.operator}`] = excludedCount;
      excluded += excludedCount;
    }
  }

  // Exclude/include IDs
  if (filter.excludeIds && filter.excludeIds.length > 0) {
    const excludeSet = new Set(filter.excludeIds);
    const before = entries.length;
    entries = entries.filter((e) => !excludeSet.has(e.externalId));
    reasons["excluded_by_id"] = before - entries.length;
    excluded += before - entries.length;
  }

  if (filter.includeIds && filter.includeIds.length > 0) {
    const includeSet = new Set(filter.includeIds);
    const before = entries.length;
    entries = entries.filter((e) => includeSet.has(e.externalId));
    reasons["not_in_include_list"] = before - entries.length;
    excluded += before - entries.length;
  }

  // Required fields
  if (filter.requireFields) {
    for (const field of filter.requireFields) {
      const before = entries.length;
      entries = entries.filter((e) => {
        const val = e.rawCustomFields[field];
        return val !== undefined && val !== null && String(val).trim() !== "";
      });
      const excludedCount = before - entries.length;
      if (excludedCount > 0) reasons[`missing_required_${field}`] = excludedCount;
      excluded += excludedCount;
    }
  }

  // Language filter
  if (filter.language) {
    const before = entries.length;
    entries = entries.filter(
      (e) => (e.languageCode || "").toLowerCase() === filter.language!.toLowerCase(),
    );
    reasons["language_mismatch"] = before - entries.length;
    excluded += before - entries.length;
  }

  // Sample
  if (filter.sample) {
    let sampled: SNCEntry[];
    switch (filter.sample.type) {
      case "first":
        sampled = entries.slice(0, filter.sample.count);
        break;
      case "random":
        sampled = shuffleArray([...entries]).slice(0, filter.sample.count);
        break;
      case "every_nth": {
        const nth = filter.sample.count;
        sampled = entries.filter((_, i) => i % nth === 0);
        break;
      }
    }
    reasons["sampled_out"] = entries.length - sampled.length;
    excluded += entries.length - sampled.length;
    entries = sampled!;
  }

  passed = entries.length;

  logger.info(
    `[ControlPlane] Filters applied: ${passed} passed, ${excluded} excluded ` +
      `(${Object.entries(reasons)
        .map(([k, v]) => `${k}:${v}`)
        .join(", ")})`,
  );

  return {
    filtered: { ...envelope, entries },
    report: { total: envelope.entries.length, passed, excluded, reasons },
  };
}

// ============================================================================
// 2. Field Selection — Import Only Specific Fields
// ============================================================================

export interface FieldSelection {
  /** Fields to include in import (all others are dropped) */
  includeFields?: string[];
  /** Fields to exclude from import */
  excludeFields?: string[];
  /** Widget type overrides per field */
  fieldWidgets?: Record<string, string>;
}

/**
 * Applies field-level selection to filter which fields get imported.
 */
export function applyFieldSelection(entries: SNCEntry[], selection: FieldSelection): SNCEntry[] {
  if (!selection.includeFields && !selection.excludeFields) return entries;

  return entries.map((entry) => {
    const filtered: SNCEntry = { ...entry, rawCustomFields: {} };

    for (const [key, value] of Object.entries(entry.rawCustomFields)) {
      // Skip internal fields
      if (key.startsWith("_")) {
        filtered.rawCustomFields[key] = value;
        continue;
      }

      if (selection.includeFields && !selection.includeFields.includes(key)) continue;
      if (selection.excludeFields && selection.excludeFields.includes(key)) continue;

      filtered.rawCustomFields[key] = value;
    }

    return filtered;
  });
}

// ============================================================================
// 3. Resumable Import with Checkpoints
// ============================================================================

export interface ImportCheckpoint {
  id: string;
  transactionToken: string;
  targetCollection: string;
  totalEntries: number;
  processedCount: number;
  lastProcessedExternalId: string;
  checkpointAt: string;
  batchIndex: number;
}

/**
 * Saves a checkpoint so the import can be resumed if interrupted.
 */
export async function saveCheckpoint(dbAdapter: any, checkpoint: ImportCheckpoint): Promise<void> {
  try {
    await dbAdapter.crud.insert("plugin_importer_checkpoints", {
      _id: checkpoint.id,
      ...checkpoint,
    });
  } catch (err) {
    logger.error("[ControlPlane] Failed to save checkpoint:", err);
  }
}

/**
 * Loads the last checkpoint for a transaction token.
 * Returns null if no checkpoint exists (fresh import).
 */
export async function loadCheckpoint(
  dbAdapter: any,
  transactionToken: string,
): Promise<ImportCheckpoint | null> {
  try {
    const result = await dbAdapter.crud.findOne("plugin_importer_checkpoints", {
      transactionToken,
    });
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * Resumes an import from the last checkpoint.
 * Skips already-processed entries.
 */
export function resumeFromCheckpoint(
  entries: SNCEntry[],
  checkpoint: ImportCheckpoint,
): { remaining: SNCEntry[]; skipCount: number } {
  const lastIdx = entries.findIndex((e) => e.externalId === checkpoint.lastProcessedExternalId);
  if (lastIdx === -1) return { remaining: entries, skipCount: 0 };

  const remaining = entries.slice(lastIdx + 1);
  const skipCount = lastIdx + 1;

  logger.info(
    `[ControlPlane] Resuming import: ${skipCount} already processed, ${remaining.length} remaining`,
  );

  return { remaining, skipCount };
}

// ============================================================================
// 4. Per-Field Conflict Resolution
// ============================================================================

export type FieldConflictStrategy =
  | "keep_existing"
  | "overwrite"
  | "merge_arrays"
  | "keep_longer"
  | "keep_shorter";

export interface PerFieldConflictConfig {
  /** Default strategy for unmapped fields */
  defaultStrategy: "skip" | "overwrite" | "merge";
  /** Per-field override strategies */
  fieldStrategies: Record<string, FieldConflictStrategy>;
}

/**
 * Resolves conflicts on a per-field basis.
 * Different fields can have different merge strategies.
 */
export function resolvePerField(
  incoming: Record<string, any>,
  existing: Record<string, any>,
  config: PerFieldConflictConfig,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...existing, _id: existing._id };

  for (const [key, value] of Object.entries(incoming)) {
    if (key === "_id" || key.startsWith("_")) continue;

    const strategy = config.fieldStrategies[key] || "overwrite";
    const existingValue = existing[key];

    switch (strategy) {
      case "keep_existing":
        // Don't overwrite — keep existing value
        break;

      case "overwrite":
        result[key] = value;
        break;

      case "merge_arrays":
        if (Array.isArray(existingValue) && Array.isArray(value)) {
          result[key] = [...new Set([...existingValue, ...value])];
        } else {
          result[key] = value;
        }
        break;

      case "keep_longer":
        const existingLen = String(existingValue || "").length;
        const incomingLen = String(value || "").length;
        result[key] = existingLen >= incomingLen ? existingValue : value;
        break;

      case "keep_shorter":
        const eLen = String(existingValue || "").length;
        const iLen = String(value || "").length;
        result[key] = eLen <= iLen ? existingValue : value;
        break;
    }
  }

  return result;
}

// ============================================================================
// 5. Import Preview / Diff
// ============================================================================

export interface PreviewDiff {
  /** Entries that would be created (don't exist in target) */
  created: Array<{
    externalId: string;
    title: string;
    preview: Record<string, string>;
  }>;
  /** Entries that would be updated (exist in target) */
  updated: Array<{
    externalId: string;
    title: string;
    changes: Array<{ field: string; existing: string; incoming: string }>;
  }>;
  /** Entries that would be skipped (unchanged or conflict strategy) */
  skipped: Array<{ externalId: string; title: string; reason: string }>;
  summary: { total: number; create: number; update: number; skip: number };
}

/**
 * Generates a preview of what would change without actually importing.
 */
export async function generatePreview(
  dbAdapter: any,
  envelope: SNCEnvelope,
  targetCollection: string,
  conflictStrategy: string,
): Promise<PreviewDiff> {
  const preview: PreviewDiff = {
    created: [],
    updated: [],
    skipped: [],
    summary: { total: envelope.entries.length, create: 0, update: 0, skip: 0 },
  };

  for (const entry of envelope.entries.slice(0, 100)) {
    const existing = await dbAdapter.crud.findOne(targetCollection, {
      _externalId: entry.externalId,
    });

    if (!existing.success || !existing.data) {
      preview.created.push({
        externalId: entry.externalId,
        title: entry.title,
        preview: {
          title: entry.title,
          slug: entry.slug,
          status: entry.status,
          content: (entry.content || "").slice(0, 100),
        },
      });
      preview.summary.create++;
    } else if (conflictStrategy === "skip") {
      preview.skipped.push({
        externalId: entry.externalId,
        title: entry.title,
        reason: "Already exists (skip strategy)",
      });
      preview.summary.skip++;
    } else {
      const changes: PreviewDiff["updated"][0]["changes"] = [];
      const existingData = existing.data;

      if (existingData.title !== entry.title) {
        changes.push({
          field: "title",
          existing: existingData.title,
          incoming: entry.title,
        });
      }
      if (existingData.content !== entry.content) {
        changes.push({
          field: "content",
          existing: (existingData.content || "").slice(0, 50),
          incoming: (entry.content || "").slice(0, 50),
        });
      }

      if (changes.length > 0) {
        preview.updated.push({
          externalId: entry.externalId,
          title: entry.title,
          changes,
        });
        preview.summary.update++;
      } else {
        preview.skipped.push({
          externalId: entry.externalId,
          title: entry.title,
          reason: "No changes detected",
        });
        preview.summary.skip++;
      }
    }
  }

  return preview;
}

// ============================================================================
// 6. Chunked / Partial Rollback
// ============================================================================

export interface RollbackFilter {
  /** Only rollback entries created after this date */
  createdAfter?: string;
  /** Only rollback specific content types */
  contentTypes?: string[];
  /** Only rollback entries matching these external IDs */
  externalIds?: string[];
}

/**
 * Partial rollback — only removes entries matching the filter.
 */
export async function partialRollback(
  dbAdapter: any,
  targetCollection: string,
  transactionToken: string,
  filter: RollbackFilter,
): Promise<{ removed: number }> {
  const query: any = { _transactionToken: transactionToken };

  if (filter.createdAfter) {
    query.createdAt = { $gte: filter.createdAfter };
  }
  if (filter.externalIds) {
    query._externalId = { $in: filter.externalIds };
  }

  // Count before
  const before = await dbAdapter.crud.findMany(targetCollection, query);
  const beforeCount = before.success && Array.isArray(before.data) ? before.data.length : 0;

  // Content type filter (post-filter since raw data isn't indexed)
  let items = before.success && Array.isArray(before.data) ? before.data : [];
  if (filter.contentTypes && filter.contentTypes.length > 0) {
    items = items.filter((item: any) => {
      const type = item._contentType || item.type || item.rawCustomFields?.type;
      return filter.contentTypes!.some((ct) =>
        (type || "").toLowerCase().includes(ct.toLowerCase()),
      );
    });
  }

  // Delete matching items
  for (const item of items) {
    await dbAdapter.crud.deleteOne(targetCollection, { _id: item._id });
  }

  logger.info(`[ControlPlane] Partial rollback: removed ${items.length} of ${beforeCount} entries`);

  return { removed: items.length };
}

// ============================================================================
// Helpers
// ============================================================================

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
