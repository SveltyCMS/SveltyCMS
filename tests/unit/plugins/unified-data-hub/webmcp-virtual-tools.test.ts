/**
 * @file tests/unit/plugins/unified-data-hub/webmcp-virtual-tools.test.ts
 * @description WebMCP virtual collection tools — headless registration + read-only contract.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseId } from "@databases/db-interface";
import { encodeSourceCursor } from "@plugins/unified-data-hub/server/federated-cursor";
import { registerVirtualCollectionTools } from "@src/plugins/webmcp/tools/virtual-collections";

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

const TENANT = "default";
const CONNECTOR_ID = "conn-wmcp" as DatabaseId;
const COLLECTION_ID = "vc-wmcp" as DatabaseId;

function createMockDb() {
  const connector = {
    _id: CONNECTOR_ID,
    tenantId: TENANT,
    name: "WMCP REST",
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
    source: { endpoint: "/wp-json/wp/v2/posts", platform: "wordpress" },
    fields: [
      { name: "id", label: "ID", sourceField: "id", type: "number" },
      { name: "title", label: "Title", sourceField: "title", type: "text" },
    ],
    enabled: true,
    createdAt: "2026-07-08T00:00:00.000Z",
    updatedAt: "2026-07-08T00:00:00.000Z",
  };

  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    headers: { get: () => "128" },
    json: async () => [{ id: 1, title: "Hello", slug: "hello", status: "publish" }],
  })) as any;

  return {
    crud: {
      findOne: vi.fn(async (col: string, query: any) => {
        if (col.includes("virtual_schemas")) {
          if (query._id === COLLECTION_ID || query.slug === "wp-articles") {
            return { success: true, data: collection };
          }
        }
        if (col.includes("connectors") && query._id === CONNECTOR_ID) {
          return { success: true, data: connector };
        }
        return { success: true, data: null };
      }),
      findMany: vi.fn(async (col: string) => {
        if (col.includes("virtual_schemas")) return { success: true, data: [collection] };
        if (col.includes("connectors")) return { success: true, data: [connector] };
        return { success: true, data: [] };
      }),
      insert: vi.fn(async () => ({ success: true })),
    },
  } as any;
}

describe("WebMCP virtual collection tools", () => {
  const priorTools = (globalThis as any).__webmcp_headless_tools;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    (globalThis as any).__webmcp_headless_tools = undefined;
  });

  afterEach(() => {
    (globalThis as any).__webmcp_headless_tools = priorTools;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("registers list, query, and enrich virtual collection tools on headless bridge", () => {
    const db = createMockDb();
    registerVirtualCollectionTools(db);
    const tools = (globalThis as any).__webmcp_headless_tools;
    expect(typeof tools.list_virtual_collections).toBe("function");
    expect(typeof tools.query_virtual_collection).toBe("function");
    expect(typeof tools.enrich_virtual_collection).toBe("function");
  });

  it("list_virtual_collections returns virtual schemas when hub enabled", async () => {
    const db = createMockDb();
    registerVirtualCollectionTools(db);
    const result = await (globalThis as any).__webmcp_headless_tools.list_virtual_collections(
      TENANT,
      { isAdmin: true, role: "admin" },
    );
    expect(result.enabled).toBe(true);
    expect(result.collections).toHaveLength(1);
    expect(result.collections[0].slug).toBe("wp-articles");
    expect(result.connectors[0].credentials).toBeUndefined();
  });

  it("query_virtual_collection returns federated rows (read-only path)", async () => {
    const db = createMockDb();
    registerVirtualCollectionTools(db);
    const result = await (globalThis as any).__webmcp_headless_tools.query_virtual_collection(
      "wp-articles",
      TENANT,
      { limit: 10, user: { isAdmin: true, role: "admin" } },
    );
    expect(result.data?.length).toBeGreaterThan(0);
    expect(result.data[0].title).toBe("Hello");
  });

  it("enrich_virtual_collection returns keyed stitch map", async () => {
    const db = createMockDb();
    registerVirtualCollectionTools(db);
    const result = await (globalThis as any).__webmcp_headless_tools.enrich_virtual_collection(
      "wp-articles",
      ["1"],
      TENANT,
      { virtualKeyField: "id", user: { isAdmin: true, role: "admin" } },
    );
    expect(result.data?.["1"]?.title).toBe("Hello");
    expect(result.meta?.matched).toBe(1);
  });

  it("query_virtual_collection accepts cursor and returns decomposition meta", async () => {
    const db = createMockDb();
    registerVirtualCollectionTools(db);
    const cursor = encodeSourceCursor({
      slug: "wp-articles",
      connectorId: CONNECTOR_ID,
      offset: 10,
    });
    const result = await (globalThis as any).__webmcp_headless_tools.query_virtual_collection(
      "wp-articles",
      TENANT,
      {
        limit: 5,
        cursor,
        user: { isAdmin: true, role: "admin" },
      },
    );
    expect(result.meta?.decomposition?.version).toBe("3.0-stable");
    expect(result.meta?.cursorOffset).toBe(10);
  });

  it("does not expose virtual write tools (read-only v1.0)", () => {
    const db = createMockDb();
    registerVirtualCollectionTools(db);
    const tools = (globalThis as any).__webmcp_headless_tools;
    expect(tools.create_virtual_collection_entry).toBeUndefined();
    expect(tools.update_virtual_collection_entry).toBeUndefined();
    expect(tools.delete_virtual_collection_entry).toBeUndefined();
  });
});
