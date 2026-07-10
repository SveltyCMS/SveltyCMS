/**
 * @file tests/unit/plugins/unified-data-hub/federation-poc.test.ts
 * @description Phase 0 POC validation — mocked federation end-to-end paths.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { DatabaseId } from "@databases/db-interface";
import { FederationError } from "@plugins/unified-data-hub/types";
import { executeVirtualRead } from "@plugins/unified-data-hub/server/virtual-query-engine";
import { extendTopology } from "@plugins/unified-data-hub/server/mcp-extension";
import {
  buildWordPressVirtualCollection,
  getWordPressRestEndpoint,
} from "@plugins/unified-data-hub/server/shared-schema/wordpress-rest";
import { getCacheStats } from "@plugins/unified-data-hub/server/cache";

vi.mock("@src/utils/license-manager", () => ({
  checkExtensionLicense: vi.fn(async () => ({
    active: true,
    hasLicense: false,
    daysRemaining: 14,
  })),
}));

vi.mock("@src/plugins/registry", () => ({
  pluginRegistry: {
    get: () => ({ metadata: { id: "unified-data-hub", enabled: true } }),
    getPluginState: async () => ({ enabled: true }),
  },
}));

const TENANT = "default" as DatabaseId;
const CONNECTOR_ID = "conn-rest-1" as DatabaseId;
const COLLECTION_ID = "vc-wp-articles" as DatabaseId;

function createMockDb() {
  const connector = {
    _id: CONNECTOR_ID,
    tenantId: TENANT,
    name: "WP REST",
    type: "rest" as const,
    enabled: true,
    config: { baseUrl: "https://blog.example.com" },
    allowedHosts: ["blog.example.com"],
    capabilities: {
      filterPushdown: false,
      sortPushdown: false,
      joinable: false as const,
      maxPageSize: 100,
      supportsTransactions: false,
      staleness: "cache" as const,
      ttlSeconds: 300,
      writable: false,
    },
    health: "ok" as const,
    createdAt: "2026-07-08T00:00:00.000Z",
    updatedAt: "2026-07-08T00:00:00.000Z",
  };

  const collection = {
    _id: COLLECTION_ID,
    tenantId: TENANT,
    name: "Articles",
    slug: "wp-articles",
    connectorId: CONNECTOR_ID,
    source: { endpoint: getWordPressRestEndpoint("posts"), platform: "wordpress" },
    fields: buildWordPressVirtualCollection("posts", String(CONNECTOR_ID), TENANT).fields,
    enabled: true,
    createdAt: "2026-07-08T00:00:00.000Z",
    updatedAt: "2026-07-08T00:00:00.000Z",
  };

  return {
    crud: {
      findOne: vi.fn(async (col: string, query: any) => {
        if (col === "plugin_unified-data-hub_virtual_schemas") {
          if (query._id === COLLECTION_ID || query.slug === "wp-articles") {
            return { success: true, data: collection };
          }
        }
        if (col === "plugin_unified-data-hub_connectors") {
          if (query._id === CONNECTOR_ID) {
            return { success: true, data: connector };
          }
        }
        return { success: true, data: null };
      }),
      findMany: vi.fn(async (col: string) => {
        if (col === "plugin_unified-data-hub_virtual_schemas") {
          return { success: true, data: [collection] };
        }
        if (col === "plugin_unified-data-hub_connectors") {
          return { success: true, data: [connector] };
        }
        return { success: true, data: [] };
      }),
      insert: vi.fn(async () => ({ success: true })),
    },
    collection: { listSchemas: vi.fn() },
  } as any;
}

describe("Phase 0 POC — federation validation", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      headers: { get: () => "1000" },
      json: async () => [
        {
          id: 1,
          title: "Hello WP",
          slug: "hello-wp",
          status: "publish",
          content: "<p>Body</p>",
          excerpt: "Excerpt",
          date: "2026-07-08T10:00:00",
          modified: "2026-07-08T10:00:00",
          author: 1,
          featured_media: 0,
        },
      ],
    })) as unknown as typeof fetch;
  });

  it("WordPress REST virtual Articles returns mapped fields", async () => {
    const db = createMockDb();
    const result = await executeVirtualRead(
      db,
      "wp-articles",
      {
        tenantId: TENANT,
        user: { isAdmin: true, role: "admin" },
        limit: 10,
      },
      [],
    );
    expect(result.data).toHaveLength(1);
    expect(result.data[0]._source.connectorId).toBe(CONNECTOR_ID);
    expect(result.meta.connectorId).toBe(CONNECTOR_ID);
  });

  it("extendTopology includes virtual collection with connectorHealth", async () => {
    const db = createMockDb();
    const topology = await extendTopology(db, TENANT);
    expect(topology.collections.length).toBeGreaterThan(0);
    expect(topology.collections[0].type).toBe("virtual");
    expect(topology.collections[0].connectorHealth).toBe("ok");
  });

  it("hybrid native+virtual filter is rejected", async () => {
    const db = createMockDb();
    await expect(
      executeVirtualRead(db, "wp-articles", {
        tenantId: TENANT,
        user: { isAdmin: true },
        filter: { "_native.title": "x" },
      }),
    ).rejects.toThrow(FederationError);
  });

  it("shared WordPress schema matches Smart Importer post semantics", () => {
    const def = buildWordPressVirtualCollection("posts", "c1", TENANT);
    expect(def.slug).toBe("wp-articles");
    expect(def.source.endpoint).toBe("/wp-json/wp/v2/posts");
    expect(def.fields.some((f) => f.name === "title")).toBe(true);
  });

  it("cache stats track hits after repeat read", async () => {
    const db = createMockDb();
    const opts = { tenantId: TENANT, user: { isAdmin: true }, limit: 5 };
    await executeVirtualRead(db, "wp-articles", opts);
    const before = getCacheStats();
    await executeVirtualRead(db, "wp-articles", opts);
    const after = getCacheStats();
    expect(after.hits).toBeGreaterThanOrEqual(before.hits);
  });
});
