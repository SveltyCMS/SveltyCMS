/**
 * @file src/utils/collection-filter-defs.ts
 * @description
 * **Schema-driven filter definitions** — pure, zero-dependency, browser-safe.
 *
 * Derives filter control types from collection widgets without importing
 * database adapters, cache, or auth. Used by:
 * - `createSmartFilter` (admin UI)
 * - `collection-filter-engine` (server compile + security)
 * - GraphQL / REST list endpoints (future)
 *
 * ### Features:
 * - widget → control type mapping (text, select, date, numberRange, boolean)
 * - unsafe widget exclusion (media, rich text, relations, …)
 * - system field definitions (status, createdAt, updatedAt)
 * - number-range encode/decode (`min:max`)
 *
 * @see docs/reference/architecture/collection-filtering.mdx
 */

import type { FieldInstance, Schema } from "@src/content/types";
import { StatusTypes } from "@src/content/types";
import { getFieldName } from "@utils/schema/field-utils";

// ─── Types ───────────────────────────────────────────────────────────────────

export type FilterControlType = "text" | "select" | "date" | "numberRange" | "boolean";

export interface SmartFilterOption {
  value: string;
  label: string;
}

export interface SmartFilterDefinition {
  id: string;
  label: string;
  type: FilterControlType;
  options?: SmartFilterOption[];
  widgetName?: string;
  /**
   * Schema/widget hint that this field is filterable.
   * Server still enforces FLAC + whitelist — never trust the client alone.
   */
  safeForFiltering: boolean;
}

export interface BuildFilterDefinitionsOptions {
  /** Include status / createdAt / updatedAt when missing from schema. Default true. */
  includeSystemFields?: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Widgets that hold non-scalar / unsafe-to-filter payloads. */
export const UNSAFE_FILTER_WIDGET_PATTERNS = [
  "media",
  "upload",
  "richtext",
  "rich-text",
  "relation",
  "group",
  "repeater",
  "json",
  "markdown",
  "remote-video",
  "geolocation",
  "address",
  "seo",
  "mega-menu",
  "ai-enrichment",
] as const;

export const STATUS_FILTER_OPTIONS: SmartFilterOption[] = [
  { value: StatusTypes.publish, label: "Published" },
  { value: StatusTypes.draft, label: "Draft" },
  { value: StatusTypes.unpublish, label: "Unpublished" },
  { value: StatusTypes.schedule, label: "Scheduled" },
  { value: StatusTypes.archive, label: "Archived" },
];

export const BOOLEAN_FILTER_OPTIONS: SmartFilterOption[] = [
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
];

export const SYSTEM_FILTER_FIELD_DEFS: Array<{
  id: string;
  label: string;
  type: FilterControlType;
  options?: SmartFilterOption[];
}> = [
  { id: "status", label: "Status", type: "select", options: STATUS_FILTER_OPTIONS },
  { id: "createdAt", label: "Created", type: "date" },
  { id: "updatedAt", label: "Updated", type: "date" },
];

// ─── Pure helpers ────────────────────────────────────────────────────────────

function normalizeWidgetName(field: Partial<FieldInstance> & Record<string, unknown>): string {
  const widget = field.widget as { Name?: string; name?: string } | string | undefined;
  if (typeof widget === "string") return widget;
  if (widget && typeof widget === "object") {
    return String(widget.Name || widget.name || "");
  }
  return String(field.type || "");
}

export function isUnsafeFilterWidget(widgetName: string): boolean {
  const w = widgetName.toLowerCase();
  return UNSAFE_FILTER_WIDGET_PATTERNS.some((p) => w.includes(p));
}

function extractSelectOptions(field: Record<string, unknown>): SmartFilterOption[] | undefined {
  const raw = field.options;
  if (!Array.isArray(raw) || raw.length === 0) return undefined;

  return raw.map((opt: unknown) => {
    if (typeof opt === "string" || typeof opt === "number") {
      return { value: String(opt), label: String(opt) };
    }
    if (opt && typeof opt === "object") {
      const o = opt as { value?: unknown; label?: unknown };
      const value = o.value != null ? String(o.value) : String(o.label ?? "");
      const label = o.label != null ? String(o.label) : value;
      return { value, label };
    }
    return { value: String(opt), label: String(opt) };
  });
}

/**
 * Map a collection field to a filter control definition (widget-aware, DB-agnostic).
 */
export function fieldToFilterDefinition(
  field: Partial<FieldInstance> & Record<string, unknown> & { label: string },
): SmartFilterDefinition {
  const id = getFieldName(field as Partial<FieldInstance> & { label: string });
  const widgetName = normalizeWidgetName(field);
  const widget = widgetName.toLowerCase();
  const idLower = id.toLowerCase();

  let type: FilterControlType = "text";
  let options: SmartFilterOption[] | undefined;

  if (idLower === "status" || widget.includes("status")) {
    type = "select";
    options = STATUS_FILTER_OPTIONS;
  } else if (widget.includes("select") || widget.includes("radio")) {
    type = "select";
    options = extractSelectOptions(field) ?? [];
  } else if (
    widget.includes("checkbox") ||
    widget.includes("boolean") ||
    widget.includes("toggle")
  ) {
    type = "boolean";
    options = BOOLEAN_FILTER_OPTIONS;
  } else if (
    widget.includes("date") ||
    ["createdat", "updatedat", "publishedat", "scheduledat"].includes(idLower)
  ) {
    type = "date";
  } else if (
    widget.includes("number") ||
    widget.includes("price") ||
    widget.includes("currency") ||
    widget.includes("rating")
  ) {
    type = "numberRange";
  }

  return {
    id,
    label: field.label || id,
    type,
    options,
    widgetName: widgetName || undefined,
    safeForFiltering: !isUnsafeFilterWidget(widgetName) && id.length > 0,
  };
}

/** Encode min/max for URL storage (`min:max`). */
export function encodeNumberRange(min?: string | null, max?: string | null): string {
  const lo = (min ?? "").trim();
  const hi = (max ?? "").trim();
  if (!lo && !hi) return "";
  return `${lo}:${hi}`;
}

/** Decode number-range filter values (bare number → min-only). */
export function parseNumberRange(value: string | null | undefined): { min: string; max: string } {
  if (!value || !value.trim()) return { min: "", max: "" };
  const v = value.trim();
  if (!v.includes(":")) return { min: v, max: "" };
  const [min = "", max = ""] = v.split(":");
  return { min, max };
}

/**
 * Build filter definitions from a collection schema (pure, no reactivity, no auth).
 * Server-side callers should further restrict via FLAC in `collection-filter-engine`.
 */
export function buildFilterDefinitions(
  collection: Schema | null | undefined,
  options: BuildFilterDefinitionsOptions = {},
): SmartFilterDefinition[] {
  const includeSystemFields = options.includeSystemFields !== false;
  if (!collection?.fields?.length && !includeSystemFields) return [];

  const defs: SmartFilterDefinition[] = [];
  const seen = new Set<string>();

  if (collection?.fields?.length) {
    for (const raw of collection.fields) {
      const field = raw as Partial<FieldInstance> & Record<string, unknown> & { label: string };
      if (!field?.label && !field?.db_fieldName) continue;

      const def = fieldToFilterDefinition(field);
      if (!def.id || seen.has(def.id)) continue;
      if (!def.safeForFiltering) continue;

      seen.add(def.id);
      defs.push(def);
    }
  }

  if (includeSystemFields) {
    for (const sys of SYSTEM_FILTER_FIELD_DEFS) {
      if (seen.has(sys.id)) continue;
      seen.add(sys.id);
      defs.push({
        id: sys.id,
        label: sys.label,
        type: sys.type,
        options: sys.options,
        widgetName: "system",
        safeForFiltering: true,
      });
    }
  }

  return defs;
}
