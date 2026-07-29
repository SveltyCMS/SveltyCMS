/**
 * @file src/plugins/unified-data-hub/server/connector-registry.ts
 * @description Connector registry — loads connectors and virtual schemas from plugin collections.
 *
 * Features:
 * - Tenant-scoped connector resolution
 * - Connector instance factory
 * - Sanitized public views (no credentials)
 */

import type { DatabaseId, IDBAdapter } from "@databases/db-interface";
import { nowISODateString } from "@utils/date";
import type { ConnectorRecord, VirtualCollectionRecord } from "../types";
import { FederationError } from "../types";
import { MariaDbConnector } from "./connectors/mariadb";
import { MongoDbConnector } from "./connectors/mongodb";
import { PostgresConnector } from "./connectors/postgres";
import { RestOpenApiConnector } from "./connectors/rest-openapi";
import { SqliteConnector } from "./connectors/sqlite";
import type { BaseConnector } from "./connectors/base";

const CONNECTORS_COLLECTION = "plugin_unified-data-hub_connectors";
const SCHEMAS_COLLECTION = "plugin_unified-data-hub_virtual_schemas";

const CONNECTOR_INSTANCES: Record<string, BaseConnector> = {
  postgres: new PostgresConnector(),
  mariadb: new MariaDbConnector(),
  sqlite: new SqliteConnector(),
  mongodb: new MongoDbConnector(),
  rest: new RestOpenApiConnector(),
};

export function getConnectorInstance(type: ConnectorRecord["type"]): BaseConnector {
  const instance = CONNECTOR_INSTANCES[type];
  if (!instance) {
    throw new FederationError("CONNECTOR_NOT_FOUND", `Unsupported connector type: ${type}`, 400);
  }
  return instance;
}

export function sanitizeConnector(record: ConnectorRecord): Record<string, unknown> {
  const { credentials: _creds, ...safe } = record;
  return safe;
}

export async function listConnectors(
  db: IDBAdapter,
  tenantId: DatabaseId,
): Promise<ConnectorRecord[]> {
  const result = await db.crud.findMany<ConnectorRecord>(
    CONNECTORS_COLLECTION,
    { enabled: true },
    { tenantId, limit: 100 },
  );
  return result.success && result.data ? result.data : [];
}

export async function getConnectorById(
  db: IDBAdapter,
  connectorId: string,
  tenantId: DatabaseId,
): Promise<ConnectorRecord | null> {
  const result = await db.crud.findOne<ConnectorRecord>(
    CONNECTORS_COLLECTION,
    { _id: connectorId as unknown as DatabaseId },
    { tenantId },
  );
  return result.success && result.data ? result.data : null;
}

export async function listVirtualCollections(
  db: IDBAdapter,
  tenantId: DatabaseId,
): Promise<VirtualCollectionRecord[]> {
  const result = await db.crud.findMany<VirtualCollectionRecord>(
    SCHEMAS_COLLECTION,
    { enabled: true },
    { tenantId, limit: 200 },
  );
  return result.success && result.data ? result.data : [];
}

export async function getVirtualCollection(
  db: IDBAdapter,
  collectionId: string,
  tenantId: DatabaseId,
): Promise<VirtualCollectionRecord | null> {
  const byId = await db.crud.findOne<VirtualCollectionRecord>(
    SCHEMAS_COLLECTION,
    { _id: collectionId as unknown as DatabaseId },
    { tenantId },
  );
  if (byId.success && byId.data) return byId.data;

  const bySlug = await db.crud.findOne<VirtualCollectionRecord>(
    SCHEMAS_COLLECTION,
    { slug: collectionId },
    { tenantId },
  );
  return bySlug.success && bySlug.data ? bySlug.data : null;
}

export async function saveConnector(
  db: IDBAdapter,
  record: ConnectorRecord,
): Promise<ConnectorRecord> {
  const existing = await getConnectorById(db, record._id, record.tenantId);
  if (existing) {
    const merged: ConnectorRecord = {
      ...existing,
      ...record,
      credentials: record.credentials ?? existing.credentials,
    };
    await db.crud.update(CONNECTORS_COLLECTION, record._id as DatabaseId, merged as any, {
      tenantId: record.tenantId,
    });
    return merged;
  }
  const instance = getConnectorInstance(record.type);
  const withCaps: ConnectorRecord = {
    ...record,
    capabilities: record.capabilities ?? instance.getDefaultCapabilities(),
    health: record.health ?? "unknown",
  };
  const now = nowISODateString();
  await db.crud.insert(
    CONNECTORS_COLLECTION,
    { ...withCaps, createdAt: now, updatedAt: now } as any,
    { tenantId: record.tenantId },
  );
  return withCaps;
}

export async function saveVirtualCollection(
  db: IDBAdapter,
  record: VirtualCollectionRecord,
): Promise<VirtualCollectionRecord> {
  const existing = await getVirtualCollection(db, record._id || record.slug, record.tenantId);
  if (existing) {
    await db.crud.update(SCHEMAS_COLLECTION, existing._id as DatabaseId, record as any, {
      tenantId: record.tenantId,
    });
    return record;
  }
  const now = nowISODateString();
  await db.crud.insert(SCHEMAS_COLLECTION, { ...record, createdAt: now, updatedAt: now } as any, {
    tenantId: record.tenantId,
  });
  return record;
}
