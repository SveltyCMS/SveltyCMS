/**
 * @file tests/unit/content/content-reconcile.test.ts
 * @description White-box unit tests for content reconciliation logic.
 *
 * Covers:
 * - calculateReconciledOperations (FS ↔ DB merge)
 * - contentSystemBase API surface (shared between index.ts and index.server.ts)
 * - refreshContent mode dispatch
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Schema, ContentNode } from "../../../src/content/types";

// ─── Mocks ────────────────────────────────────────────────────────────────

vi.mock("../../../src/databases/cache/cache-service", () => ({
  cacheService: {
    set: vi.fn(),
    get: vi.fn(),
    getMany: vi.fn().mockResolvedValue([]),
    clearByPattern: vi.fn(),
  },
  CacheCategory: {
    SCHEMA: "schema",
    WIDGET: "widget",
    CONTENT: "content",
    AUTH: "auth",
    SYSTEM: "system",
  },
}));

vi.mock("../../../src/utils/event-bus", () => ({
  eventBus: { broadcast: vi.fn() },
  SystemEvents: { CONTENT_UPDATE: "content:update" },
}));

vi.mock("../../../src/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  },
}));

vi.mock("../../../src/utils/date", () => ({
  dateToISODateString: vi.fn(() => "2026-06-23T00:00:00.000Z" as any),
}));

vi.mock("../../../src/stores/content-registry.svelte", () => ({
  contentStore: {
    sync: vi.fn(),
    clear: vi.fn(),
    upsert: vi.fn(),
    updateVersion: vi.fn(),
    getNode: vi.fn(),
  },
}));

vi.mock("../../../src/content/loader.server", () => ({
  loadSchema: vi.fn(),
  loadSchemaNative: vi.fn(),
  loadSchemaPooled: vi.fn(),
  isSafeCollectionPath: vi.fn(() => true),
  generateSchemaHash: vi.fn(() => "abc123"),
  contentRuntime: {
    isBenchmark: () => false,
    isTest: () => true,
    useWorkerPool: () => false,
  },
  getModuleWorkerPool: vi.fn(),
  warmupWorkerPool: vi.fn(),
  shutdownWorkerPool: vi.fn(),
  shouldUseWorkerPool: () => false,
}));

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeSchema(overrides: Partial<Schema> = {}): Schema {
  return {
    _id: "test_collection",
    name: "Test Collection",
    fields: [
      {
        db_fieldName: "title",
        label: "Title",
        required: false,
        translated: false,
      } as any,
    ],
    ...overrides,
  };
}

function makeDbNode(overrides: Partial<ContentNode> = {}): ContentNode {
  return {
    _id: "db_node_1" as any,
    name: "Test Collection",
    path: "/collection/test_collection",
    nodeType: "collection",
    icon: "bi:file",
    order: 1,
    translations: [],
    source: "filesystem",
    createdAt: "2026-01-01T00:00:00.000Z" as any,
    updatedAt: "2026-01-01T00:00:00.000Z" as any,
    ...overrides,
  };
}

function makeCategoryNode(
  path: string,
  name: string,
  overrides: Partial<ContentNode> = {},
): ContentNode {
  return {
    _id: path.replace(/\//g, "_") as any,
    name,
    path,
    nodeType: "category",
    icon: "mdi:folder",
    order: 999,
    translations: [],
    source: "filesystem",
    createdAt: "2026-01-01T00:00:00.000Z" as any,
    updatedAt: "2026-01-01T00:00:00.000Z" as any,
    ...overrides,
  };
}

// ─── Tests: calculateReconciledOperations ──────────────────────────────────

describe("calculateReconciledOperations", () => {
  let calculateReconciledOperations: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("../../../src/content/engine.server");
    calculateReconciledOperations = mod.contentService.calculateReconciledOperations;
  });

  it("creates operations for new FS schemas when DB is empty", () => {
    const schemas = [makeSchema({ _id: "posts", name: "Posts", path: "/collection/posts" })];
    const result = calculateReconciledOperations(schemas, [], [], null);

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].name).toBe("Posts");
    expect(result.operations[0].path).toBe("/collection/posts");
    expect(result.operations[0].source).toBe("filesystem");
    expect(result.prunedPaths).toHaveLength(0);
  });

  it("merges existing DB node with FS schema (schema._id wins)", () => {
    const schemas = [makeSchema({ _id: "posts", name: "Posts", path: "/collection/posts" })];
    const dbNodes = [
      makeDbNode({
        _id: "db_posts" as any,
        name: "Posts",
        path: "/collection/posts",
        source: "filesystem",
      }),
    ];

    const result = calculateReconciledOperations(schemas, dbNodes, [], null);

    expect(result.operations).toHaveLength(1);
    // schema._id takes precedence over existing._id when both exist
    expect(result.operations[0]._id).toBe("posts");
    expect(result.operations[0].source).toBe("filesystem");
    expect(result.operations[0].createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(result.prunedPaths).toHaveLength(0);
  });

  it("prunes stale filesystem nodes not in current schemas", () => {
    const schemas = [makeSchema({ _id: "posts", name: "Posts", path: "/collection/posts" })];
    const dbNodes = [
      makeDbNode({
        _id: "db_posts" as any,
        name: "Posts",
        path: "/collection/posts",
        source: "filesystem",
      }),
      makeDbNode({
        _id: "db_deleted" as any,
        name: "Deleted",
        path: "/collection/deleted",
        source: "filesystem",
      }),
    ];

    const result = calculateReconciledOperations(schemas, dbNodes, [], null);

    expect(result.prunedPaths).toContain("/collection/deleted");
    expect(result.operations.find((n: any) => n.name === "Posts")).toBeTruthy();
  });

  it("preserves API-created nodes even when not in current schemas", () => {
    const schemas = [makeSchema({ _id: "posts", name: "Posts", path: "/collection/posts" })];
    const dbNodes = [
      makeDbNode({
        _id: "db_posts" as any,
        name: "Posts",
        path: "/collection/posts",
        source: "filesystem",
      }),
      makeDbNode({
        _id: "db_api_node" as any,
        name: "API Created",
        path: "/api/custom",
        source: "database",
      }),
    ];

    const result = calculateReconciledOperations(schemas, dbNodes, [], null);

    expect(result.prunedPaths).not.toContain("/api/custom");
    const preserved = result.operations.find((n: any) => n._id === "db_api_node");
    expect(preserved).toBeTruthy();
    expect(preserved.source).toBe("database");
  });

  it("includes category nodes in operations", () => {
    const schemas = [
      makeSchema({
        _id: "blog_posts",
        name: "Posts",
        path: "/collection/blog/posts",
      }),
    ];
    const categoryNodes = [makeCategoryNode("/collection/blog", "Blog")];

    const result = calculateReconciledOperations(schemas, [], categoryNodes, null);

    const category = result.operations.find((n: any) => n.nodeType === "category");
    expect(category).toBeTruthy();
    expect(category.name).toBe("Blog");
    expect(category.path).toBe("/collection/blog");
  });

  it("assigns parentId to schemas in nested folders", () => {
    const schemas = [
      makeSchema({
        _id: "blog_posts",
        name: "Posts",
        path: "/collection/blog/posts",
      }),
    ];
    const categoryNodes = [makeCategoryNode("/collection/blog", "Blog")];

    const result = calculateReconciledOperations(schemas, [], categoryNodes, null);

    const collection = result.operations.find((n: any) => n.nodeType === "collection");
    expect(collection).toBeTruthy();
    expect(collection.parentId).toBe("_collection_blog");
  });

  it("auto-generates path from name when schema has no path", () => {
    const schemas = [makeSchema({ _id: "authors", name: "Authors" })];
    const result = calculateReconciledOperations(schemas, [], [], null);

    expect(result.operations[0].path).toBe("/collection/authors");
  });

  it("marks node as updated when source changes (database → filesystem)", () => {
    const schemas = [makeSchema({ _id: "posts", name: "Posts", path: "/collection/posts" })];
    const dbNodes = [
      makeDbNode({
        _id: "db_posts" as any,
        name: "Posts",
        path: "/collection/posts",
        source: "database",
      }),
    ];

    const result = calculateReconciledOperations(schemas, dbNodes, [], null);

    expect(result.operations[0].source).toBe("filesystem");
    expect(result.operations[0].updatedAt).toBe("2026-06-23T00:00:00.000Z");
  });

  it("handles multiple schemas across flat and nested paths", () => {
    const schemas = [
      makeSchema({ _id: "posts", name: "Posts", path: "/collection/posts" }),
      makeSchema({ _id: "pages", name: "Pages", path: "/collection/pages" }),
      makeSchema({
        _id: "blog_posts",
        name: "Blog Posts",
        path: "/collection/blog/posts",
      }),
    ];
    const categoryNodes = [makeCategoryNode("/collection/blog", "Blog")];

    const result = calculateReconciledOperations(schemas, [], categoryNodes, null);

    expect(result.operations).toHaveLength(4); // 3 collections + 1 category
    expect(result.prunedPaths).toHaveLength(0);

    const collections = result.operations.filter((n: any) => n.nodeType === "collection");
    expect(collections).toHaveLength(3);
  });

  it("merges schema with existing DB node when matched by name (no path match)", () => {
    const schemas = [
      makeSchema({
        _id: "new_posts",
        name: "Posts",
        path: "/collection/new_posts",
      }),
    ];
    const dbNodes = [
      makeDbNode({
        _id: "old_posts" as any,
        name: "Posts",
        path: "/collection/old_posts",
        source: "filesystem",
      }),
    ];

    const result = calculateReconciledOperations(schemas, dbNodes, [], null);

    // Old node is absorbed by name match; new schema _id and path win
    const coll = result.operations.find((n: any) => n.nodeType === "collection");
    expect(coll).toBeTruthy();
    expect(coll.path).toBe("/collection/new_posts");
    expect(coll._id).toBe("new_posts");
  });

  it("removes duplicate DB entries with same name (keeps first)", () => {
    const schemas = [makeSchema({ _id: "posts", name: "Posts", path: "/collection/posts" })];
    const dbNodes = [
      makeDbNode({
        _id: "dup1" as any,
        name: "Posts",
        path: "/collection/posts",
        source: "filesystem",
      }),
      makeDbNode({
        _id: "dup2" as any,
        name: "Posts",
        path: "/collection/posts_dupe",
        source: "filesystem",
      }),
    ];

    const result = calculateReconciledOperations(schemas, dbNodes, [], null);

    expect(result.prunedPaths).toContain("/collection/posts_dupe");
  });

  it("passes tenantId through to all output nodes", () => {
    const schemas = [makeSchema({ _id: "posts", name: "Posts", path: "/collection/posts" })];
    const result = calculateReconciledOperations(schemas, [], [], "tenant_x");

    expect(result.operations[0].tenantId).toBe("tenant_x");
  });

  it("preserves builder categories when they are absent from filesystem schemas", () => {
    const schemas = [makeSchema({ _id: "posts", name: "Posts", path: "/collection/posts" })];
    const dbNodes = [
      makeDbNode({
        _id: "cat_gui" as any,
        name: "Marketing",
        path: "/marketing",
        nodeType: "category",
        source: "builder",
      }),
    ];

    const result = calculateReconciledOperations(schemas, dbNodes, [], null);

    expect(result.prunedPaths).not.toContain("/marketing");
    const preserved = result.operations.find((n: any) => n.path === "/marketing");
    expect(preserved).toBeTruthy();
    expect(preserved.source).toBe("builder");
  });

  it("applies manifestOrder to collection sort positions", () => {
    const schemas = [
      makeSchema({ _id: "posts", name: "Posts", path: "/collection/posts" }),
      makeSchema({ _id: "pages", name: "Pages", path: "/collection/pages" }),
    ];
    const manifestOrder = { posts: 0, pages: 5 };

    const result = calculateReconciledOperations(schemas, [], [], null, manifestOrder);

    const posts = result.operations.find((n: any) => n._id === "posts");
    const pages = result.operations.find((n: any) => n._id === "pages");
    expect(posts?.order).toBe(0);
    expect(pages?.order).toBe(5);
  });

  it("preserves database-backed nodes during filesystem prune", () => {
    const schemas = [makeSchema({ _id: "posts", name: "Posts", path: "/collection/posts" })];
    const dbNodes = [
      makeDbNode({
        _id: "api_custom" as any,
        name: "API Custom",
        path: "/api/custom",
        source: "database",
      }),
    ];

    const result = calculateReconciledOperations(schemas, dbNodes, [], null);

    expect(result.prunedPaths).not.toContain("/api/custom");
    expect(result.operations.find((n: any) => n.path === "/api/custom")).toBeTruthy();
  });
});

// ─── Tests: contentSystemBase API surface ──────────────────────────────────

describe("contentSystemBase (shared API)", () => {
  it("exposes Collection Builder persistence helpers on the server contentSystem", async () => {
    const { contentSystem } = await import("../../../src/content/index.server");

    expect(typeof contentSystem.upsertContentNodes).toBe("function");
    expect(typeof contentSystem.getContentStructureFromDatabase).toBe("function");
    expect(typeof contentSystem.reorderContentNodes).toBe("function");
  });

  it("exposes collection accessors", async () => {
    const { contentSystemBase } = await import("../../../src/content/index");

    expect(contentSystemBase.collections).toBeDefined();
    expect(typeof contentSystemBase.collections.getAll).toBe("function");
    expect(typeof contentSystemBase.collections.get).toBe("function");
    expect(typeof contentSystemBase.collections.getSmartFirst).toBe("function");
  });

  it("exposes navigation and metrics", async () => {
    const { contentSystemBase } = await import("../../../src/content/index");

    expect(typeof contentSystemBase.getNavigationStructure).toBe("function");
    expect(typeof contentSystemBase.getNavigationStructureProgressive).toBe("function");
    expect(typeof contentSystemBase.getBreadcrumb).toBe("function");
    expect(typeof contentSystemBase.getHealthStatus).toBe("function");
    expect(typeof contentSystemBase.getMetrics).toBe("function");
  });

  it("exposes store sync and version accessors", async () => {
    const { contentSystemBase } = await import("../../../src/content/index");

    expect(typeof contentSystemBase.sync).toBe("function");
    expect(typeof contentSystemBase.getContentVersion).toBe("function");
    expect(typeof contentSystemBase.getContentStructure).toBe("function");
    expect(typeof contentSystemBase.getNode).toBe("function");
  });

  it("exposes context helpers", async () => {
    const { contentSystemBase, CONTENT_CONTEXT_KEY } = await import("../../../src/content/index");

    expect(typeof contentSystemBase.setContext).toBe("function");
    expect(typeof contentSystemBase.getContext).toBe("function");
    expect(CONTENT_CONTEXT_KEY).toBeDefined();
    expect(typeof CONTENT_CONTEXT_KEY).toBe("symbol");
  });

  it("exposes reloading state", async () => {
    const { contentSystemBase } = await import("../../../src/content/index");

    expect(contentSystemBase).toHaveProperty("isReloading");
    expect(typeof contentSystemBase.waitForReload).toBe("function");
  });
});

// ─── Tests: refreshContent modes ───────────────────────────────────────────

describe("refreshContent", () => {
  let refreshContent: any;
  let contentService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("../../../src/content/engine.server");
    refreshContent = mod.refreshContent;
    contentService = mod.contentService;
    vi.spyOn(contentService, "fullReload").mockResolvedValue(undefined);
  });

  it("dispatches to fullReload for 'full' mode", async () => {
    await refreshContent("tenant-a", {
      mode: "full",
      adapter: {
        content: {
          nodes: {
            getStructure: vi.fn().mockResolvedValue({ success: true, data: [] }),
          },
        },
      } as any,
    });

    expect(contentService.fullReload).toHaveBeenCalledWith(
      "tenant-a",
      false,
      expect.any(Object),
      null,
    );
  });

  it("skips fullReload for 'schemas' mode (fast path)", async () => {
    await refreshContent("t1", { mode: "schemas", adapter: {} as any });
    // "schemas" mode calls refreshCollectionsCache, not fullReload
    expect(contentService.fullReload).not.toHaveBeenCalled();
  });
});
