/**
 * @file src/plugins/unified-data-hub/server/connectors/sqlite.ts
 * @description SQLite file connector for Unified Data Hub (read + write).
 *
 * Features:
 * - Bun native sqlite driver (node:sqlite fallback)
 * - Parameterized queries
 * - Filter/sort pushdown
 */

import { FederationError } from "../../types";
import type { ConnectorRecord, FederatedRow } from "../../types";
import { getPooledSqlite } from "../sqlite-connection-cache";
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
  resolveSqlTable,
} from "../sql-connector-utils";
import { BaseConnector, type ConnectorReadContext, type ConnectorWriteContext } from "./base";

const DIALECT = "sqlite" as const;

export class SqliteConnector extends BaseConnector {
  readonly type = "sqlite" as const;

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

  private async getDb(connector: ConnectorRecord) {
    const filePath = resolveFilePath(connector);
    return getPooledSqlite(String(connector._id), filePath);
  }

  async executeRead(ctx: ConnectorReadContext): Promise<{ rows: FederatedRow[]; total?: number }> {
    const { connector, collection, request } = ctx;
    const table = resolveSqlTable(collection);

    const limit = Math.min(
      Math.max(1, request.limit ?? 25),
      connector.capabilities.maxPageSize ?? 100,
    );
    const offset = Math.max(0, request.offset ?? 0);

    const { query, values } = buildSelectQuery(DIALECT, undefined, table, {
      filter: request.filter,
      filterPushdown: connector.capabilities.filterPushdown,
      sort: request.sort,
      sortPushdown: connector.capabilities.sortPushdown,
      limit,
      offset,
    });

    const db = await this.getDb(connector);
    const rawRows = db.query(query, values).all();
    const rows: FederatedRow[] = rawRows.map((row) => {
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
    const { columns, values } = mapWritePayloadToColumns(collection, data);
    const { query, values: qValues } = buildInsertQuery(DIALECT, undefined, table, columns, values);

    const db = await this.getDb(connector);
    db.query(query, qValues).all();

    const idField = resolveIdSourceField(collection);
    const insertedId = data.id ?? data._id;
    if (insertedId !== undefined) {
      const { query: sel, values: selVals } = buildSelectQuery(DIALECT, undefined, table, {
        filter: { [idField]: insertedId },
        filterPushdown: true,
        limit: 1,
        offset: 0,
      });
      const rows = db.query(sel, selVals).all();
      if (rows[0]) {
        return this.buildRow(
          connector._id,
          resolveSourceKey(rows[0]),
          mapRowFields(rows[0], collection.fields),
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
    const idField = resolveIdSourceField(collection);
    const sourceKey = parseEntrySourceKey(entryId, String(connector._id));
    const { columns, values } = mapWritePayloadToColumns(collection, data);
    const { query, values: qValues } = buildUpdateQuery(
      DIALECT,
      undefined,
      table,
      idField,
      sourceKey,
      columns,
      values,
    );

    const db = await this.getDb(connector);
    db.query(query, qValues).all();

    const { query: sel, values: selVals } = buildSelectQuery(DIALECT, undefined, table, {
      filter: { [idField]: sourceKey },
      filterPushdown: true,
      limit: 1,
      offset: 0,
    });
    const rows = db.query(sel, selVals).all();
    if (!rows[0]) {
      throw new FederationError("VIRTUAL_ENTRY_NOT_FOUND", `Entry not found: ${entryId}`, 404);
    }
    return this.buildRow(
      connector._id,
      resolveSourceKey(rows[0]),
      mapRowFields(rows[0], collection.fields),
    );
  }

  protected async executeDelete(ctx: ConnectorWriteContext): Promise<void> {
    const { connector, collection, entryId } = ctx;
    assertWritable(connector);
    if (!entryId) throw new FederationError("CONNECTOR_WRITE_FAILED", "entryId required", 400);

    const table = resolveSqlTable(collection);
    const idField = resolveIdSourceField(collection);
    const sourceKey = parseEntrySourceKey(entryId, String(connector._id));
    const { query, values } = buildDeleteQuery(DIALECT, undefined, table, idField, sourceKey);

    const db = await this.getDb(connector);
    db.query(query, values).all();
  }

  async healthCheck(connector: ConnectorRecord) {
    try {
      const db = await this.getDb(connector);
      db.query("SELECT 1 AS ok").all();
      return { health: "ok" as const };
    } catch (err) {
      return {
        health: "down" as const,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

function resolveFilePath(connector: ConnectorRecord): string {
  const cfg = connector.config ?? {};
  const creds = connector.credentials ?? {};
  const filePath =
    (cfg.filePath as string) || (cfg.database as string) || (creds.filePath as string) || "";
  if (!filePath) {
    throw new FederationError("CONNECTOR_QUERY_FAILED", "Missing SQLite file path", 500);
  }
  return filePath;
}
