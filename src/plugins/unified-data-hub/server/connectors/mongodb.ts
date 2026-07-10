/**
 * @file src/plugins/unified-data-hub/server/connectors/mongodb.ts
 * @description MongoDB connector for Unified Data Hub (read + write).
 *
 * Features:
 * - mongoose connection pooling per connector
 * - Filter/sort pushdown via native find()
 * - insertOne / updateOne / deleteOne writes
 */

import { FederationError } from "../../types";
import type { ConnectorRecord, FederatedRow } from "../../types";
import { getPooledMongoConnection } from "../mongodb-client-cache";
import {
  assertWritable,
  mapWritePayloadToColumns,
  parseEntrySourceKey,
  resolveIdSourceField,
} from "../sql-connector-utils";
import { assertIdentifier } from "../sql-dialect";
import { BaseConnector, type ConnectorReadContext, type ConnectorWriteContext } from "./base";

export class MongoDbConnector extends BaseConnector {
  readonly type = "mongodb" as const;

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

  private resolveCollectionName(collection: ConnectorWriteContext["collection"]): string {
    const name = collection.source.collection || collection.source.table || collection.slug;
    return assertIdentifier(name, "collection name");
  }

  private async getCollection(
    connector: ConnectorRecord,
    collection: ConnectorWriteContext["collection"],
  ) {
    const { connectionString, database } = resolveMongoConfig(connector);
    const conn = await getPooledMongoConnection(String(connector._id), connectionString, database);
    return conn.collection(this.resolveCollectionName(collection));
  }

  private mapDocument(
    connector: ConnectorRecord,
    collection: ConnectorWriteContext["collection"],
    doc: Record<string, unknown>,
  ): FederatedRow {
    const sourceKey = String(doc._id ?? doc.id ?? "");
    const mapped: Record<string, unknown> = {};
    for (const field of collection.fields) {
      mapped[field.name] = doc[field.sourceField] ?? doc[field.name];
    }
    if (mapped.id === undefined && doc._id !== undefined) {
      mapped.id = String(doc._id);
    }
    return this.buildRow(connector._id, sourceKey, mapped);
  }

  private buildMongoFilter(
    collection: ConnectorWriteContext["collection"],
    filter?: Record<string, unknown>,
  ): Record<string, unknown> {
    if (!filter) return {};
    const out: Record<string, unknown> = {};
    const fieldByName = new Map(collection.fields.map((f) => [f.name, f.sourceField]));
    for (const [key, value] of Object.entries(filter)) {
      const sourceField = fieldByName.get(key) ?? key;
      out[sourceField] = value;
    }
    return out;
  }

  async executeRead(ctx: ConnectorReadContext): Promise<{ rows: FederatedRow[]; total?: number }> {
    const { connector, collection, request } = ctx;
    const coll = await this.getCollection(connector, collection);

    const limit = Math.min(
      Math.max(1, request.limit ?? 25),
      connector.capabilities.maxPageSize ?? 100,
    );
    const offset = Math.max(0, request.offset ?? 0);

    const filter = connector.capabilities.filterPushdown
      ? this.buildMongoFilter(collection, request.filter)
      : {};

    let cursor = coll.find(filter).skip(offset).limit(limit);
    if (request.sort?.field && connector.capabilities.sortPushdown) {
      const fieldMap = new Map(collection.fields.map((f) => [f.name, f.sourceField]));
      const sortField = fieldMap.get(request.sort.field) ?? request.sort.field;
      cursor = cursor.sort({ [sortField]: request.sort.direction === "desc" ? -1 : 1 });
    }

    const docs = await cursor.toArray();
    const rows = docs.map((doc) =>
      this.mapDocument(connector, collection, doc as Record<string, unknown>),
    );
    return { rows, total: rows.length };
  }

  protected async executeCreate(ctx: ConnectorWriteContext): Promise<FederatedRow> {
    const { connector, collection, data } = ctx;
    assertWritable(connector);
    if (!data || Object.keys(data).length === 0) {
      throw new FederationError("CONNECTOR_WRITE_FAILED", "Create payload required", 400);
    }

    const coll = await this.getCollection(connector, collection);
    const { columns, values } = mapWritePayloadToColumns(collection, data);
    const doc: Record<string, unknown> = {};
    for (let i = 0; i < columns.length; i++) {
      doc[columns[i]] = values[i];
    }
    const result = await coll.insertOne(doc);
    const inserted = await coll.findOne({ _id: result.insertedId });
    if (!inserted) {
      return this.buildRow(connector._id, String(result.insertedId), data);
    }
    return this.mapDocument(connector, collection, inserted as Record<string, unknown>);
  }

  protected async executeUpdate(ctx: ConnectorWriteContext): Promise<FederatedRow> {
    const { connector, collection, data, entryId } = ctx;
    assertWritable(connector);
    if (!entryId) throw new FederationError("CONNECTOR_WRITE_FAILED", "entryId required", 400);
    if (!data || Object.keys(data).length === 0) {
      throw new FederationError("CONNECTOR_WRITE_FAILED", "Update payload required", 400);
    }

    const coll = await this.getCollection(connector, collection);
    const idField = resolveIdSourceField(collection);
    const sourceKey = parseEntrySourceKey(entryId, String(connector._id));
    const filter: Record<string, unknown> =
      idField === "_id" ? { _id: sourceKey } : { [idField]: sourceKey };

    const { columns, values } = mapWritePayloadToColumns(collection, data);
    const $set: Record<string, unknown> = {};
    for (let i = 0; i < columns.length; i++) {
      $set[columns[i]] = values[i];
    }

    const result = await coll.updateOne(filter, { $set });
    if (result.matchedCount === 0) {
      throw new FederationError("VIRTUAL_ENTRY_NOT_FOUND", `Entry not found: ${entryId}`, 404);
    }

    const updated = await coll.findOne(filter);
    if (!updated) {
      throw new FederationError("VIRTUAL_ENTRY_NOT_FOUND", `Entry not found: ${entryId}`, 404);
    }
    return this.mapDocument(connector, collection, updated as Record<string, unknown>);
  }

  protected async executeDelete(ctx: ConnectorWriteContext): Promise<void> {
    const { connector, collection, entryId } = ctx;
    assertWritable(connector);
    if (!entryId) throw new FederationError("CONNECTOR_WRITE_FAILED", "entryId required", 400);

    const coll = await this.getCollection(connector, collection);
    const idField = resolveIdSourceField(collection);
    const sourceKey = parseEntrySourceKey(entryId, String(connector._id));
    const filter: Record<string, unknown> =
      idField === "_id" ? { _id: sourceKey } : { [idField]: sourceKey };

    const result = await coll.deleteOne(filter);
    if (result.deletedCount === 0) {
      throw new FederationError("VIRTUAL_ENTRY_NOT_FOUND", `Entry not found: ${entryId}`, 404);
    }
  }

  async healthCheck(connector: ConnectorRecord) {
    try {
      const { connectionString, database } = resolveMongoConfig(connector);
      const conn = await getPooledMongoConnection(
        String(connector._id),
        connectionString,
        database,
      );
      await conn.db!.command({ ping: 1 });
      return { health: "ok" as const };
    } catch (err) {
      return {
        health: "down" as const,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

function resolveMongoConfig(connector: ConnectorRecord): {
  connectionString: string;
  database: string;
} {
  const creds = connector.credentials ?? {};
  const cfg = connector.config ?? {};
  const connectionString =
    (creds.connectionString as string) ||
    (cfg.connectionString as string) ||
    buildConnectionString(connector);
  const database = (cfg.database as string) || "";
  if (!connectionString || !database) {
    throw new FederationError("CONNECTOR_QUERY_FAILED", "Missing MongoDB connection config", 500);
  }
  return { connectionString, database };
}

function buildConnectionString(connector: ConnectorRecord): string {
  const creds = connector.credentials ?? {};
  const cfg = connector.config ?? {};
  const host = (cfg.host as string) || "127.0.0.1";
  const port = (cfg.port as number) || 27017;
  const user = (creds.username as string) || (cfg.username as string) || "";
  const password = (creds.password as string) || "";
  if (user) {
    const encoded = encodeURIComponent(password);
    return `mongodb://${user}:${encoded}@${host}:${port}`;
  }
  return `mongodb://${host}:${port}`;
}
