/**
 * @file src/plugins/unified-data-hub/server/sql-dialect.ts
 * @description Shared SQL dialect helpers for Postgres, MariaDB, and SQLite federation connectors.
 *
 * Features:
 * - Identifier validation (SQL injection safe)
 * - Dialect-specific quoting and placeholders
 * - Parameterized SELECT/INSERT/UPDATE/DELETE builders
 */

import { FederationError } from "../types";

export type SqlDialect = "postgres" | "mariadb" | "sqlite";

const IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function assertIdentifier(value: string, label: string): string {
  if (!IDENTIFIER.test(value)) {
    throw new FederationError("CONNECTOR_QUERY_FAILED", `Invalid ${label}: ${value}`, 400);
  }
  return value;
}

export function quoteIdentifier(dialect: SqlDialect, name: string): string {
  const safe = assertIdentifier(name, "identifier");
  if (dialect === "mariadb") return `\`${safe}\``;
  return `"${safe}"`;
}

export function qualifiedTable(
  dialect: SqlDialect,
  schema: string | undefined,
  table: string,
): string {
  const tableQ = quoteIdentifier(dialect, table);
  if (!schema || dialect === "sqlite") return tableQ;
  return `${quoteIdentifier(dialect, schema)}.${tableQ}`;
}

function nextPlaceholder(dialect: SqlDialect, index: number): string {
  return dialect === "postgres" ? `$${index}` : "?";
}

export interface SqlReadParts {
  query: string;
  values: unknown[];
}

export function buildSelectQuery(
  dialect: SqlDialect,
  schema: string | undefined,
  table: string,
  options: {
    filter?: Record<string, unknown>;
    filterPushdown?: boolean;
    sort?: { field: string; direction: "asc" | "desc" };
    sortPushdown?: boolean;
    limit: number;
    offset: number;
  },
): SqlReadParts {
  const tableRef = qualifiedTable(dialect, schema, table);
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (options.filter && options.filterPushdown !== false) {
    for (const [key, value] of Object.entries(options.filter)) {
      const col = quoteIdentifier(dialect, assertIdentifier(key, "filter field"));
      if (Array.isArray(value)) {
        if (value.length === 0) continue;
        if (dialect === "postgres") {
          conditions.push(`${col} = ANY(${nextPlaceholder(dialect, paramIndex++)})`);
          values.push(value);
        } else {
          const placeholders = value.map(() => nextPlaceholder(dialect, paramIndex++));
          conditions.push(`${col} IN (${placeholders.join(", ")})`);
          values.push(...value);
        }
      } else {
        conditions.push(`${col} = ${nextPlaceholder(dialect, paramIndex++)}`);
        values.push(value);
      }
    }
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  let orderClause = "";
  if (options.sort?.field && options.sortPushdown !== false) {
    const sortField = quoteIdentifier(dialect, assertIdentifier(options.sort.field, "sort field"));
    const dir = options.sort.direction === "desc" ? "DESC" : "ASC";
    orderClause = `ORDER BY ${sortField} ${dir}`;
  }

  const limitPh = nextPlaceholder(dialect, paramIndex++);
  const offsetPh = nextPlaceholder(dialect, paramIndex++);
  values.push(options.limit, options.offset);

  const query = `SELECT * FROM ${tableRef} ${whereClause} ${orderClause} LIMIT ${limitPh} OFFSET ${offsetPh}`;
  return { query: query.replace(/\s+/g, " ").trim(), values };
}

export function buildInsertQuery(
  dialect: SqlDialect,
  schema: string | undefined,
  table: string,
  columns: string[],
  rowValues: unknown[],
): SqlReadParts {
  if (columns.length === 0) {
    throw new FederationError("CONNECTOR_WRITE_FAILED", "No writable fields provided", 400);
  }
  const tableRef = qualifiedTable(dialect, schema, table);
  const cols = columns.map((c) => quoteIdentifier(dialect, assertIdentifier(c, "column")));
  const placeholders = columns.map((_, i) => nextPlaceholder(dialect, i + 1));
  const query = `INSERT INTO ${tableRef} (${cols.join(", ")}) VALUES (${placeholders.join(", ")})`;
  return { query, values: rowValues };
}

export function buildUpdateQuery(
  dialect: SqlDialect,
  schema: string | undefined,
  table: string,
  idColumn: string,
  idValue: unknown,
  columns: string[],
  rowValues: unknown[],
): SqlReadParts {
  if (columns.length === 0) {
    throw new FederationError("CONNECTOR_WRITE_FAILED", "No writable fields provided", 400);
  }
  const tableRef = qualifiedTable(dialect, schema, table);
  const sets = columns.map((c, i) => {
    const col = quoteIdentifier(dialect, assertIdentifier(c, "column"));
    return `${col} = ${nextPlaceholder(dialect, i + 1)}`;
  });
  const idPh = nextPlaceholder(dialect, columns.length + 1);
  const idCol = quoteIdentifier(dialect, assertIdentifier(idColumn, "id column"));
  const query = `UPDATE ${tableRef} SET ${sets.join(", ")} WHERE ${idCol} = ${idPh}`;
  return { query, values: [...rowValues, idValue] };
}

export function buildDeleteQuery(
  dialect: SqlDialect,
  schema: string | undefined,
  table: string,
  idColumn: string,
  idValue: unknown,
): SqlReadParts {
  const tableRef = qualifiedTable(dialect, schema, table);
  const idCol = quoteIdentifier(dialect, assertIdentifier(idColumn, "id column"));
  const query = `DELETE FROM ${tableRef} WHERE ${idCol} = ${nextPlaceholder(dialect, 1)}`;
  return { query, values: [idValue] };
}

export function resolveSourceKey(row: Record<string, unknown>): string {
  return String(row.id ?? row._id ?? row.ID ?? JSON.stringify(row).slice(0, 32));
}

export function mapRowFields(
  row: Record<string, unknown>,
  fields: { name: string; sourceField: string }[],
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const field of fields) {
    mapped[field.name] = row[field.sourceField] ?? row[field.name];
  }
  return mapped;
}
