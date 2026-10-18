/**
 * @file src/databases/sql/json-merge.ts
 * @description
 * Pure helpers for merging a partial-update JSON patch into the `data` blob.
 * The dialect decides whether the merge can happen inside one UPDATE statement
 * (PostgreSQL `jsonb || jsonb`) or must hydrate the stored blob first (SQLite
 * `json_patch` / MariaDB `JSON_MERGE_PATCH`, both RFC 7396). Keeping the
 * decision and the JS merge here makes the contract explicit and testable.
 *
 * ### Features:
 * - dialect merge-wrapper expressions (PostgreSQL default, overridable)
 * - exactness boundary for one-statement merges (`jsonPatchNeedsJsMerge`)
 * - shallow, null-keeping JS merge matching MongoDB's per-field `$set`
 * - Drizzle `SQL` builder for the bound patch parameter
 */

import { sql, type SQL } from "drizzle-orm";
import { jsonPatchNeedsJsMerge } from "../core/query-primitives";

/**
 * - `"operator"` — the dialect's merge operator is an exact shallow merge
 *   (PostgreSQL `jsonb || jsonb`); any patch merges in SQL.
 * - `"subset"` — the operator is RFC 7396 (recursive, null-deleting); only
 *   scalar/array patches may stay in SQL, everything else hydrates in JS.
 */
export type JsonPatchMergeMode = "operator" | "subset";

/** PostgreSQL's default wrapper: `COALESCE("data", '{}'::jsonb) || $1::jsonb`. */
export function jsonMergeWrapperExpression(colSql: string): { prefix: string; suffix: string } {
  return { prefix: `COALESCE(${colSql}, '{}'::jsonb) || `, suffix: `::jsonb` };
}

/**
 * Can the live JSON patch be merged inside ONE statement on this dialect?
 * "operator" dialects always can; "subset" dialects only for the patches
 * `json_patch`/`JSON_MERGE_PATCH` express identically to a shallow merge.
 */
export function canMergeJsonPatchInOneStatement(
  mode: JsonPatchMergeMode,
  patch: Record<string, unknown>,
): boolean {
  return mode === "operator" || !jsonPatchNeedsJsMerge(patch);
}

/**
 * Shallow merge used when the dialect operator would recurse or delete keys:
 * every patch key replaces the stored value, explicit `null` is kept.
 */
export function mergeJsonPatchShallow(
  stored: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...stored };
  for (const key in patch) {
    if (Object.hasOwn(patch, key)) merged[key] = patch[key];
  }
  return merged;
}

/**
 * Drizzle SET value for the JSON `data` column: a bound patch parameter wrapped
 * in the dialect merge operator. The patch is passed as a parameter, never
 * interpolated into the SQL text.
 */
export function jsonMergeSqlValue(
  wrapper: { prefix: string; suffix: string },
  patch: Record<string, unknown>,
): SQL {
  return sql`${sql.raw(wrapper.prefix)}${JSON.stringify(patch)}${sql.raw(wrapper.suffix)}`;
}
