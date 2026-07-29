/**
 * @file src/utils/field-selection.ts
 * @description Utilities for optimizing database queries by selecting only necessary fields.
 *
 * ### Performance Benefits:
 * - Reduces database query payload by 50-80%
 * - Decreases network transfer time
 * - Improves cache efficiency
 * - Faster serialization/deserialization
 *
 * ### Bug fixes (audit 2026-07):
 * - Essential fields no longer consume the maxListFields budget (dup-skip guard)
 * - filterEntryFields supports dot-notation for nested NoSQL fields
 * - createProjection fallen back to { _id: 1 } on empty input (prevents full-doc leak)
 * - estimatePayloadReduction clamped to ≥0% (prevents negative UI values)
 */

import type { Schema } from "@src/content/types";
import { logger } from "./logger";

/**
 * Fields that are always included regardless of view mode.
 */
const ESSENTIAL_FIELDS = [
  "_id",
  "status",
  "createdAt",
  "updatedAt",
  "createdBy",
  "updatedBy",
] as const;

export type ViewMode = "list" | "edit" | "preview";

export interface FieldSelectionConfig {
  /** Custom field names to always include in list view */
  customListFields?: string[];
  /** Maximum number of fields to display in list view (excluding essential fields) */
  maxListFields?: number;
  /** Whether to include all fields marked as 'showInList' */
  respectShowInList?: boolean;
}

/**
 * Gets the optimal set of fields to select based on view mode.
 */
export function getDisplayFields(
  collection: Schema,
  mode: ViewMode = "list",
  config: FieldSelectionConfig = {},
): string[] {
  const { maxListFields = 5, customListFields = [], respectShowInList = true } = config;

  if (mode === "edit") return ["*"];

  const selectedFields = new Set<string>(ESSENTIAL_FIELDS);

  for (const field of customListFields) {
    selectedFields.add(field);
  }

  if (mode === "list" && Array.isArray(collection.fields)) {
    const listFields: string[] = [];

    for (const field of collection.fields) {
      if (!field || typeof field !== "object") continue;

      const fieldObj = field as Record<string, unknown>;

      const fieldName =
        (fieldObj.db_fieldName as string) ||
        (fieldObj.name as string) ||
        (fieldObj.label
          ? String(fieldObj.label)
              .toLowerCase()
              .replace(/[^a-z0-9_]/g, "_")
          : null);

      if (!fieldName || typeof fieldName !== "string") continue;

      // Smart skip: don't waste budget on already-selected essential fields
      if (selectedFields.has(fieldName)) continue;

      const nameLower = fieldName.toLowerCase();

      // Priority 1: Explicitly marked for list view
      if (respectShowInList && fieldObj.showInList === true) {
        listFields.push(fieldName);
      }
      // Priority 2: Common display names
      else if (nameLower.includes("title") || nameLower.includes("name") || nameLower === "slug") {
        listFields.push(fieldName);
      }
      // Priority 3: Sortable fields
      else if (fieldObj.sortable === true && listFields.length < maxListFields) {
        listFields.push(fieldName);
      }
      // Priority 4: Initial text fields for context
      else if (
        (fieldObj.type === "text" || fieldObj.type === "textarea") &&
        listFields.length < maxListFields
      ) {
        listFields.push(fieldName);
      }

      // Early exit once budget is filled
      if (listFields.length >= maxListFields) break;
    }

    for (const field of listFields) {
      selectedFields.add(field);
    }
  }

  const result = Array.from(selectedFields);

  logger.debug(`[Field Selection] Mode: ${mode}, Selected: ${result.length} fields`, {
    fields: result.join(", "),
    collection: collection._id,
  });

  return result;
}

/**
 * Converts a field name array to MongoDB projection object.
 */
export function createProjection(fields: string[]): Record<string, 1> {
  if (fields.includes("*")) return {};

  // Security guard: empty projection leaks ALL fields in MongoDB.
  // Fall back to _id-only to prevent accidental data dumps.
  if (fields.length === 0) return { _id: 1 };

  const projection: Record<string, 1> = {};
  for (const field of fields) {
    projection[field] = 1;
  }

  return projection;
}

/**
 * Filters an entry object to only include specified fields,
 * supporting NoSQL dot-notation for nested objects.
 */
export function filterEntryFields<T extends Record<string, unknown>>(
  entry: T,
  fields: string[],
): Partial<T> {
  if (!entry || typeof entry !== "object") return entry;
  if (fields.includes("*")) return entry;

  const filtered = {} as Record<string, unknown>;

  for (const field of fields) {
    // Support MongoDB-style dot notation (e.g., 'author.name')
    if (field.includes(".")) {
      const parts = field.split(".");
      let src: unknown = entry;
      let dest: Record<string, unknown> = filtered;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (src == null || typeof src !== "object" || !(part in src)) break;

        if (i === parts.length - 1) {
          dest[part] = (src as Record<string, unknown>)[part];
        } else {
          src = (src as Record<string, unknown>)[part];
          dest[part] = dest[part] || {};
          dest = dest[part] as Record<string, unknown>;
        }
      }
    } else if (field in entry) {
      filtered[field] = entry[field as keyof T];
    }
  }

  return filtered as Partial<T>;
}

/**
 * Gets estimated payload size reduction percentage.
 * Clamped to ≥0% to prevent negative UI values.
 */
export function estimatePayloadReduction(totalFields: number, selectedFields: number): number {
  if (totalFields <= 0 || selectedFields < 0) return 0;

  const reduction = ((totalFields - selectedFields) / totalFields) * 100;
  return Math.max(0, Math.round(reduction));
}
