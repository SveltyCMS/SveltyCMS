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
  // A `Date` has no enumerable own properties, so `Object.values()` sees `[]`
  // and the record branch below would report a filled date field as empty.
  if (value instanceof Date) return Number.isNaN(value.getTime());
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

/**
 * Message shown when the guard refuses to leave a form it could not save.
 * Naming the fields is the difference between "why am I still here?" and a
 * fixable instruction.
 */
export function describeMissingRequiredFields(missing: readonly string[]): string {
  return missing.length > 0
    ? `Not saved — navigation cancelled. Still required: ${missing.join(", ")}.`
    : "Not saved — navigation cancelled. Save the entry before leaving it.";
}

/** Everything the navigation guard needs from the entry form. */
export interface NavigationAutosaveDeps {
  /** Live form state (`collections.activeValue`); mutated nowhere in here. */
  entryData: Record<string, unknown> | null;
  /** The page's initial snapshot, serialized (`initialCollectionValue`). */
  initialSnapshot: string | null;
  fields: readonly FieldDefinition[] | null | undefined;
  now: string;
  /** True while another draft write is in flight. */
  isSaving?: boolean;
  /** Abort the pending navigation — SvelteKit's `beforeNavigate` → `cancel`. */
  cancel: () => void;
  /** Persist the payload; resolves `true` once the draft row landed. */
  saveDraft: (payload: Record<string, unknown>) => Promise<boolean>;
  notify?: (level: "warning" | "success" | "error", message: string) => void;
}

export type NavigationAutosaveOutcome =
  | { action: "skipped"; reason: "no-entry" | "clean" | "saving" }
  /** Untouched form: SvelteKit is not cancelled, the navigation proceeds. */
  | { action: "navigate"; reason: "pristine" }
  /** Navigation cancelled, the form and its edits stay put. */
  | { action: "blocked"; missing: string[] }
  | { action: "saved" }
  | { action: "save-failed" };

/**
 * The body of the entry form's `beforeNavigate` guard.
 *
 * Lives here (rather than inline in `+page.svelte`) so the leave-path itself is
 * testable: which of cancel / skip / write happens is the whole bug surface of
 * M1, and the payload builder alone cannot prove it.
 *
 * Contract:
 * - clean form → skipped, navigation proceeds, no write
 * - untouched Create form (no required field filled, nothing authored) →
 *   navigate, navigation proceeds, no write — the M1 ghost draft
 * - every other form the required-field gate rejects → `cancel()` and a warning
 *   naming what is missing. Autosave refuses such a payload (Save would too),
 *   but a plain skip would let the router navigate and silently discard edits
 *   the user just typed — losing data is worse than keeping them on the form.
 * - valid dirty form → `cancel()`, write the draft, caller resumes navigation
 */
export async function guardNavigationAutosave(
  deps: NavigationAutosaveDeps,
): Promise<NavigationAutosaveOutcome> {
  const notify = deps.notify ?? (() => {});
  const entryData = deps.entryData;
  if (!entryData) return { action: "skipped", reason: "no-entry" };

  // The editor normalizes the field skeleton on mount (a translated `null`
  // becomes `{ en: "" }`), so the serialized form can differ from the page's
  // initial snapshot without the user having touched anything.
  const hasUnsavedChanges = JSON.stringify(entryData) !== deps.initialSnapshot;
  if (!hasUnsavedChanges) return { action: "skipped", reason: "clean" };
  if (deps.isSaving) return { action: "skipped", reason: "saving" };

  let loadedData: Record<string, unknown> | null = null;
  try {
    loadedData = deps.initialSnapshot
      ? (JSON.parse(deps.initialSnapshot) as Record<string, unknown>)
      : null;
  } catch {
    loadedData = null;
  }

  const payload = buildAutosavePayload(entryData, loadedData, deps.now, deps.fields ?? []);
  if (!payload) {
    // Only a form with no authored content may be left silently.
    if (isPristineEntry(entryData)) return { action: "navigate", reason: "pristine" };

    const missing = findMissingRequiredFields(entryData, deps.fields);
    deps.cancel();
    notify("warning", describeMissingRequiredFields(missing));
    return { action: "blocked", missing };
  }

  // Cancel only once the write is certain, so a skip above never cancels the
  // user's Back/Reload.
  deps.cancel();

  const saved = await deps.saveDraft(payload);
  if (!saved) {
    notify("error", "Failed to auto-save. Please save manually.");
    return { action: "save-failed" };
  }
  notify("success", "Changes auto-saved");
  return { action: "saved" };
}
