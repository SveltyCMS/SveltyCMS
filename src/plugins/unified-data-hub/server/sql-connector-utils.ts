/**
 * @file src/plugins/unified-data-hub/server/sql-connector-utils.ts
 * @description Shared SQL connector helpers for read/write field mapping and id resolution.
 */

import type { ConnectorRecord, VirtualCollectionRecord } from "../types";
import { FederationError } from "../types";
import { assertIdentifier } from "./sql-dialect";

export function resolveSqlTable(collection: VirtualCollectionRecord): string {
  const table = collection.source.table || collection.slug;
  return assertIdentifier(table, "table name");
}

export function resolveSqlSchema(
  collection: VirtualCollectionRecord,
  connector: ConnectorRecord,
): string | undefined {
  const schema = collection.source.schema ?? (connector.config.schema as string | undefined);
  return schema ? assertIdentifier(schema, "schema") : undefined;
}

export function resolveIdSourceField(collection: VirtualCollectionRecord): string {
  const idField = collection.fields.find((f) => f.name === "id" || f.name === "_id");
  return idField?.sourceField ?? "id";
}

export function mapWritePayloadToColumns(
  collection: VirtualCollectionRecord,
  data: Record<string, unknown>,
): { columns: string[]; values: unknown[] } {
  const columns: string[] = [];
  const values: unknown[] = [];
  const fieldByName = new Map(collection.fields.map((f) => [f.name, f]));

  for (const [key, value] of Object.entries(data)) {
    const field = fieldByName.get(key);
    if (!field) continue;
    if (key === "id" || key === "_id") continue;
    columns.push(assertIdentifier(field.sourceField, "source field"));
    values.push(value);
  }

  return { columns, values };
}

export function parseEntrySourceKey(entryId: string, connectorId: string): string {
  const prefix = `${connectorId}:`;
  if (entryId.startsWith(prefix)) return entryId.slice(prefix.length);
  return entryId;
}

export function assertWritable(connector: ConnectorRecord): void {
  if (!connector.capabilities.writable) {
    throw new FederationError(
      "CONNECTOR_WRITE_NOT_SUPPORTED",
      `Connector type ${connector.type} does not support writes`,
      405,
    );
  }
}
