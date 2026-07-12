/**
 * @file src/plugins/unified-data-hub/server/connectors/mariadb.ts
 * @description MariaDB/MySQL connector for Unified Data Hub (read + write).
 *
 * Features:
 * - Parameterized queries via mysql2
 * - Filter/sort pushdown
 * - Per-connector connection pool cache
 */

import { FederationError } from "../../types";
import type { ConnectorRecord, FederatedRow } from "../../types";
import { getPooledMariaDb } from "../mariadb-pool-cache";
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

const DIALECT = "mariadb" as const;

export class MariaDbConnector extends BaseConnector {
  readonly type = "mariadb" as const;

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

  private async getPool(connector: ConnectorRecord) {
    const cfg = connector.config ?? {};
    const creds = connector.credentials ?? {};
    return getPooledMariaDb(String(connector._id), {
      host: (cfg.host as string) || "127.0.0.1",
      port: (cfg.port as number) || 3306,
      database: (cfg.database as string) || "",
      user: (creds.username as string) || (cfg.username as string) || "",
      password: (creds.password as string) || "",
    });
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

    const pool = await this.getPool(connector);
    const [rawRows] = await pool.query(query, values);
    const rows: FederatedRow[] = (rawRows as Record<string, unknown>[]).map((row) => {
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

    const pool = await this.getPool(connector);
    await pool.query(query, qValues);

    const idField = resolveIdSourceField(collection);
    const insertedId = data.id ?? data._id;
    if (insertedId !== undefined) {
      const { query: sel, values: selVals } = buildSelectQuery(DIALECT, schema, table, {
        filter: { [idField]: insertedId },
        filterPushdown: true,
        limit: 1,
        offset: 0,
      });
      const [rows] = await pool.query(sel, selVals);
      const row = (rows as Record<string, unknown>[])[0];
      if (row) {
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

    const pool = await this.getPool(connector);
    await pool.query(query, qValues);

    const { query: sel, values: selVals } = buildSelectQuery(DIALECT, schema, table, {
      filter: { [idField]: sourceKey },
      filterPushdown: true,
      limit: 1,
      offset: 0,
    });
    const [rows] = await pool.query(sel, selVals);
    const row = (rows as Record<string, unknown>[])[0];
    if (!row) {
      throw new FederationError("VIRTUAL_ENTRY_NOT_FOUND", `Entry not found: ${entryId}`, 404);
    }
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

    const pool = await this.getPool(connector);
    await pool.query(query, values);
  }

  async healthCheck(connector: ConnectorRecord) {
    try {
      const pool = await this.getPool(connector);
      await pool.query("SELECT 1 AS ok");
      return { health: "ok" as const };
    } catch (err) {
      return {
        health: "down" as const,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
