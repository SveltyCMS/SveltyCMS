/**
 * @file src/databases/core/column-renames.ts
 * @description Declared `renamedFrom` replay for system and collection tables.
 *
 * A system `ColumnSpec.renamedFrom` or a collection field `renamedFrom` renames
 * the physical column when the old name exists in the live catalog and the new
 * one does not. Renames run before `ADD COLUMN` on every provisioning path
 * (system bootstrap + the four adapters), so an existing database converges on
 * the spec without a manual migration. A failed rename is retried on the next
 * provisioning call; schemas without `renamedFrom` cost one array scan.
 *
 * ### Features:
 * - `planColumnReconcile` — pure plan for the system-schema bootstrap (lowercased live set)
 * - `applyDeclaredFieldRenames` — once-per-table catalog check + `ALTER TABLE … RENAME COLUMN`
 * - `applyMongoFieldRenames` — `$rename` once per model, idempotent across restarts
 * - `materializedSqlType` — exact string column types (`decimal`, `bigint`, `calendarDay`, `bytes`)
 * - `hasDeclaredFieldRename` — zero-cost guard for rename-free schemas
 */

import { logger } from "@utils/logger";
import { assertSafeSqlIdentifier } from "./relational-utils";
import type { ColumnSpec } from "../system-schema-spec";

export type RenameDialect = "sqlite" | "postgresql" | "mariadb";

/** A single declared rename: old physical name → current physical name. */
interface DeclaredRename {
  from: string;
  to: string;
}

/**
 * Resolve the declared rename of one field object.
 *
 * The target name mirrors the materialization paths (`db_fieldName`, then
 * `label`, then `name`) so a rename and the column it renames agree.
 * Returns null for rename-free or malformed fields.
 */
function declaredRenameOf(field: unknown): DeclaredRename | null {
  if (!field || typeof field !== "object") return null;
  const record = field as Record<string, unknown>;
  const from = typeof record.renamedFrom === "string" ? record.renamedFrom.trim() : "";
  if (!from) return null;
  const candidates = [record.db_fieldName, record.label, record.name];
  let to = "";
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      to = candidate.trim();
      break;
    }
  }
  if (!to || to === from) return null;
  return { from, to };
}

/**
 * True when any field declares `renamedFrom`. Adapters call this before any
 * catalog query so rename-free schemas skip the round trip entirely.
 */
export function hasDeclaredFieldRename(fields: unknown): boolean {
  if (!Array.isArray(fields)) return false;
  for (let i = 0; i < fields.length; i++) {
    if (declaredRenameOf(fields[i])) return true;
  }
  return false;
}

/**
 * System-schema reconcile plan for one column.
 *
 * `have` is the lowercased live column set (see `readLiveColumns`), so the
 * match is case-insensitive while the returned `from` keeps the declared case —
 * PostgreSQL system columns are created quoted from the spec, and a quoted
 * `RENAME COLUMN` is case-sensitive.
 */
export type ColumnReconcilePlan = { action: "skip" } | { action: "rename"; from: string };

export function planColumnReconcile(
  have: ReadonlySet<string>,
  column: Pick<ColumnSpec, "name" | "renamedFrom">,
): ColumnReconcilePlan {
  const name = typeof column.name === "string" ? column.name : "";
  if (!name) return { action: "skip" };
  const renamedFrom = typeof column.renamedFrom === "string" ? column.renamedFrom.trim() : "";
  if (!renamedFrom) return { action: "skip" };
  const lowerName = name.toLowerCase();
  const lowerFrom = renamedFrom.toLowerCase();
  if (lowerFrom === lowerName) return { action: "skip" };
  if (have.has(lowerFrom) && !have.has(lowerName)) {
    return { action: "rename", from: renamedFrom };
  }
  return { action: "skip" };
}

export interface DeclaredFieldRenamesOptions {
  dialect: RenameDialect;
  /** Dedup key — `"<dialect>:<normalized collection id>"` (once per process). */
  tableKey: string;
  /** Physical table name (unquoted). */
  physicalName: string;
  fields: unknown;
  /** Live column names in their stored case; empty when the table is absent. */
  listColumns: () => Promise<Set<string>>;
  execute: (sqlText: string, params?: unknown[]) => Promise<unknown>;
}

/** Tables whose rename pass completed (nothing left to rename) in this process. */
const renameResolvedTables = new Set<string>();

function quoteIdentifier(dialect: RenameDialect, name: string): string {
  if (dialect === "mariadb") return `\`${name.replace(/`/g, "``")}\``;
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Replay declared field renames for one collection table.
 *
 * Renames the stored (actual-case) old column to the declared new name when the
 * new column does not exist yet. The live catalog is consulted once per table
 * per process; a failure is logged and retried on the next provisioning call,
 * never thrown — provisioning must not fail because a rename could not run.
 */
export async function applyDeclaredFieldRenames(
  options: DeclaredFieldRenamesOptions,
): Promise<void> {
  if (!hasDeclaredFieldRename(options.fields)) return;
  if (renameResolvedTables.has(options.tableKey)) return;

  let live: Set<string>;
  try {
    live = await options.listColumns();
  } catch (err) {
    logger.debug(
      `[${options.dialect}] Column catalog read failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }
  // An empty catalog means the table does not exist yet — CREATE will use the
  // declared names, so there is nothing to rename (and the check stays open
  // in case this process provisions against an already-populated table later).
  if (!live || live.size === 0) return;

  const byLowerCase = new Map<string, string>();
  for (const name of live) byLowerCase.set(name.toLowerCase(), name);

  let unresolved = false;
  for (const field of options.fields as unknown[]) {
    const rename = declaredRenameOf(field);
    if (!rename) continue;
    let from: string;
    let to: string;
    try {
      from = assertSafeSqlIdentifier(rename.from, "renamedFrom");
      to = assertSafeSqlIdentifier(rename.to, "column");
    } catch (err) {
      logger.warn(
        `[${options.dialect}] Column rename skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
      continue;
    }

    const actualFrom = byLowerCase.get(from.toLowerCase());
    if (!actualFrom) continue; // old column absent — ADD (if needed) uses the new name
    if (byLowerCase.has(to.toLowerCase())) continue; // already renamed (idempotent)

    const sqlText = `ALTER TABLE ${quoteIdentifier(options.dialect, options.physicalName)} RENAME COLUMN ${quoteIdentifier(options.dialect, actualFrom)} TO ${quoteIdentifier(options.dialect, to)}`;
    try {
      await options.execute(sqlText);
      byLowerCase.delete(actualFrom.toLowerCase());
      byLowerCase.set(to.toLowerCase(), to);
      logger.info(
        `[${options.dialect}] Renamed column ${actualFrom} → ${to} on ${options.physicalName}`,
      );
    } catch (err) {
      unresolved = true;
      logger.warn(
        `[${options.dialect}] Column rename failed (will retry): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (!unresolved) renameResolvedTables.add(options.tableKey);
}

/** Models whose `$rename` pass completed in this process (idempotent). */
const mongoRenamedModels = new WeakSet<object>();

/**
 * Replay declared field renames on a Mongoose model.
 *
 * `$rename` is idempotent: after the first pass no document carries the old
 * key, so re-runs (model recreation, rollback) are no-ops. Failures are logged
 * and retried while the model instance is reused.
 */
export async function applyMongoFieldRenames(model: unknown, fields: unknown): Promise<void> {
  if (!model || (typeof model !== "object" && typeof model !== "function")) return;
  if (!hasDeclaredFieldRename(fields)) return;
  const key = model as object;
  if (mongoRenamedModels.has(key)) return;

  const updateMany = (
    model as { updateMany?: (filter: unknown, update: unknown) => Promise<unknown> }
  ).updateMany;
  if (typeof updateMany !== "function") return;

  let unresolved = false;
  for (const field of fields as unknown[]) {
    const rename = declaredRenameOf(field);
    if (!rename) continue;
    try {
      await updateMany.call(
        model,
        { [rename.from]: { $exists: true } },
        { $rename: { [rename.from]: rename.to } },
      );
    } catch (err) {
      unresolved = true;
      logger.debug(
        `[mongodb] Field rename ${rename.from} → ${rename.to} failed (will retry): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
  if (!unresolved) mongoRenamedModels.add(key);
}

/**
 * Exact string column types — the value must survive as stored bytes/text, so
 * `number`-style coercion never applies. SQLite stores `TEXT`; PostgreSQL and
 * MariaDB keep bounded widths where a width is meaningful (`calendarDay` is
 * `YYYY-MM-DD`).
 */
const EXACT_COLUMN_TYPES: Record<string, Record<RenameDialect, string>> = {
  decimal: { sqlite: "TEXT", postgresql: "VARCHAR(64)", mariadb: "VARCHAR(64)" },
  bigint: { sqlite: "TEXT", postgresql: "VARCHAR(64)", mariadb: "VARCHAR(64)" },
  calendarDay: { sqlite: "TEXT", postgresql: "VARCHAR(10)", mariadb: "VARCHAR(10)" },
  bytes: { sqlite: "TEXT", postgresql: "TEXT", mariadb: "TEXT" },
};

/**
 * Physical SQL type for an exact string field, or null when the type is not an
 * exact string type (the adapters then apply their numeric/boolean defaults).
 */
export function materializedSqlType(dialect: RenameDialect, fieldType: unknown): string | null {
  if (typeof fieldType !== "string") return null;
  const entry = EXACT_COLUMN_TYPES[fieldType];
  if (!entry) return null;
  return entry[dialect] ?? null;
}
