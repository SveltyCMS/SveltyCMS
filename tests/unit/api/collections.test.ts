/**
 * @file tests/unit/api/collections.test.ts
 * @description Whitebox unit tests for Collections API endpoints
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockUser } from "../utils/mock-factories";

// Mock all dependencies
vi.mock("@src/databases/db", () => {
  const adapter = {
    crud: {
      findOne: vi.fn().mockResolvedValue({ success: true, data: null }),
      findMany: vi.fn().mockResolvedValue({ success: true, data: [] }),
      find: vi.fn().mockResolvedValue({ success: true, data: [] }),
      insert: vi.fn().mockResolvedValue({ success: true, data: {} }),
      insertMany: vi.fn().mockResolvedValue({ success: true, data: [] }),
      update: vi.fn().mockResolvedValue({ success: true, data: {} }),
      delete: vi.fn().mockResolvedValue({ success: true }),
      deleteMany: vi.fn().mockResolvedValue({ success: true, deletedCount: 0 }),
      count: vi.fn().mockResolvedValue({ success: true, data: 0 }),
      exists: vi.fn().mockResolvedValue({ success: true, data: false }),
    },
    auth: {
      getUserById: vi.fn().mockResolvedValue({ success: true, data: null }),
      getUserByEmail: vi.fn().mockResolvedValue({ success: true, data: null }),
      createUser: vi.fn().mockResolvedValue({ success: true, data: {} }),
      updateUser: vi.fn().mockResolvedValue({ success: true, data: {} }),
      updateUserAttributes: vi.fn().mockResolvedValue({ success: true, data: {} }),
      deleteUser: vi.fn().mockResolvedValue({ success: true }),
      getAllUsers: vi.fn().mockResolvedValue({ success: true, data: [] }),
      getUserCount: vi.fn().mockResolvedValue({ success: true, data: 0 }),
      validateSession: vi.fn().mockResolvedValue({ success: true, user: null }),
      createSession: vi.fn().mockResolvedValue({ success: true, data: {} }),
      deleteSession: vi.fn().mockResolvedValue({ success: true }),
      batchAction: vi.fn().mockResolvedValue({ success: true, data: { modifiedCount: 0 } }),
      getRoles: vi.fn().mockResolvedValue([]),
    },
    system: {
      tenants: {
        getById: () => Promise.resolve({ success: true, data: {} }),
        list: () => Promise.resolve({ success: true, data: [] }),
        create: () => Promise.resolve({ success: true, data: {} }),
        update: () => Promise.resolve({ success: true, data: {} }),
        delete: () => Promise.resolve({ success: true }),
      },
      preferences: {
        get: () => Promise.resolve({ success: true, data: null }),
        set: () => Promise.resolve({ success: true }),
        getAll: () => Promise.resolve({ success: true, data: {} }),
        getMany: () => Promise.resolve({ success: true, data: {} }),
      },
      widgets: {
        getActiveWidgets: () => Promise.resolve({ success: true, data: [] }),
        activate: () => Promise.resolve({ success: true }),
        deactivate: () => Promise.resolve({ success: true }),
        findAll: () => Promise.resolve({ success: true, data: [] }),
      },
    },
    collection: {
      getModel: () => Promise.resolve({ name: "collection_test" }),
      createModel: () => Promise.resolve({ success: true }),
      listSchemas: () => Promise.resolve({ success: true, data: [] }),
    },
    media: {},
    widgets: {},
    content: {
      nodes: {
        bulkUpdate: () => Promise.resolve({ success: true, data: [] }),
      },
    },
    type: "sqlite",
    isConnected: () => true,
    ping: () => Promise.resolve(true),
    transaction: async (fn: any) => fn({}),
    connected: true,
  };

  adapter.crud.findMany = vi.fn().mockResolvedValue({ success: true, data: [] });
  adapter.crud.findOne = vi.fn().mockResolvedValue({ success: true, data: {} });
  adapter.crud.insert = vi.fn().mockResolvedValue({ success: true, data: { _id: "new-id" } });
  adapter.crud.update = vi.fn().mockResolvedValue({ success: true, data: { _id: "updated-id" } });
  adapter.crud.delete = vi.fn().mockResolvedValue({ success: true });

  return {
    dbAdapter: adapter,
    getDbInitPromise: vi.fn().mockResolvedValue(undefined),
    isDbConnected: vi.fn().mockReturnValue(true),
    getDb: vi.fn().mockReturnValue(adapter),
  };
});

import { _handler as dispatcher } from "../../../src/routes/api/[...path]/+server";
import { dbAdapter as mockDbAdapter } from "@src/databases/db";
// ... in beforeEach, ensure event.locals.dbAdapter = mockDbAdapter;

vi.mock("@src/content/index.server", () => ({
  contentSystem: {
    getCollections: vi.fn(),
    getCollectionById: vi.fn(),
  },
}));

vi.mock("@utils/tenant", () => ({
  isMultiTenantEnabled: vi.fn().mockReturnValue(false),
  getTenantIdFromHostname: vi.fn().mockReturnValue(null),
}));

vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: vi.fn().mockReturnValue(false),
  getPublicSettingSync: vi.fn().mockReturnValue(false),
  loadSettingsCache: vi.fn(),
  invalidateSettingsCache: vi.fn(),
}));

vi.mock("@src/services/token/engine", () => ({
  replaceTokens: vi.fn().mockImplementation((text) => Promise.resolve(text)),
}));

vi.mock("@src/services/background/pub-sub", () => ({
  pubSub: {
    publish: vi.fn(),
  },
}));

vi.mock("@utils/api-handler", () => ({
  apiHandler: (fn: any) => fn,
}));

vi.mock("@src/routes/api/collections/modify-request", () => ({
  modifyRequest: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("node:crypto", () => ({
  randomUUID: vi.fn().mockReturnValue("test-uuid-12345"),
  default: {
    randomUUID: vi.fn().mockReturnValue("test-uuid-12345"),
  },
}));

// Import dispatcher handler (raw logic for testing)
// In collections.test.ts, we use the _handler directly for various actions
const GET_LIST = (event: any) => dispatcher(event);
const POST_CREATE = (event: any) => dispatcher(event);
const PATCH_ENTRY = (event: any) => dispatcher(event);
const DELETE_ENTRY = (event: any) => dispatcher(event);

import { createMockRequestEvent } from "../utils/mock-event";

describe("Collections API Unit Tests", () => {
  let mockContentSystem: any;
  let mockIsMultiTenantEnabled: any;

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.clearAllMocks();

    const contentModule = await import("@src/content/index.server");
    mockContentSystem = contentModule.contentSystem;

    // Manually inject mocks into the hoist
    (mockDbAdapter as any).crud.insert = vi
      .fn()
      .mockResolvedValue({ success: true, data: { _id: "new-id" } });
    (mockDbAdapter as any).crud.update = vi
      .fn()
      .mockResolvedValue({ success: true, data: { _id: "updated-id" } });
    (mockDbAdapter as any).crud.delete = vi.fn().mockResolvedValue({ success: true });

    const tenantModule = await import("@utils/tenant");
    mockIsMultiTenantEnabled = tenantModule.isMultiTenantEnabled;
  });

  const createMockEvent = (
    method: string,
    path: string,
    body: any = {},
    user: any = createMockUser({ _id: "user-123", email: "test@example.com" }),
    tenantId: any = "t1",
  ) => {
    const event = createMockRequestEvent({
      method,
      url: `http://localhost/api/${path}`,
      body,
      user: user === null ? null : { ...user, isAdmin: user?.isAdmin ?? true },
      tenantId,
      roles:
        user === null
          ? []
          : [
              {
                _id: "admin",
                name: "Administrator",
                isAdmin: true,
                permissions: [],
              },
            ],
      dbAdapter: mockDbAdapter,
    });

    (event.locals as any).dbAdapter = mockDbAdapter;

    return {
      ...event,
      params: { path },
    };
  };

  describe("GET /api/collections - List Collections", () => {
    it("should return list of collections", async () => {
      mockContentSystem.getCollections.mockResolvedValue([{ _id: "col-1", name: "posts" }]);
      const event = createMockEvent("GET", "collections", {});
      const response = await GET_LIST(event);
      const data = await response!.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data[0].name).toBe("posts");
    });

    it("should throw TENANT_MISSING in multi-tenant mode without tenantId", async () => {
      mockIsMultiTenantEnabled.mockReturnValue(true);
      const event = createMockEvent("GET", "collections", {}, { _id: "u1" }, null);
      await expect(GET_LIST(event)).rejects.toThrow("Tenant ID required");
    });
  });

  describe("POST /api/collections/[collectionId] - Create Entry", () => {
    it("should reject if user is not authenticated", async () => {
      const event = createMockEvent("POST", "collections/col-1", {}, null);
      await expect(POST_CREATE(event)).rejects.toThrow("Authentication required");
    });
  });

  describe("PATCH /api/collections/[collectionId]/[entryId] - Update Entry", () => {
    it("should update an entry successfully", async () => {
      mockContentSystem.getCollectionById.mockResolvedValue({
        _id: "col-1",
        name: "posts",
        fields: [],
      });
      (mockDbAdapter as any).crud.update.mockResolvedValue({
        success: true,
        data: { _id: "updated-id" },
      });
      const event = createMockEvent("PATCH", "collections/col-1/entry-1", {
        title: "Updated",
      });
      const response = await PATCH_ENTRY(event);
      const data = await response!.json();
      // No-op
      expect(data.success).toBe(true);
      expect(data.data._id).toBe("updated-id");
    });
  });

  describe("DELETE /api/collections/[collectionId]/[entryId] - Delete Entry", () => {
    it("should delete an entry successfully", async () => {
      mockContentSystem.getCollectionById.mockResolvedValue({
        _id: "col-1",
        name: "posts",
        fields: [],
      });
      const event = createMockEvent("DELETE", "collections/col-1/entry-1");
      const response = await DELETE_ENTRY(event);
      const data = await response!.json();
      expect(data.success).toBe(true);
    });
  });
});
