/**
 * @file src/plugins/unified-data-hub/server/hub-test-seed.ts
 * @description Test-only Unified Data Hub seed helper (testing API + benchmarks).
 *
 * CMS-side records (connectors, virtual schemas) are written via `dbAdapter.crud` and
 * therefore work on all four CMS adapters. External fixtures are connector-specific:
 * - `postgres`: Docker Postgres table for the Postgres connector type
 * - `wordpress`: In-process WordPress REST mock for the REST connector type
 *
 * Features:
 * - TEST_MODE guard (fail-closed in production)
 * - Idempotent connector/collection upsert
 * - Postgres external fixture integration
 * - WordPress REST in-process fixture integration
 */

import type { IDBAdapter } from "@databases/db-interface";
import type { DatabaseId, ISODateString } from "@databases/db-interface";
import { pluginRegistry } from "@src/plugins/registry";
import { getIntegrationDbName } from "@src/utils/test-db-credentials";

import type { ConnectorRecord, VirtualCollectionRecord } from "../types";
import { saveConnector, saveVirtualCollection } from "./connector-registry";
import {
  FIXTURE_AUTHORS_SLUG,
  FIXTURE_AUTHORS_TABLE,
  FIXTURE_SCHEMA,
  FIXTURE_SLUG,
  FIXTURE_TABLE,
  isPostgresFixtureReachable,
  seedPostgresBenchFixture,
} from "./postgres-fixture";
import {
  WORDPRESS_FIXTURE_CONNECTOR_ID,
  WORDPRESS_FIXTURE_SLUG,
  startWordPressRestFixture,
} from "./rest-fixture";
import { buildWordPressVirtualCollection } from "./shared-schema/wordpress-rest";

export type HubTestSeedFixture = "postgres" | "wordpress";

export interface HubTestSeedOptions {
  fixture?: HubTestSeedFixture;
  rowCount?: number;
  connectorId?: string;
  collectionId?: string;
  userId?: string;
}

export interface HubTestSeedResult {
  fixture: HubTestSeedFixture;
  slug: string;
  connectorId: string;
  collectionId: string;
  rowCount: number;
}

function assertTestMode(): void {
  const env = process.env;
  const allowed =
    env.TEST_MODE === "true" ||
    env.BENCHMARK === "true" ||
    env.SVELTY_BENCHMARK_SUITE === "true" ||
    env.NODE_ENV === "test";
  if (!allowed) {
    throw new Error("hub-test-seed is only available in test/benchmark environments");
  }
}

async function ensurePluginEnabled(
  db: IDBAdapter,
  tenantId: string,
  userId?: string,
): Promise<void> {
  if (!pluginRegistry.isInitialized()) {
    const { initializePlugins } = await import("@src/plugins/index");
    await initializePlugins(db, tenantId);
  } else if (!pluginRegistry.get("unified-data-hub")) {
    const { unifiedDataHubPlugin } = await import("../index");
    await pluginRegistry.register(unifiedDataHubPlugin);
    await pluginRegistry.runMigrations("unified-data-hub", db, tenantId);
  }

  await pluginRegistry.togglePlugin("unified-data-hub", true, tenantId, userId);
}

async function seedPostgresHub(
  db: IDBAdapter,
  tenantId: string,
  options: HubTestSeedOptions,
): Promise<HubTestSeedResult> {
  const rowCount = options.rowCount ?? 100;

  const reachable = await isPostgresFixtureReachable();
  if (!reachable) {
    throw new Error(
      "POSTGRES_FIXTURE_UNAVAILABLE: External Postgres connector fixture unreachable at 127.0.0.1:5432",
    );
  }

  const actualRowCount = await seedPostgresBenchFixture({ rowCount });

  const connectorId = (options.connectorId || "udh-test-connector") as DatabaseId;
  const collectionId = (options.collectionId || "udh-test-vc") as DatabaseId;

  const connector: ConnectorRecord = {
    _id: connectorId,
    tenantId: tenantId as DatabaseId,
    name: "Test Postgres",
    type: "postgres",
    enabled: true,
    config: {
      host: process.env.UDH_PG_HOST || "127.0.0.1",
      port: Number(process.env.UDH_PG_PORT || 5432),
      database: process.env.UDH_PG_DATABASE || getIntegrationDbName(),
      schema: FIXTURE_SCHEMA,
    },
    credentials: {
      username: process.env.UDH_PG_USER || "postgres",
      password: process.env.UDH_PG_PASSWORD || "postgres",
    },
    capabilities: {
      filterPushdown: true,
      sortPushdown: true,
      joinable: "same-source-only",
      maxPageSize: 100,
      supportsTransactions: false,
      staleness: "real-time",
      ttlSeconds: 0,
      writable: true,
    },
    health: "ok",
    createdAt: "" as unknown as ISODateString,
    updatedAt: "" as unknown as ISODateString,
  };

  const authorsCollection: VirtualCollectionRecord = {
    _id: "udh-test-authors-vc" as DatabaseId,
    tenantId: tenantId as DatabaseId,
    name: "Bench Authors",
    slug: FIXTURE_AUTHORS_SLUG,
    connectorId: String(connectorId),
    source: { table: FIXTURE_AUTHORS_TABLE, schema: FIXTURE_SCHEMA },
    fields: [
      { name: "id", label: "ID", sourceField: "id", type: "number" },
      { name: "name", label: "Name", sourceField: "name", type: "text" },
    ],
    permissions: { read: ["collection:read"] },
    enabled: true,
    createdAt: "" as unknown as ISODateString,
    updatedAt: "" as unknown as ISODateString,
  };

  const collection: VirtualCollectionRecord = {
    _id: collectionId,
    tenantId: tenantId as DatabaseId,
    name: "Bench Articles",
    slug: FIXTURE_SLUG,
    connectorId: String(connectorId),
    source: { table: FIXTURE_TABLE, schema: FIXTURE_SCHEMA },
    fields: [
      { name: "id", label: "ID", sourceField: "id", type: "number" },
      { name: "title", label: "Title", sourceField: "title", type: "text" },
      { name: "slug", label: "Slug", sourceField: "slug", type: "text" },
      { name: "status", label: "Status", sourceField: "status", type: "text" },
      { name: "authorId", label: "Author", sourceField: "author_id", type: "number" },
    ],
    relations: [
      {
        name: "author",
        targetSlug: FIXTURE_AUTHORS_SLUG,
        localField: "authorId",
        foreignField: "id",
      },
    ],
    permissions: { read: ["collection:read"] },
    enabled: true,
    createdAt: "" as unknown as ISODateString,
    updatedAt: "" as unknown as ISODateString,
  };

  await saveConnector(db, connector);
  await saveVirtualCollection(db, authorsCollection);
  await saveVirtualCollection(db, collection);

  return {
    fixture: "postgres",
    slug: FIXTURE_SLUG,
    connectorId: String(connectorId),
    collectionId: String(collectionId),
    rowCount: actualRowCount,
  };
}

async function seedWordPressHub(
  db: IDBAdapter,
  tenantId: string,
  options: HubTestSeedOptions,
): Promise<HubTestSeedResult> {
  const rowCount = options.rowCount ?? 25;
  const baseUrl = await startWordPressRestFixture({ rowCount });

  const connectorId = (options.connectorId || WORDPRESS_FIXTURE_CONNECTOR_ID) as DatabaseId;
  const collectionId = (options.collectionId || "udh-rest-fixture-vc") as DatabaseId;

  const connector: ConnectorRecord = {
    _id: connectorId,
    tenantId: tenantId as DatabaseId,
    name: "Test WordPress REST",
    type: "rest",
    enabled: true,
    config: { baseUrl },
    allowedHosts: ["127.0.0.1", "localhost"],
    capabilities: {
      filterPushdown: false,
      sortPushdown: false,
      joinable: false,
      maxPageSize: 100,
      supportsTransactions: false,
      staleness: "cache",
      ttlSeconds: 300,
      writable: false,
    },
    health: "ok",
    createdAt: "" as unknown as ISODateString,
    updatedAt: "" as unknown as ISODateString,
  };

  const wpDef = buildWordPressVirtualCollection("posts", String(connectorId), tenantId);
  const collection: VirtualCollectionRecord = {
    _id: collectionId,
    tenantId: tenantId as DatabaseId,
    name: wpDef.name,
    slug: wpDef.slug,
    connectorId: String(connectorId),
    source: wpDef.source,
    fields: wpDef.fields,
    permissions: { read: ["collection:read"] },
    enabled: true,
    createdAt: "" as unknown as ISODateString,
    updatedAt: "" as unknown as ISODateString,
  };

  await saveConnector(db, connector);
  await saveVirtualCollection(db, collection);

  return {
    fixture: "wordpress",
    slug: WORDPRESS_FIXTURE_SLUG,
    connectorId: String(connectorId),
    collectionId: String(collectionId),
    rowCount,
  };
}

export async function seedUnifiedDataHub(
  db: IDBAdapter,
  tenantId: string,
  options: HubTestSeedOptions = {},
): Promise<HubTestSeedResult> {
  assertTestMode();

  const fixture = options.fixture ?? "postgres";
  await ensurePluginEnabled(db, tenantId, options.userId);

  if (fixture === "wordpress") {
    return seedWordPressHub(db, tenantId, options);
  }

  return seedPostgresHub(db, tenantId, options);
}
