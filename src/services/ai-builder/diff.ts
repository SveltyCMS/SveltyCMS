/**
 * @file src/services/ai-builder/diff.ts
 * @description Structural diff between an existing collection schema and an
 * AI-generated proposal, for the pre-approval review UI.
 *
 * Handles both schema field-shape conventions found in the codebase
 * (`db_fieldName` and `name`), widget entries as strings or `{ Name }`
 * objects, and string-only field lists. System-managed reserved fields are
 * never reported as "removed" — the AI has no authority over them.
 *
 * ### Features:
 * - tolerant parsing of unknown existing-schema shapes
 * - semantic equivalence (widget name, label, type, required, translated, validation)
 * - reserved field-name awareness
 */

import { RESERVED_FIELD_NAMES } from "./validator";
import type { CollectionDesignProposal, ProposalField, SchemaDiff } from "./types";

/** Extract an identity for an existing schema entry, if any. */
function extractFieldName(field: unknown): string | null {
  if (typeof field === "string" && field.length > 0) return field;
  if (typeof field !== "object" || field === null) return null;

  const record = field as Record<string, unknown>;
  for (const key of ["name", "db_fieldName", "dbFieldName", "fieldName"]) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

/** Extract existing fields from an unknown schema shape. */
function extractExistingFields(schema: unknown): Array<{ name: string; raw: unknown }> {
  if (schema === null || typeof schema !== "object") return [];

  const rawFields = Array.isArray(schema) ? schema : (schema as { fields?: unknown }).fields;
  if (!Array.isArray(rawFields)) return [];

  const fields: Array<{ name: string; raw: unknown }> = [];
  for (const raw of rawFields) {
    const name = extractFieldName(raw);
    if (name) fields.push({ name, raw });
  }
  return fields;
}

/** Resolve the registry key of a widget entry (string or `{ Name }` object). */
function widgetNameOf(field: unknown): unknown {
  if (typeof field !== "object" || field === null) return undefined;
  const widget = (field as Record<string, unknown>).widget;
  if (typeof widget === "string") return widget;
  if (typeof widget === "object" && widget !== null) {
    return (widget as Record<string, unknown>).Name;
  }
  return undefined;
}

/** Normalized, order-insensitive view of the properties that matter for diffing. */
function comparableView(field: unknown): Record<string, unknown> {
  const view: Record<string, unknown> = {};
  if (typeof field !== "object" || field === null) return view;

  const record = field as Record<string, unknown>;
  const widget = widgetNameOf(field);
  if (widget !== undefined) view.widget = widget;

  for (const key of ["label", "type", "required", "translated", "validation"]) {
    const value = record[key];
    if (value !== undefined) view[key] = value;
  }
  return view;
}

/** Deterministic serialization so equivalent objects compare equal. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([keyA], [keyB]) => (keyA < keyB ? -1 : keyA > keyB ? 1 : 0))
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`);
  return `{${entries.join(",")}}`;
}

function fieldsEquivalent(existing: unknown, proposed: ProposalField): boolean {
  return stableStringify(comparableView(existing)) === stableStringify(comparableView(proposed));
}

/**
 * Compute the difference between an existing collection schema and a proposal.
 *
 * - `added`: proposal fields with no counterpart in the existing schema.
 * - `changed`: fields present on both sides whose meaningful properties differ.
 * - `removed`: existing fields absent from the proposal. Reserved system fields
 *   (`tenantId`, `status`, …) are intentionally never reported as removed.
 *
 * Unknown/unparseable schemas degrade gracefully: everything is "added".
 */
export function diffSchema(
  existingSchema: unknown,
  proposal: CollectionDesignProposal,
): SchemaDiff {
  const existingFields = extractExistingFields(existingSchema);
  const existingByName = new Map(existingFields.map((field) => [field.name, field]));

  const added: ProposalField[] = [];
  const changed: SchemaDiff["changed"] = [];
  const removed: { name: string }[] = [];

  for (const field of proposal.fields) {
    const before = existingByName.get(field.name);
    if (!before) {
      added.push(field);
    } else if (!fieldsEquivalent(before.raw, field)) {
      changed.push({ name: field.name, before: before.raw, after: field });
    }
  }

  for (const { name } of existingFields) {
    if (RESERVED_FIELD_NAMES.has(name)) continue;
    if (!proposal.fields.some((field) => field.name === name)) {
      removed.push({ name });
    }
  }

  return { added, removed, changed };
}
