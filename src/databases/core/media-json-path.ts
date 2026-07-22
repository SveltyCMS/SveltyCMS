/**
 * @file src/databases/core/media-json-path.ts
 * @description
 * DB-native JSON path conditions for media library queries (large libraries).
 *
 * Pushes `metadata.*` clauses from the gallery JSON-path language into:
 * - SQLite JSON1 (`json_extract`)
 * - PostgreSQL jsonb (`->>` / `#>>`)
 * - MariaDB/MySQL (`JSON_EXTRACT`)
 * - MongoDB dotted-path filters
 *
 * Non-metadata paths and array indices fall back to in-memory filtering.
 *
 * ### Features:
 * - dialect-aware SQL extraction
 * - case-insensitive string eq / contains
 * - numeric comparisons
 * - multi-clause AND
 */

import { sql, type SQL } from "drizzle-orm";
import { type JsonPathClause, type JsonPathOp, parseJsonPathFilter } from "@utils/json-path-filter";

export type MediaJsonSqlDialect = "sqlite" | "postgresql" | "mariadb" | "mysql";

/** Strip `metadata.` prefix; null if not a simple metadata path (no array index). */
export function metadataRelativePath(path: string): string | null {
  if (!path || !path.startsWith("metadata.")) return null;
  const rest = path.slice("metadata.".length);
  if (!rest || rest.includes("[")) return null;
  // Only allow safe path segments (no injection via raw SQL path strings)
  if (!/^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*$/.test(rest)) return null;
  return rest;
}

/** Escape a string for use inside a Mongo $regex (full match / contains). */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Dialect-specific expression extracting a value from the media `metadata` column.
 * `relativePath` is e.g. `camera` or `exif.aperture` (no `metadata.` prefix).
 */
export function metadataJsonExtractSql(dialect: MediaJsonSqlDialect, relativePath: string): SQL {
  if (dialect === "postgresql") {
    if (relativePath.includes(".")) {
      // jsonb path array form: {exif,aperture}
      const pathLiteral = `{${relativePath.split(".").join(",")}}`;
      return sql`metadata#>>${pathLiteral}`;
    }
    return sql`metadata->>${relativePath}`;
  }

  if (dialect === "mariadb" || dialect === "mysql") {
    const path = `$.${relativePath}`;
    return sql`JSON_UNQUOTE(JSON_EXTRACT(metadata, ${path}))`;
  }

  // SQLite JSON1 — metadata is TEXT JSON
  const path = `$.${relativePath}`;
  return sql`json_extract(metadata, ${path})`;
}

function stringCompareSql(
  dialect: MediaJsonSqlDialect,
  extract: SQL,
  op: "eq" | "neq" | "contains",
  value: string,
): SQL {
  const lowerVal = value.toLowerCase();
  // MariaDB doesn't support CAST(... AS TEXT) — JSON_UNQUOTE already returns LONGTEXT
  const skipCast = dialect === "mariadb" || dialect === "mysql";
  if (skipCast) {
    if (op === "contains") {
      return sql`lower(${extract}) LIKE ${"%" + lowerVal + "%"}`;
    }
    if (op === "neq") {
      return sql`lower(${extract}) != ${lowerVal}`;
    }
    return sql`lower(${extract}) = ${lowerVal}`;
  }
  if (op === "contains") {
    return sql`lower(CAST(${extract} AS TEXT)) LIKE ${"%" + lowerVal + "%"}`;
  }
  if (op === "neq") {
    return sql`lower(CAST(${extract} AS TEXT)) != ${lowerVal}`;
  }
  return sql`lower(CAST(${extract} AS TEXT)) = ${lowerVal}`;
}

function numericCompareSql(extract: SQL, op: JsonPathOp, value: string): SQL | null {
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  switch (op) {
    case "gt":
      return sql`CAST(${extract} AS REAL) > ${n}`;
    case "lt":
      return sql`CAST(${extract} AS REAL) < ${n}`;
    case "gte":
      return sql`CAST(${extract} AS REAL) >= ${n}`;
    case "lte":
      return sql`CAST(${extract} AS REAL) <= ${n}`;
    default:
      return null;
  }
}

function clauseToSql(dialect: MediaJsonSqlDialect, clause: JsonPathClause): SQL | null {
  const rel = metadataRelativePath(clause.path);
  if (!rel) return null;
  const extract = metadataJsonExtractSql(dialect, rel);

  if (clause.op === "eq" || clause.op === "neq" || clause.op === "contains") {
    return stringCompareSql(dialect, extract, clause.op, clause.value);
  }
  return numericCompareSql(extract, clause.op, clause.value);
}

/**
 * Build SQL WHERE fragments for a JSON path expression.
 * Clauses that cannot be expressed natively are reported via `unhandled`.
 */
export function buildMediaJsonPathSqlConditions(
  dialect: MediaJsonSqlDialect,
  expression: string,
): { conditions: SQL[]; unhandled: boolean; clauseCount: number } {
  const clauses = parseJsonPathFilter(expression);
  if (clauses.length === 0) {
    return { conditions: [], unhandled: false, clauseCount: 0 };
  }

  const conditions: SQL[] = [];
  let unhandled = false;
  for (const clause of clauses) {
    const cond = clauseToSql(dialect, clause);
    if (!cond) {
      unhandled = true;
      continue;
    }
    conditions.push(cond);
  }
  return { conditions, unhandled, clauseCount: clauses.length };
}

/** Normalize adapter `type` / `dialect` strings to a supported SQL dialect. */
export function resolveMediaJsonSqlDialect(adapter: {
  type?: string;
  dialect?: string;
}): MediaJsonSqlDialect {
  const raw = String(adapter.type || adapter.dialect || "sqlite").toLowerCase();
  if (raw === "postgresql" || raw === "postgres" || raw === "pg") return "postgresql";
  if (raw === "mariadb" || raw === "mysql") return raw === "mysql" ? "mysql" : "mariadb";
  return "sqlite";
}

/**
 * MongoDB filter fragment for media JSON path (AND of clauses).
 * Uses case-insensitive regex for string ops; numeric $gt/$lt/… for numbers.
 */
export function buildMediaJsonPathMongoFilter(expression: string): {
  filter: Record<string, unknown> | null;
  unhandled: boolean;
  clauseCount: number;
} {
  const clauses = parseJsonPathFilter(expression);
  if (clauses.length === 0) {
    return { filter: null, unhandled: false, clauseCount: 0 };
  }

  const parts: Record<string, unknown>[] = [];
  let unhandled = false;

  for (const clause of clauses) {
    // Only push metadata.* without array indices (same as SQL)
    if (!metadataRelativePath(clause.path) && !clause.path.startsWith("metadata.")) {
      // Non-metadata root fields can still use Mongo dotted paths if simple
      if (clause.path.includes("[")) {
        unhandled = true;
        continue;
      }
    } else if (!metadataRelativePath(clause.path)) {
      unhandled = true;
      continue;
    }

    const field = clause.path;
    let part: Record<string, unknown> | null = null;

    switch (clause.op) {
      case "eq":
        part = {
          [field]: { $regex: `^${escapeRegex(clause.value)}$`, $options: "i" },
        };
        break;
      case "neq":
        part = {
          [field]: {
            $not: { $regex: `^${escapeRegex(clause.value)}$`, $options: "i" },
          },
        };
        break;
      case "contains":
        part = {
          [field]: { $regex: escapeRegex(clause.value), $options: "i" },
        };
        break;
      case "gt":
      case "lt":
      case "gte":
      case "lte": {
        const n = Number(clause.value);
        if (Number.isNaN(n)) {
          unhandled = true;
          break;
        }
        const opKey =
          clause.op === "gt"
            ? "$gt"
            : clause.op === "lt"
              ? "$lt"
              : clause.op === "gte"
                ? "$gte"
                : "$lte";
        part = { [field]: { [opKey]: n } };
        break;
      }
      default:
        unhandled = true;
    }

    if (part) parts.push(part);
  }

  if (parts.length === 0) {
    return { filter: null, unhandled: true, clauseCount: clauses.length };
  }
  if (parts.length === 1) {
    return { filter: parts[0]!, unhandled, clauseCount: clauses.length };
  }
  return { filter: { $and: parts }, unhandled, clauseCount: clauses.length };
}
