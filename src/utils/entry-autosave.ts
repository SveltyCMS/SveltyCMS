/**
 * @file src/utils/entry-autosave.ts
 * @description Builds the navigation-guard autosave payload without demoting live entries.
 *
 * ### Features:
 * - New entries are saved as `draft`
 * - Existing entries keep their loaded status instead of being forced to `draft`
 * - A loaded schedule timestamp is preserved; one added only in the form is dropped
 * - An untouched Create form produces no payload at all (nothing to save)
 * - Required fields are enforced with the same schema gate the Save button uses,
 *   so no write path can persist a row the form itself refuses to submit
 */

import { getFieldName } from "@utils/schema/field-utils";
import { isFieldRequired, isFieldVisible } from "@src/widgets/desugar-field";
import type { FieldDefinition } from "@src/content/types";

/**
 * The subset of a schema field the required-field gate reads.
 *
 * `Schema['fields']` is a `FieldDefinition[]` union (widget placeholders carry
 * no declared flags), so the gate narrows each entry to this shape instead of
 * demanding a fully materialized `FieldInstance`.
 */
export interface AutosaveGateField {
  label?: string;
  db_fieldName?: string;
  name?: string;
  required?: boolean;
  requiredIf?: Parameters<typeof isFieldRequired>[0]["requiredIf"];
  showIf?: Parameters<typeof isFieldVisible>[0]["showIf"];
}

/**
 * Keys the client never authors in the form. They are stamped by the store and
 * the write lane (`status`, audit stamps) and must not make an otherwise empty
 * Create form look like user content.
 */
const NON_AUTHORED_KEYS = new Set([
  "_id",
  "status",
  "createdAt",
  "updatedAt",
  "createdBy",
  "updatedBy",
  "_scheduled",
  "_scheduledBy",
]);

/**
 * True for a value that carries no authored content: `null`, blank strings,
 * empty arrays, and records whose values are all empty (a translated field
 * seeded as `{ en: "" }`).
 */
export function isEmptyEntryValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (typeof value === "boolean" || typeof value === "number") return false;
  if (Array.isArray(value)) return value.every((item) => isEmptyEntryValue(item));
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).every((item) => isEmptyEntryValue(item));
  }
  return false;
}

/**
 * True when the entry holds no authored content — a freshly opened Create form.
 *
 * The editor normalizes the form skeleton on mount (a translated field seeded as
 * `null` becomes `{ en: "" }`), so a pristine form is not byte-identical to its
 * initial snapshot. Judging the *content* instead of the serialized form is what
 * keeps Reload/Back on an untouched Create form from writing a blank draft row.
 */
export function isPristineEntry(entryData: Record<string, unknown> | null | undefined): boolean {
  if (!entryData) return true;
  for (const [key, value] of Object.entries(entryData)) {
    if (NON_AUTHORED_KEYS.has(key)) continue;
    if (!isEmptyEntryValue(value)) return false;
  }
  return true;
}

/**
 * Required fields the form still has to fill — the gate behind the Save button
 * in `header-edit.svelte` (its disabled state is `validationStore.isValid`,
 * fed by the same `isFieldRequired` / `isFieldVisible` primitives).
 *
 * Returns field labels so the caller can tell the user *what* is missing.
 */
export function findMissingRequiredFields(
  entryData: Record<string, unknown> | null | undefined,
  fields: readonly FieldDefinition[] | null | undefined,
): string[] {
  if (!fields?.length) return [];
  const data = entryData ?? {};
  const missing: string[] = [];
  for (const raw of fields) {
    const field = raw as unknown as AutosaveGateField;
    if (!isFieldRequired(field, data)) continue;
    if (!isFieldVisible(field, data)) continue;
    const fieldName = getFieldName(field as Parameters<typeof getFieldName>[0], false);
    if (!fieldName || fieldName === "unknown_field") continue;
    if (isEmptyEntryValue(data[fieldName])) missing.push(String(field.label || fieldName));
  }
  return missing;
}

/**
 * Build the payload used by the editor's navigation-guard autosave.
 *
 * Returns `null` — "do not write" — when the form has nothing worth saving (an
 * untouched Create form) or when it violates the required-field gate. Callers
 * must treat `null` as a skip, never as an empty payload.
 */
export function buildAutosavePayload(
  entryData: Record<string, unknown>,
  loadedData: Record<string, unknown> | null,
  now: string,
  fields: readonly FieldDefinition[] | null | undefined,
): Record<string, unknown> | null {
  // Required-field gate: the same rules the Save button enforces, so autosave
  // can no longer persist a row the form itself refuses to submit.
  if (findMissingRequiredFields(entryData, fields).length > 0) return null;

  if (!entryData._id) {
    // Nothing typed yet: mount-time skeleton normalization made the form look
    // dirty, but there is no authored content to keep.
    if (isPristineEntry(entryData)) return null;
    return { ...entryData, status: "draft", updatedAt: now };
  }

  const payload: Record<string, unknown> = {
    ...entryData,
    status: loadedData?.status ?? entryData.status ?? "draft",
    updatedAt: now,
  };

  // Autosave must never introduce a schedule that has no job behind it. Keep
  // the loaded timestamp only when the persisted entry already had one.
  if (loadedData && Object.hasOwn(loadedData, "_scheduled")) {
    payload._scheduled = loadedData._scheduled;
  } else {
    delete payload._scheduled;
  }
  delete payload._scheduledBy;

  return payload;
}
