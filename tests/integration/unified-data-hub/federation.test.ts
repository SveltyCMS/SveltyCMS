/**
 * @file tests/integration/unified-data-hub/federation.test.ts
 * @description Phase 1 integration — GraphQL virtual federation resolver wiring.
 */

import { describe, expect, it, vi } from "vitest";
import {
  virtualCollectionsMutationResolvers,
  virtualCollectionsResolvers,
} from "@src/routes/api/graphql/resolvers/virtual-collections";

vi.mock("@src/plugins/registry", () => ({
  pluginRegistry: {
    get: (id: string) =>
      id === "unified-data-hub" ? { metadata: { id, enabled: true } } : undefined,
    getPluginState: async () => ({ enabled: true }),
  },
}));

vi.mock("@src/services/sdk", () => ({
  LocalCMS: class {
    virtualCollections = {
      listSchemas: async () => ({
        success: true,
        data: [
          {
            _id: "vc1",
            slug: "wp-articles",
            name: "Articles",
            connectorId: "c1",
          },
        ],
      }),
      find: async (_slug: string, opts: { cursor?: string; include?: string[] }) => ({
        success: true,
        data: [
          {
            _id: "c1:1",
            _source: { connectorId: "c1", sourceKey: "1" },
            title: "Hello",
          },
        ],
        meta: {
          connectorId: "c1",
          staleness: "real-time",
          clamped: false,
          included: opts.include,
          nextCursor: "cursor-page-2",
          cursorOffset: opts.cursor ? 25 : 0,
          decomposition: {
            version: "3.0-stable",
            crossSource: false,
            subExpressionCount: 1,
            mergeStrategy: "passthrough",
            cursorModel: "none",
          },
        },
        total: 1,
      }),
      enrichByKeys: async () => ({
        success: true,
        data: {
          "1": {
            _id: "c1:1",
            _source: { connectorId: "c1", sourceKey: "1" },
            name: "Author One",
          },
        },
        meta: {
          connectorId: "c1",
          keyCount: 1,
          matched: 1,
          staleness: "real-time",
          stitchWarning: false,
          nearBudget: false,
          warningCode: "NONE",
          budget: 100,
          utilization: 0.01,
        },
      }),
      create: async (_slug: string, data: Record<string, unknown>) => ({
        success: true,
        data: {
          _id: "c1:99",
          _source: { connectorId: "c1", sourceKey: "99" },
          ...data,
        },
        meta: { connectorId: "c1", operation: "create", sourceKey: "99" },
      }),
      update: async (_slug: string, entryId: string, data: Record<string, unknown>) => ({
        success: true,
        data: {
          _id: entryId,
          _source: { connectorId: "c1", sourceKey: "1" },
          ...data,
        },
        meta: { connectorId: "c1", operation: "update", sourceKey: "1" },
      }),
      delete: async () => ({
        success: true,
        data: null,
        meta: { connectorId: "c1", operation: "delete", sourceKey: "1" },
      }),
    };
  },
}));

describe("Unified Data Hub integration (GraphQL resolver)", () => {
  const db = {} as any;
  const resolvers = virtualCollectionsResolvers(db, "default");
  const ctx = { user: { isAdmin: true, role: "admin" } };

  it("virtualCollections returns schema list when plugin enabled", async () => {
    const list = await resolvers.virtualCollections(null, null, ctx);
    expect(list).toHaveLength(1);
    expect(list[0].type).toBe("virtual");
    expect(list[0].slug).toBe("wp-articles");
  });

  it("virtualCollection returns paginated federation result", async () => {
    const result = await resolvers.virtualCollection(null, { slug: "wp-articles", limit: 10 }, ctx);
    expect(result.data).toHaveLength(1);
    expect(result.meta.connectorId).toBe("c1");
    expect(JSON.parse(result.data[0].payload).title).toBe("Hello");
  });

  it("virtualCollection forwards cursor/include and returns stable meta fields", async () => {
    const result = await resolvers.virtualCollection(
      null,
      {
        slug: "wp-articles",
        limit: 10,
        cursor: "opaque-cursor",
        include: ["author"],
        bypassCache: true,
      },
      ctx,
    );
    expect(result.meta.included).toEqual(["author"]);
    expect(result.meta.nextCursor).toBe("cursor-page-2");
    expect(result.meta.cursorOffset).toBe(25);
    expect(result.meta.decomposition?.version).toBe("3.0-stable");
    expect(result.meta.decomposition?.mergeStrategy).toBe("passthrough");
  });

  it("virtualEnrich returns keyed stitch map with telemetry meta", async () => {
    const result = await resolvers.virtualEnrich(
      null,
      { slug: "bench-authors", keys: ["1"], field: "id" },
      ctx,
    );
    expect(result.data).toHaveLength(1);
    expect(result.data[0].key).toBe("1");
    expect(JSON.parse(result.data[0].payload!).name).toBe("Author One");
    expect(result.meta.matched).toBe(1);
    expect(result.meta.stitchWarning).toBe(false);
  });
});

describe("Unified Data Hub integration (GraphQL mutations)", () => {
  const db = {} as any;
  const mutations = virtualCollectionsMutationResolvers(db, "default");
  const ctx = { user: { isAdmin: true, role: "admin" } };

  it("createVirtualEntry delegates to LocalCMS and maps payload", async () => {
    const result = await mutations.createVirtualEntry(
      null,
      { slug: "articles", payload: JSON.stringify({ title: "New" }) },
      ctx,
    );
    expect(result.meta.operation).toBe("create");
    expect(result.meta.connectorId).toBe("c1");
    expect(JSON.parse(result.data!.payload).title).toBe("New");
  });

  it("updateVirtualEntry delegates with entryId", async () => {
    const result = await mutations.updateVirtualEntry(
      null,
      {
        slug: "articles",
        entryId: "c1:1",
        payload: JSON.stringify({ title: "Updated" }),
      },
      ctx,
    );
    expect(result.meta.operation).toBe("update");
    expect(JSON.parse(result.data!.payload).title).toBe("Updated");
  });

  it("deleteVirtualEntry returns null data", async () => {
    const result = await mutations.deleteVirtualEntry(
      null,
      { slug: "articles", entryId: "c1:1" },
      ctx,
    );
    expect(result.meta.operation).toBe("delete");
    expect(result.data).toBeNull();
  });

  it("rejects invalid payload JSON", async () => {
    await expect(
      mutations.createVirtualEntry(null, { slug: "articles", payload: "not-json" }, ctx),
    ).rejects.toThrow("Invalid payload JSON");
  });
});
