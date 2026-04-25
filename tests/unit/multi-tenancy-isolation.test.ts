/**
 * @file tests/unit/multi-tenancy-isolation.test.ts
 * @description GraphQL Multi-Tenancy Isolation tests for the CMS.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocking SvelteKit
vi.mock("$app/environment", () => ({
  browser: false,
  dev: true,
  building: false,
}));

// Mocking settings
vi.mock("@src/services/settings-service", () => ({
  getPrivateSettingSync: vi.fn((key: string) => {
    if (key === "MULTI_TENANT") return true;
    if (key === "USE_REDIS") return false;
    return undefined;
  }),
}));

// Mocking contentSystem
vi.mock("@src/content", () => ({
  contentSystem: {
    initialize: vi.fn(),
    getCollections: vi
      .fn()
      .mockResolvedValue([{ _id: "test1", name: "TestCollection", fields: [] }]),
    getCollectionStats: vi.fn().mockReturnValue({ fieldCount: 0 }),
    getContentVersion: vi.fn().mockReturnValue("v1"),
  },
}));

// Mocking widget-store
vi.mock("@src/stores/widget-store.svelte.ts", () => ({
  widgets: {
    initialize: vi.fn(() => Promise.resolve(true)),
    widgetFunctions: {},
    isLoaded: true,
  },
}));

// Mocking modify-request
vi.mock("@api/collections/modify-request", () => ({
  modifyRequest: vi.fn(),
}));

// Import what we are testing
import { collectionsResolvers } from "@src/routes/api/graphql/resolvers/collections";
import { createCleanTypeName } from "@utils/utils";

describe("GraphQL Multi-Tenancy Isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should throw an error if the request context tenantId does not match the server tenantId", async () => {
    const mockDbAdapter = {
      queryBuilder: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnThis(),
        paginate: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ success: true, data: [] }),
      }),
    } as any;

    // Assume this is server initialized for tenant-A
    const serverTenantId = "tenant-A";
    const resolvers = await collectionsResolvers(mockDbAdapter, null, serverTenantId);

    const cleanTypeName = createCleanTypeName({
      _id: "test1",
      name: "TestCollection",
    });
    const resolverFn = resolvers.Query[cleanTypeName] as Function;

    expect(resolverFn).toBeDefined();

    // Attempt to query with a context that has a different tenantId
    const context = {
      user: {
        _id: "user1",
        email: "test@test.com",
        roleIds: [],
        tenantId: "tenant-B",
        isRegistered: true,
        emailVerified: true,
      },
      tenantId: "tenant-B",
      bypassTenantIsolation: false,
    };

    await expect(resolverFn({}, {}, context)).rejects.toThrow(
      "Internal server error: Tenant context mismatch.",
    );
  });

  it("should throw an error if the user tenant does not match the request context tenant", async () => {
    const mockDbAdapter = {
      queryBuilder: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnThis(),
        paginate: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ success: true, data: [] }),
      }),
    } as any;
    const serverTenantId = "tenant-A";
    const resolvers = await collectionsResolvers(mockDbAdapter, null, serverTenantId);

    const cleanTypeName = createCleanTypeName({
      _id: "test1",
      name: "TestCollection",
    });
    const resolverFn = resolvers.Query[cleanTypeName] as Function;

    const context = {
      user: {
        _id: "user1",
        email: "test@test.com",
        roleIds: [],
        tenantId: "tenant-B",
        isRegistered: true,
        emailVerified: true,
      },
      tenantId: "tenant-A", // The user belongs to B but the context is resolved as A
      bypassTenantIsolation: false,
    };

    await expect(resolverFn({}, {}, context)).rejects.toThrow(
      "Forbidden: Tenant isolation mismatch",
    );
  });

  it("should allow global admin to bypass isolation when bypassTenantIsolation is true", async () => {
    const mockDbAdapter = {
      ensureCollections: vi.fn(),
      queryBuilder: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnThis(),
        paginate: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ success: true, data: [] }),
      }),
    } as any;
    const serverTenantId = "tenant-A";
    const resolvers = await collectionsResolvers(mockDbAdapter, null, serverTenantId);

    const cleanTypeName = createCleanTypeName({
      _id: "test1",
      name: "TestCollection",
    });
    const resolverFn = resolvers.Query[cleanTypeName] as Function;

    const context = {
      user: {
        _id: "admin1",
        email: "admin@test.com",
        roleIds: [],
        tenantId: "global",
        isRegistered: true,
        emailVerified: true,
      },
      tenantId: "tenant-A",
      bypassTenantIsolation: true,
    };

    const result = await resolverFn({}, {}, context);
    expect(Array.isArray(result)).toBe(true);
  });
});
