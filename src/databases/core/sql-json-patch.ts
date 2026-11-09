/**
 * @file src/databases/core/sql-json-patch.ts
 * @description
 * JSON partial-update and RFC 7396 hydration pipelines for SQL database adapters.
 * Implements lost-update-free JSON column updates, dialect merge wrapping,
 * and key-level patch validation.
 *
 * ### Features:
 * - RFC 7396 hydration and shallow JS merging when SQL operators cannot express patch
 * - Zero-read dialect JSON merge expressions (PostgreSQL jsonb ||, SQLite json_patch, MariaDB JSON_MERGE_PATCH)
 * - Lost-update-free key-level JSON updates (jsonKeyPatchSetValue)
 * - Safe top-level key assertion and strict serialization
 */

import type { BaseQueryOptions, DatabaseId } from "../db-interface";
import { sql, type SQL } from "drizzle-orm";
import { clearJsonDataPatch, getJsonDataPatch, jsonPatchNeedsJsMerge } from "./query-primitives";
import { assertSafeSqlIdentifier } from "./relational-utils";

// ---------------------------------------------------------------------------
// JSON partial-update merge primitives (shared by every SQL dialect)
// ---------------------------------------------------------------------------

/**
 * - `"operator"` — the dialect's merge operator is an exact shallow merge
 *   (PostgreSQL `jsonb || jsonb`); any patch merges in SQL.
 * - `"subset"` — the operator is RFC 7396 (recursive, null-deleting); only
 *   scalar/array patches may stay in SQL, everything else hydrates in JS.
 */
export type JsonPatchMergeMode = "operator" | "subset";

/** PostgreSQL's default wrapper: `COALESCE("data", '{}'::jsonb) || $1::jsonb`. */
const DEFAULT_JSON_MERGE_WRAPPER: { prefix: string; suffix: string } = {
  prefix: `COALESCE("data", '{}'::jsonb) || `,
  suffix: `::jsonb`,
};

export function jsonMergeWrapperExpression(colSql: string): { prefix: string; suffix: string } {
  if (colSql === `"data"`) return DEFAULT_JSON_MERGE_WRAPPER;
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

/**
 * Structural contract required by the JSON patch pipeline from the SQL adapter.
 */
export interface SqlJsonPatchContext {
  readonly shouldJsonSerializeInPrepare: boolean;
  readonly jsonPatchMergeMode: JsonPatchMergeMode;
  readJsonDataColumn(
    table: any,
    id: DatabaseId,
    options: BaseQueryOptions,
  ): Promise<Record<string, unknown> | null>;
  jsonMergeWrapper(colSql: string): { prefix: string; suffix: string };
  getColumn(table: any, name: string): any;
  quoteIdentifier(name: string): string;
  jsonKeyPatchExpression(colSql: string, entries: ReadonlyArray<readonly [string, string]>): SQL;
}

/**
 * Validates that a patch key addresses exactly one top-level identifier.
 */
export function assertTopLevelJsonPatchKey(key: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    throw new Error(
      `Unsupported JSON patch key "${key}": key-level patching addresses top-level keys only ` +
        `(a nested path is created by SQLite, ignored by MariaDB, a no-op on PostgreSQL)`,
    );
  }
  return key;
}

/**
 * Serializes a patch value ensuring no undefined values are written.
 */
export function serializeJsonPatchValue(key: string, value: unknown): string {
  if (value === undefined) {
    throw new Error(
      `JSON patch value for "${key}" is undefined (no JSON representation) — omit the key`,
    );
  }
  const text = JSON.stringify(value);
  if (typeof text !== "string") {
    throw new Error(`JSON patch value for "${key}" is not JSON-serializable`);
  }
  return text;
}

/**
 * Merge a partial-update JSON patch into `values.data` in JS, reading the
 * stored blob first.
 */
export async function hydrateSqlJsonDataPatch(
  ctx: SqlJsonPatchContext,
  values: Record<string, unknown>,
  table: any,
  id: DatabaseId,
  options: BaseQueryOptions,
): Promise<void> {
  const patch = getJsonDataPatch(values);
  if (!patch) return;
  const stored = await ctx.readJsonDataColumn(table, id, options);
  if (stored === null) {
    throw new Error(
      `Cannot merge partial update: no row "${String(id)}" to merge into (fail-closed, nothing written)`,
    );
  }
  const merged = mergeJsonPatchShallow(stored, patch);
  values.data = ctx.shouldJsonSerializeInPrepare ? JSON.stringify(merged) || "{}" : merged;
  clearJsonDataPatch(values);
}

/**
 * Build SQL value for merging a JSON patch in one statement.
 */
export function buildJsonMergeSetValue(
  ctx: SqlJsonPatchContext,
  table: any,
  patch: Record<string, unknown>,
): SQL {
  const physName = ctx.getColumn(table, "data")?.name ?? "data";
  const wrapper = ctx.jsonMergeWrapper(
    ctx.quoteIdentifier(assertSafeSqlIdentifier(physName, "column")),
  );
  return jsonMergeSqlValue(wrapper, patch);
}

/**
 * Inject the dialect merge operator into Drizzle `.set()` values.
 */
export function applySqlJsonMergeToSet(
  ctx: SqlJsonPatchContext,
  values: Record<string, unknown>,
  table: any,
  patch: Record<string, unknown>,
): void {
  values.data = buildJsonMergeSetValue(ctx, table, patch);
  clearJsonDataPatch(values);
}

/**
 * Merge-aware Drizzle `.set()` values: injects the dialect merge operator for
 * the `data` blob when the patch is expressible in one statement, and hydrates
 * + merges in JS when it is not.
 */
export async function mergeSqlJsonPatchIntoSet(
  ctx: SqlJsonPatchContext,
  values: Record<string, unknown>,
  table: any,
  id: DatabaseId,
  options: BaseQueryOptions,
): Promise<void> {
  const patch = getJsonDataPatch(values);
  if (!patch) return;
  if (canMergeJsonPatchInOneStatement(ctx.jsonPatchMergeMode, patch)) {
    applySqlJsonMergeToSet(ctx, values, table, patch);
    return;
  }
  await hydrateSqlJsonDataPatch(ctx, values, table, id, options);
}

/**
 * Drizzle `.set()` value that patches individual top-level keys of one JSON
 * column *inside* the UPDATE.
 */
export function buildJsonKeyPatchSetValue(
  ctx: SqlJsonPatchContext,
  table: any,
  column: string,
  patch: Record<string, unknown>,
): SQL {
  const physName = ctx.getColumn(table, column)?.name ?? column;
  const colSql = ctx.quoteIdentifier(assertSafeSqlIdentifier(physName, "column"));
  const entries = Object.entries(patch).map(
    ([key, value]) =>
      [assertTopLevelJsonPatchKey(key), serializeJsonPatchValue(key, value)] as const,
  );
  return ctx.jsonKeyPatchExpression(colSql, entries);
}
