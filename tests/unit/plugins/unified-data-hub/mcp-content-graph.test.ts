/**
 * @file tests/unit/plugins/unified-data-hub/mcp-content-graph.test.ts
 * @description WebMCP content graph extension — virtual and enrichment edges.
 */

import { describe, expect, it, vi } from "vitest";
import type { DatabaseId } from "@databases/db-interface";
import {
  extendContentGraph,
  virtualGraphKey,
} from "@plugins/unified-data-hub/server/mcp-extension";

vi.mock("@src/plugins/registry", () => ({
  pluginRegistry: {
    get: () => ({ metadata: { id: "unified-data-hub", enabled: true } }),
    getPluginState: async () => ({ enabled: true }),
  },
}));

const TENANT = "default" as DatabaseId;
const CONNECTOR_ID = "conn-graph" as DatabaseId;

function createMockDb() {
  const virtualArticles = {
    _id: "vc-articles" as DatabaseId,
    tenantId: TENANT,
    name: "Articles",
    slug: "wp-articles",
    connectorId: CONNECTOR_ID,
    source: { endpoint: "/posts" },
    fields: [],
    relations: [
      { name: "author", targetSlug: "wp-authors", localField: "authorId", foreignField: "id" },
    ],
    enabled: true,
  };

  const virtualAuthors = {
    _id: "vc-authors" as DatabaseId,
    tenantId: TENANT,
    name: "Authors",
    slug: "wp-authors",
    connectorId: CONNECTOR_ID,
    source: { endpoint: "/authors" },
    fields: [],
    enabled: true,
  };

  return {
    collection: {
      listSchemas: vi.fn(async () => [
        {
          _id: "posts",
          slug: "posts",
          name: "Posts",
          fields: [],
          federationEnrichments: [
            {
              label: "Author",
              nativeField: "authorId",
              virtualSlug: "wp-authors",
              virtualKeyField: "id",
            },
          ],
        },
      ]),
    },
    crud: {
      findMany: vi.fn(async (col: string) => {
        if (col.includes("virtual_schemas")) {
          return { success: true, data: [virtualArticles, virtualAuthors] };
        }
        return { success: true, data: [] };
      }),
      findOne: vi.fn(async () => ({ success: true, data: null })),
    },
  } as any;
}

describe("mcp extendContentGraph", () => {
  it("virtualGraphKey prefixes slugs for graph nodes", () => {
    expect(virtualGraphKey("wp-articles")).toBe("virtual:wp-articles");
  });

  it("adds virtual nodes and native enrichment edges", async () => {
    const db = createMockDb();
    const base = {
      posts: { entries: 3, relations: [], type: "native" as const },
    };

    const graph = await extendContentGraph(db, TENANT, base);

    expect(graph["virtual:wp-articles"]).toMatchObject({
      type: "virtual",
      connectorId: CONNECTOR_ID,
      relations: ["virtual:wp-authors"],
    });
    expect(graph.posts.enrichmentTargets).toEqual(["virtual:wp-authors"]);
    expect(graph.posts.relations).toContain("virtual:wp-authors");
  });
});
