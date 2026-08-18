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
});
