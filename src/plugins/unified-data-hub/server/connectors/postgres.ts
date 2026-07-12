/**
 * @file src/plugins/unified-data-hub/server/connectors/postgres.ts
 * @description Postgres connector for Unified Data Hub (read + write).
 *
 * Features:
 * - Parameterized queries (SQL injection safe)
 * - Filter/sort pushdown when supported
 * - Connection pooling via postgres.js
 */

import { FederationError } from "../../types";
import type { ConnectorRecord, FederatedRow } from "../../types";
import { getPooledPostgres } from "../postgres-pool-cache";
import {
  buildDeleteQuery,
  buildInsertQuery,
  buildSelectQuery,
  buildUpdateQuery,
  mapRowFields,
  resolveSourceKey,
} from "../sql-dialect";
import {
  assertWritable,
  mapWritePayloadToColumns,
  parseEntrySourceKey,
  resolveIdSourceField,
  resolveSqlSchema,
  resolveSqlTable,
} from "../sql-connector-utils";
import { BaseConnector, type ConnectorReadContext, type ConnectorWriteContext } from "./base";

const DIALECT = "postgres" as const;

export class PostgresConnector extends BaseConnector {
  readonly type = "postgres" as const;

  getDefaultCapabilities() {
    return {
      filterPushdown: true,
      sortPushdown: true,
      joinable: false as const,
      maxPageSize: 100,
      supportsTransactions: false,
      staleness: "real-time" as const,
      ttlSeconds: 60,
      writable: true,
    };
  }

  private getSql(connector: ConnectorRecord) {
    const connectionString = resolveConnectionString(connector);
    return getPooledPostgres(String(connector._id), connectionString);
  }

  async executeRead(ctx: ConnectorReadContext): Promise<{ rows: FederatedRow[]; total?: number }> {
    const { connector, collection, request } = ctx;
    const table = resolveSqlTable(collection);
    const schema = resolveSqlSchema(collection, connector);

    const limit = Math.min(
      Math.max(1, request.limit ?? 25),
      connector.capabilities.maxPageSize ?? 100,
    );
    const offset = Math.max(0, request.offset ?? 0);

    const { query, values } = buildSelectQuery(DIALECT, schema, table, {
      filter: request.filter,
      filterPushdown: connector.capabilities.filterPushdown,
      sort: request.sort,
      sortPushdown: connector.capabilities.sortPushdown,
      limit,
      offset,
    });

    const sql = this.getSql(connector);
    const rawRows = await sql.unsafe(query, values as never[]);
    const rows: FederatedRow[] = rawRows.map((row: Record<string, unknown>) => {
      const sourceKey = resolveSourceKey(row);
      return this.buildRow(connector._id, sourceKey, mapRowFields(row, collection.fields));
    });

    return { rows, total: rows.length };
  }

  protected async executeCreate(ctx: ConnectorWriteContext): Promise<FederatedRow> {
    const { connector, collection, data } = ctx;
    assertWritable(connector);
    if (!data || Object.keys(data).length === 0) {
      throw new FederationError("CONNECTOR_WRITE_FAILED", "Create payload required", 400);
    }

    const table = resolveSqlTable(collection);
    const schema = resolveSqlSchema(collection, connector);
    const { columns, values } = mapWritePayloadToColumns(collection, data);
    const { query, values: qValues } = buildInsertQuery(DIALECT, schema, table, columns, values);

    const sql = this.getSql(connector);
    await sql.unsafe(query, qValues as never[]);

    const idField = resolveIdSourceField(collection);
    const insertedId = data.id ?? data._id;
    if (insertedId !== undefined) {
      const { query: sel, values: selVals } = buildSelectQuery(DIALECT, schema, table, {
        filter: { [idField]: insertedId },
        filterPushdown: true,
        limit: 1,
        offset: 0,
      });
      const rows = await sql.unsafe(sel, selVals as never[]);
      if (rows[0]) {
        const row = rows[0] as Record<string, unknown>;
        return this.buildRow(
          connector._id,
          resolveSourceKey(row),
          mapRowFields(row, collection.fields),
        );
      }
    }

    return this.buildRow(connector._id, String(insertedId ?? "new"), data);
  }

  protected async executeUpdate(ctx: ConnectorWriteContext): Promise<FederatedRow> {
    const { connector, collection, data, entryId } = ctx;
    assertWritable(connector);
    if (!entryId) throw new FederationError("CONNECTOR_WRITE_FAILED", "entryId required", 400);
    if (!data || Object.keys(data).length === 0) {
      throw new FederationError("CONNECTOR_WRITE_FAILED", "Update payload required", 400);
    }

    const table = resolveSqlTable(collection);
    const schema = resolveSqlSchema(collection, connector);
    const idField = resolveIdSourceField(collection);
    const sourceKey = parseEntrySourceKey(entryId, String(connector._id));
    const { columns, values } = mapWritePayloadToColumns(collection, data);
    const { query, values: qValues } = buildUpdateQuery(
      DIALECT,
      schema,
      table,
      idField,
      sourceKey,
      columns,
      values,
    );

    const sql = this.getSql(connector);
    await sql.unsafe(query, qValues as never[]);

    const { query: sel, values: selVals } = buildSelectQuery(DIALECT, schema, table, {
      filter: { [idField]: sourceKey },
      filterPushdown: true,
      limit: 1,
      offset: 0,
    });
    const rows = await sql.unsafe(sel, selVals as never[]);
    if (!rows[0]) {
      throw new FederationError("VIRTUAL_ENTRY_NOT_FOUND", `Entry not found: ${entryId}`, 404);
    }
    const row = rows[0] as Record<string, unknown>;
    return this.buildRow(
      connector._id,
      resolveSourceKey(row),
      mapRowFields(row, collection.fields),
    );
  }

  protected async executeDelete(ctx: ConnectorWriteContext): Promise<void> {
    const { connector, collection, entryId } = ctx;
    assertWritable(connector);
    if (!entryId) throw new FederationError("CONNECTOR_WRITE_FAILED", "entryId required", 400);

    const table = resolveSqlTable(collection);
    const schema = resolveSqlSchema(collection, connector);
    const idField = resolveIdSourceField(collection);
    const sourceKey = parseEntrySourceKey(entryId, String(connector._id));
    const { query, values } = buildDeleteQuery(DIALECT, schema, table, idField, sourceKey);

    const sql = this.getSql(connector);
    await sql.unsafe(query, values as never[]);
  }

  async healthCheck(connector: ConnectorRecord) {
    const sql = this.getSql(connector);
    try {
      await sql`SELECT 1 as ok`;
      return { health: "ok" as const };
    } catch (err) {
      return {
        health: "down" as const,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

function resolveConnectionString(connector: ConnectorRecord): string {
  const creds = connector.credentials ?? {};
  const cfg = connector.config ?? {};
  const connectionString =
    (creds.connectionString as string) ||
    (cfg.connectionString as string) ||
    buildConnectionString(connector);

  if (!connectionString) {
    throw new FederationError("CONNECTOR_QUERY_FAILED", "Missing Postgres connection string", 500);
  }
  return connectionString;
}

function buildConnectionString(connector: ConnectorRecord): string {
  const creds = connector.credentials ?? {};
  const cfg = connector.config ?? {};
  const host = (cfg.host as string) || "localhost";
  const port = (cfg.port as number) || 5432;
  const database = (cfg.database as string) || "";
  const user = (creds.username as string) || (cfg.username as string) || "";
  const password = (creds.password as string) || "";
  if (!database || !user) return "";
  const encoded = encodeURIComponent(password);
  return `postgres://${user}:${encoded}@${host}:${port}/${database}`;
}
