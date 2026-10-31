/**
 * @file src/utils/entry-values.ts
 * @description One mapping from a stored entry document to the two consumers that read it.
 *
 * | Consumer | Needs | Mode |
 * | -------- | ----- | ---- |
 * | Entry list / table | one language, read-only display | `list` |
 * | Entry editor form  | every language, exactly as stored | `form` |
 *
 * Why this module exists (blocker B2, audit 2026-10-31): the list projection
 * used to live inline in `CollectionService.loadCollectionData` and wrote the
 * display placeholder `"-"` into the row for every empty translated cell. Any
 * consumer that treated a list row as an entry — the row-click → editor handoff
 * did exactly that — therefore started with an empty rich-text body and `"-"` in
 * every empty field, and saving wrote that projection back over the stored
 * document (all other languages and the rich-text payload destroyed).
 *
 * Rules encoded here:
 * - Resolving a value NEVER invents one. Empty stays `""`; how emptiness looks
 *   is a render concern (`entry-list-cell.svelte` draws the en dash).
 * - `list` mode never mutates the stored row (the row may be shared with the
 *   SDK/L2 cache) — it returns a shallow copy.
 * - `form` mode keeps every locale and normalizes only the legacy shapes the
 *   editor already understands (plain string → `{ [language]: value }`).
 */

import { deepClone } from "./native-utils";
import { isLocaleMap } from "./locale-map";

/** Maximum locale layers peeled (`{ en: { en: … } }` double wraps exist in the wild). */
const MAX_LOCALE_DEPTH = 4;

export type EntryValueMode = "list" | "form";

/** Minimal schema-field shape this mapping reads. */
interface MappableField {
  translated?: boolean;
  db_fieldName?: string;
  label?: string;
  name?: string;
}

export interface MapEntryValuesOptions {
  language: string;
  mode: EntryValueMode;
}

/**
 * Resolve a stored value to one language layer.
 *
 * `{ en: "<p>x</p>", de: "" }` + `en` → `"<p>x</p>"`.
 * `{ en: "", de: "Zwei" }` + `en` → `""` (no cross-language fallback: an empty
 * English cell must not display German text, and the form must stay empty).
 * Structured payloads (`{ title, content }`, SEO objects) are not locale maps
 * and are returned untouched.
 */
export function resolveLocalizedValue(value: unknown, language: string): unknown {
  let current: unknown = value;

  for (let depth = 0; depth < MAX_LOCALE_DEPTH; depth++) {
    if (current === null || current === undefined) return "";
    // `{}` is how an untouched structured field is stored — empty, not content.
    if (
      typeof current === "object" &&
      !Array.isArray(current) &&
      Object.keys(current).length === 0
    ) {
      return "";
    }
    if (!isLocaleMap(current)) return current;
    if (!Object.hasOwn(current, language)) return "";
    current = (current as Record<string, unknown>)[language];
  }

  return current ?? "";
}

/** Field key used by the stored document (never the display label). */
function fieldKey(field: MappableField): string {
  return field.db_fieldName || field.name || field.label || "";
}

/**
 * Map an entry document for one consumer.
 *
 * - `list`: translated object fields become their `language` layer (missing or
 *   empty → `""`, never a placeholder).
 * - `form`: translated fields become locale records with every language kept;
 *   a legacy plain string is wrapped as `{ [language]: value }` and a missing
 *   value as `{ [language]: "" }`, so the editor always receives a record.
 *
 * Never mutates `entry`.
 */
export function mapEntryValues<T extends Record<string, unknown>>(
  entry: T,
  fields: readonly unknown[] | null | undefined,
  options: MapEntryValuesOptions,
): T {
  const mapped: Record<string, unknown> = { ...entry };
  const { language, mode } = options;

  if (!Array.isArray(fields)) return mapped as T;

  for (const rawField of fields) {
    const field = rawField as MappableField | null;
    if (!field || typeof field !== "object" || !field.translated) continue;

    const key = fieldKey(field);
    if (!key) continue;

    const value = mapped[key];

    if (mode === "list") {
      // Project locale maps (and empty structured placeholders) to this
      // language; plain values (legacy strings, numbers) are display-ready.
      if (value && typeof value === "object" && !Array.isArray(value)) {
        mapped[key] = resolveLocalizedValue(value, language);
      }
      continue;
    }

    if (typeof value === "string") {
      mapped[key] = { [language]: value };
    } else if (value === null || value === undefined) {
      mapped[key] = { [language]: "" };
    } else if (typeof value === "object" && !Array.isArray(value)) {
      // Keep every locale; the editor must be able to write them all back.
      mapped[key] = deepClone(value);
    }
  }

  return mapped as T;
}

/** Result shape of a point read (`GET /api/collections/:collection/:entry`). */
export interface EntryReadResult {
  success: boolean;
  data?: unknown;
  error?: string;
  message?: string;
}

/** Injected reader so the handoff stays unit-testable without a server. */
export type EntryReader = (collectionId: string, entryId: string) => Promise<EntryReadResult>;

export type LoadEntryFormValuesResult =
  | { ok: true; values: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * Load the editor snapshot for `entryId` from the stored document.
 *
 * This is the handoff the list owes the editor: a list row is a display
 * projection (one language, formatted) and must never seed a form. Exactly one
 * read happens per call — never one per row.
 */
export async function loadEntryFormValues(input: {
  collectionId: string;
  entryId: string;
  fields: readonly unknown[] | null | undefined;
  language: string;
  readEntry: EntryReader;
}): Promise<LoadEntryFormValuesResult> {
  const { collectionId, entryId, fields, language, readEntry } = input;

  if (!collectionId || !entryId) {
    return { ok: false, error: "Missing collection or entry id" };
  }

  let result: EntryReadResult;
  try {
    result = await readEntry(collectionId, entryId);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Entry request failed",
    };
  }

  const row = result?.success ? result.data : undefined;
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return { ok: false, error: result?.message || result?.error || "Entry not found" };
  }

  // A read that answers with a different row would silently edit the wrong entry.
  const storedId = (row as Record<string, unknown>)._id;
  if (storedId !== undefined && String(storedId) !== entryId) {
    return { ok: false, error: "Entry response does not match the requested id" };
  }

  return {
    ok: true,
    values: mapEntryValues(row as Record<string, unknown>, fields, {
      language,
      mode: "form",
    }),
  };
}
