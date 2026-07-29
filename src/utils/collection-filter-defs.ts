/**
 * @file src/utils/collection-filter-defs.ts
 * @description Hardened schema-driven filter definitions.
 *
 * ### Hardening (audit 2026-07):
 * - Regex-based widget safety: compiled regex replaces array.some() for efficiency
 * - ID sanitization: trim() prevents whitespace-caused duplicate keys in seen Set
 * - Regex widget matching: single patterns replace multiple .includes() chains
 * - Defensive parsing: parseNumberRange guards against non-string inputs
 *
 * Schema-driven filter definitions — pure, zero-dependency, browser-safe.
 * Derives filter control types from collection widgets.
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
  safeForFiltering: boolean;
}

export interface BuildFilterDefinitionsOptions {
  includeSystemFields?: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

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

/** 🛡️ Hardened: Compiled regex replaces array.some() for widget safety check */
const UNSAFE_WIDGET_REGEX = new RegExp(UNSAFE_FILTER_WIDGET_PATTERNS.join("|"), "i");

export function isUnsafeFilterWidget(widgetName: string): boolean {
  return UNSAFE_WIDGET_REGEX.test(widgetName);
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
 * Map a collection field to a filter control definition.
 */
export function fieldToFilterDefinition(
  field: Partial<FieldInstance> & Record<string, unknown> & { label: string },
): SmartFilterDefinition {
  const rawId = getFieldName(field as any) || field.db_fieldName || "";
  const id = rawId.trim();
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
  } else if (/checkbox|boolean|toggle/i.test(widget)) {
    type = "boolean";
    options = BOOLEAN_FILTER_OPTIONS;
  } else if (/date/i.test(widget) || /createdat|updatedat|publishedat|scheduledat/i.test(idLower)) {
    type = "date";
  } else if (/number|price|currency|rating/i.test(widget)) {
    type = "numberRange";
  }

  return {
    id,
    label: field.label || id,
    type,
    options,
    widgetName: widgetName || undefined,
    safeForFiltering: id.length > 0 && !isUnsafeFilterWidget(widgetName),
  };
}

export function encodeNumberRange(min?: string | null, max?: string | null): string {
  const lo = (min ?? "").trim();
  const hi = (max ?? "").trim();
  if (!lo && !hi) return "";
  return `${lo}:${hi}`;
}

export function parseNumberRange(value: string | null | undefined): { min: string; max: string } {
  if (!value || typeof value !== "string") return { min: "", max: "" };
  const v = value.trim();
  if (!v.includes(":")) return { min: v, max: "" };
  const [min = "", max = ""] = v.split(":");
  return { min: min.trim(), max: max.trim() };
}

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
