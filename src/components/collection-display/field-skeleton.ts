/**
 * @file src/components/collection-display/field-skeleton.ts
 * @description Render-safe form skeleton for the collection field editor.
 *
 * Features:
 * - Seeds every declared field before the first render (schema default, else `null`).
 * - Normalizes translated fields into locale records.
 * - Guarantees no widget ever receives `bind:value={undefined}`: a prop that
 *   declares a fallback (`value = $bindable([])`, e.g. Tags) throws
 *   `props_invalid_value` — "Cannot do `bind:value={undefined}` when `value`
 *   has a fallback value" — and SvelteKit turns that into a 500 page.
 *
 * The editor's effects (`applyFieldDefaults`) run *after* the first mount, so a
 * freshly created editor (SPA "Create" click) used to render once with an empty
 * store. Building the skeleton synchronously closes that window.
 */

import { getFieldName } from "@utils/schema/field-utils";

/** Minimal field shape the skeleton needs. */
export interface SkeletonField {
  label?: string;
  db_fieldName?: string;
  type?: string;
  widget?: { Name?: string };
  default?: unknown;
  translated?: boolean;
}

export interface BuildFieldSkeletonOptions {
  /** Locale used to seed translated field records. */
  locale: string;
  /** New entries take schema defaults; existing entries only fill gaps. */
  isNewEntry: boolean;
}

/**
 * Copy `source` and make sure every declared field has a value.
 *
 * Values already present in `source` are preserved (including `null`, which is
 * a legitimate binding target). Missing keys become the schema default for new
 * entries, otherwise `null`. Translated fields become `{ [locale]: value }`.
 */
export function buildFieldSkeleton(
  source: Record<string, unknown> | null | undefined,
  fieldList: readonly unknown[] | null | undefined,
  { locale, isNewEntry }: BuildFieldSkeletonOptions,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...source };
  if (!fieldList?.length) return out;

  for (const field of fieldList) {
    if (!field || typeof field !== "object") continue;

    const definition = field as SkeletonField;
    const fieldName = getFieldName(definition as Parameters<typeof getFieldName>[0]);
    if (!fieldName || fieldName === "unknown_field") continue;

    const value = out[fieldName];

    if (definition.translated) {
      if (typeof value === "string") {
        out[fieldName] = { [locale]: value };
      } else if (value === null || value === undefined) {
        out[fieldName] = {
          [locale]: isNewEntry && definition.default !== undefined ? definition.default : "",
        };
      }
      continue;
    }

    if (value === undefined) {
      out[fieldName] = isNewEntry && definition.default !== undefined ? definition.default : null;
    }
  }

  return out;
}
