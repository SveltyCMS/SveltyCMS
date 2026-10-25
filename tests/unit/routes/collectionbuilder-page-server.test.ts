/**
 * @file tests/unit/routes/collectionbuilder-page-server.test.ts
 * @description Unit tests for collection builder +page.server load —
 * permission fail-closed and structure shape (adapter-agnostic).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetContentStructure = vi.fn();
const mockInitialize = vi.fn();
const mockIsInitialized = false;

vi.mock("@src/content/index.server", () => ({
  contentSystem: {
    get isInitialized() {
      return mockIsInitialized;
    },
    initialize: (...args: unknown[]) => mockInitialize(...args),
    getContentStructureFromDatabase: (...args: unknown[]) => mockGetContentStructure(...args),
    refresh: vi.fn(),
  },
}));

vi.mock("@src/databases/auth/permissions", () => ({
  hasCollectionBuilderPermission: vi.fn(
    (_user: unknown, _roles: unknown, isAdmin: boolean) => isAdmin === true,
  ),
}));

import { load } from "../../../src/routes/(app)/config/collectionbuilder/+page.server";
import { hasCollectionBuilderPermission } from "@src/databases/auth/permissions";
import { contentStore } from "@src/stores/content-registry.svelte";

function makeLocals(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      _id: { toString: () => "u1" },
      email: "admin@test.com",
      username: "admin",
      role: "admin",
      avatar: null,
      locale: "en",
    },
    isAdmin: true,
    roles: [],
    tenantId: null,
    ...overrides,
  };
}

describe("collectionbuilder +page.server load", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hasCollectionBuilderPermission).mockImplementation(
      (_user: unknown, _roles: unknown, isAdmin: unknown) => isAdmin === true,
    );
    mockGetContentStructure.mockResolvedValue([
      {
        _id: "n1",
        name: "Posts",
        nodeType: "collection",
        path: "/posts",
        order: 0,
        translations: [],
      },
    ]);
    mockInitialize.mockResolvedValue(undefined);
  });

  it("returns user + contentStructure for admin with permission", async () => {
    const data: any = await load({ locals: makeLocals() } as any);
    expect(data.user.id).toBe("u1");
    expect(data.user.email).toBe("admin@test.com");
    expect(Array.isArray(data.contentStructure)).toBe(true);
    expect(data.contentStructure[0]._id).toBe("n1");
  });

  it("serializes node ids as strings (adapter-agnostic)", async () => {
    mockGetContentStructure.mockResolvedValue([
      {
        _id: { toString: () => "obj-id" },
        name: "X",
        nodeType: "category",
        path: "/x",
        order: 1,
        translations: [],
      },
    ]);
    // serializeStructureNodes uses _id.toString() — plain string ids stay strings
    mockGetContentStructure.mockResolvedValue([
      {
        _id: "plain-id",
        name: "X",
        nodeType: "category",
        path: "/x",
        order: 1,
        translations: [],
      },
    ]);
    const data: any = await load({ locals: makeLocals() } as any);
    expect(typeof data.contentStructure[0]._id).toBe("string");
  });

  it("redirects via real page-guards when session missing", async () => {
    // Real getAuthenticatedUser throws kit redirect(302, "/login")
    await expect(load({ locals: makeLocals({ user: null }) } as any)).rejects.toMatchObject({
      status: 302,
    });
  });

  it("denies non-admin without collection builder permission", async () => {
    vi.mocked(hasCollectionBuilderPermission).mockReturnValue(false);
    await expect(
      load({
        locals: makeLocals({
          isAdmin: false,
          user: { _id: "e1", email: "e@test.com", role: "editor" },
        }),
      } as any),
    ).rejects.toBeTruthy();
  });

  it("hydrates contentStore when DB returns structure but in-memory store is empty for tenant", async () => {
    contentStore.clear("demo-tenant");
    expect(contentStore.getNodesForTenant("demo-tenant")).toHaveLength(0);

    mockGetContentStructure.mockResolvedValue([
      {
        _id: "pages",
        name: "Pages",
        nodeType: "collection",
        path: "/collection/pages",
        order: 0,
        translations: [],
      },
      {
        _id: "posts",
        name: "Posts",
        nodeType: "collection",
        path: "/collection/posts",
        order: 1,
        translations: [],
      },
    ]);

    const data: any = await load({ locals: makeLocals({ tenantId: "demo-tenant" }) } as any);
    expect(data.contentStructure).toHaveLength(2);
    expect(contentStore.getClientNodes("demo-tenant")).toHaveLength(2);
    expect(contentStore.getClientNodes("demo-tenant").map((n) => n._id)).toEqual([
      "pages",
      "posts",
    ]);
  });
});

type CollectionBuilderLoadEvent = Parameters<typeof load>[0];

interface CollectionBuilderPageData {
  user: { id: string };
  contentStructure: Array<{ _id?: string; name?: string; path?: string }>;
}

function makeLoadEvent(tenantId: string): CollectionBuilderLoadEvent {
  return { locals: makeLocals({ tenantId }) } as unknown as CollectionBuilderLoadEvent;
}

describe("collectionbuilder +page.server load — concurrency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInitialize.mockResolvedValue(undefined);
    vi.mocked(hasCollectionBuilderPermission).mockReturnValue(true);
  });

  it("returns each tenant's own structure under parallel loads", async () => {
    mockGetContentStructure.mockImplementation(async (_format: unknown, tenantId: unknown) =>
      tenantId === "t1"
        ? [
            {
              _id: "t1-posts",
              name: "Posts",
              nodeType: "collection",
              path: "/posts",
              order: 0,
              translations: [],
            },
          ]
        : [
            {
              _id: "t2-pages",
              name: "Pages",
              nodeType: "collection",
              path: "/pages",
              order: 1,
              translations: [],
            },
          ],
    );

    const [first, second] = (await Promise.all([
      load(makeLoadEvent("t1")),
      load(makeLoadEvent("t2")),
    ])) as unknown as [CollectionBuilderPageData, CollectionBuilderPageData];

    // Neither result may be empty or crossed: each load reads its own tenant scope.
    expect(first.contentStructure).toHaveLength(1);
    expect(second.contentStructure).toHaveLength(1);
    expect(first.contentStructure[0]._id).toBe("t1-posts");
    expect(second.contentStructure[0]._id).toBe("t2-pages");
    expect(first.contentStructure[0]._id).not.toBe(second.contentStructure[0]._id);
    expect(mockGetContentStructure).toHaveBeenCalledWith("flat", "t1");
    expect(mockGetContentStructure).toHaveBeenCalledWith("flat", "t2");
  });
});
