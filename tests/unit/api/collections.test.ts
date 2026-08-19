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
      updateMany: vi.fn().mockResolvedValue({ success: true, data: { modifiedCount: 0 } }),
      findByIds: vi.fn().mockResolvedValue({ success: true, data: [] }),
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
    batch: {
      bulkDelete: vi.fn().mockResolvedValue({ success: true, deletedCount: 2 }),
      bulkUpdate: vi.fn().mockResolvedValue({ success: true, data: [] }),
      bulkInsert: vi.fn().mockResolvedValue({ success: true, data: [{ _id: "clone-1" }] }),
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

import { createMockRequestEvent } from "../utils/mock-event";

// apiHandler is mocked to unwrap — AppError throws instead of becoming Response.
const dispatch = (event: any) => dispatcher(event);

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

  function event(
    method: string,
    path: string,
    body: any = {},
    user: any = createMockUser({ _id: "user-123", email: "test@example.com" }),
    tenantId: string | null = "t1",
  ) {
    return createMockRequestEvent({
      method,
      path,
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
  }

  describe("GET /api/collections - List Collections", () => {
    it("should return list of collections", async () => {
      mockContentSystem.getCollections.mockResolvedValue([{ _id: "col-1", name: "posts" }]);
      const response = await dispatch(event("GET", "collections"));
      const data = await response!.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data[0].name).toBe("posts");
    });

    it("should throw TENANT_MISSING in multi-tenant mode without tenantId", async () => {
      mockIsMultiTenantEnabled.mockReturnValue(true);
      await expect(dispatch(event("GET", "collections", {}, { _id: "u1" }, null))).rejects.toThrow(
        "Tenant ID required",
      );
    });
  });

  describe("POST /api/collections/[collectionId] - Create Entry", () => {
    it("should reject if user is not authenticated", async () => {
      await expect(dispatch(event("POST", "collections/col-1", {}, null))).rejects.toThrow(
        "Authentication required",
      );
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
      const response = await dispatch(
        event("PATCH", "collections/col-1/entry-1", { title: "Updated" }),
      );
      const data = await response!.json();
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
      const response = await dispatch(event("DELETE", "collections/col-1/entry-1"));
      const data = await response!.json();
      expect(data.success).toBe(true);
    });
  });

  describe("POST /api/collections/[collectionId]/batch", () => {
    const postsSchema = {
      _id: "col-1",
      name: "posts",
      fields: [{ name: "title", type: "text" }],
    };

    beforeEach(() => {
      mockContentSystem.getCollectionById.mockResolvedValue(postsSchema);
      (mockDbAdapter as any).batch.bulkDelete = vi
        .fn()
        .mockResolvedValue({ success: true, deletedCount: 2 });
      (mockDbAdapter as any).batch.bulkUpdate = vi
        .fn()
        .mockResolvedValue({ success: true, data: [] });
      (mockDbAdapter as any).batch.bulkInsert = vi
        .fn()
        .mockResolvedValue({ success: true, data: [{ _id: "clone-1" }] });
      (mockDbAdapter as any).crud.insert = vi
        .fn()
        .mockResolvedValue({ success: true, data: { _id: "should-not-create" } });
      (mockDbAdapter as any).crud.deleteMany = vi
        .fn()
        .mockResolvedValue({ success: true, data: { deletedCount: 2 } });
      (mockDbAdapter as any).crud.updateMany = vi
        .fn()
        .mockResolvedValue({ success: true, data: { modifiedCount: 2 } });
      (mockDbAdapter as any).crud.findByIds = vi
        .fn()
        .mockResolvedValue({ success: true, data: [] });
    });

    it("deletes selected ids instead of creating a new entry", async () => {
      const response = await dispatch(
        event("POST", "collections/col-1/batch", {
          action: "delete",
          entryIds: ["e1", "e2"],
        }),
      );
      const data = await response!.json();
      expect(data.success).toBe(true);
      expect((mockDbAdapter as any).crud.deleteMany).toHaveBeenCalledTimes(1);
      expect((mockDbAdapter as any).crud.deleteMany).toHaveBeenCalledWith(
        expect.any(String),
        { _id: { $in: ["e1", "e2"] } },
        expect.objectContaining({ permanent: true }),
      );
      expect((mockDbAdapter as any).crud.insert).not.toHaveBeenCalled();
    });

    it("bulk-updates status for all entryIds in a single query", async () => {
      const response = await dispatch(
        event("POST", "collections/col-1/batch", {
          action: "status",
          entryIds: ["e1", "e2"],
          status: "publish",
        }),
      );
      const data = await response!.json();
      expect(data.success).toBe(true);
      expect((mockDbAdapter as any).crud.updateMany).toHaveBeenCalledTimes(1);
      expect((mockDbAdapter as any).crud.updateMany).toHaveBeenCalledWith(
        expect.any(String),
        { _id: { $in: ["e1", "e2"] } },
        expect.objectContaining({ status: "publish" }),
        expect.anything(),
      );
      expect((mockDbAdapter as any).batch.bulkUpdate).not.toHaveBeenCalled();
      expect((mockDbAdapter as any).crud.insert).not.toHaveBeenCalled();
    });

    it("rejects unknown batch actions without creating", async () => {
      await expect(
        dispatch(event("POST", "collections/col-1/batch", { action: "explode", entryIds: ["e1"] })),
      ).rejects.toThrow(/Unsupported batch action/);
      expect((mockDbAdapter as any).crud.insert).not.toHaveBeenCalled();
    });

    it("schedules by writing status + _scheduled in one updateMany", async () => {
      const when = Date.now() + 86_400_000;
      const response = await dispatch(
        event("POST", "collections/col-1/batch", {
          action: "status",
          entryIds: ["e1", "e2"],
          status: "draft",
          _scheduled: when,
        }),
      );
      const data = await response!.json();
      expect(data.success).toBe(true);
      expect((mockDbAdapter as any).crud.updateMany).toHaveBeenCalledWith(
        expect.any(String),
        { _id: { $in: ["e1", "e2"] } },
        expect.objectContaining({ status: "draft", _scheduled: when }),
        expect.anything(),
      );
      expect((mockDbAdapter as any).crud.insert).not.toHaveBeenCalled();
    });

    it("clones by ids via findByIds + bulkInsert, never create", async () => {
      (mockDbAdapter as any).crud.findByIds = vi.fn().mockResolvedValue({
        success: true,
        data: [{ _id: "e1", title: "Home", status: "publish" }],
      });
      const response = await dispatch(
        event("POST", "collections/col-1/batch", {
          action: "clone",
          entryIds: ["e1"],
        }),
      );
      const data = await response!.json();
      expect(data.success).toBe(true);
      expect((mockDbAdapter as any).crud.findByIds).toHaveBeenCalled();
      expect((mockDbAdapter as any).batch.bulkInsert).toHaveBeenCalled();
      expect((mockDbAdapter as any).crud.insert).not.toHaveBeenCalled();
    });
  });

  describe("PUT /api/collections/[collectionId]/[entryId] - Update alias", () => {
    it("accepts PUT as an alias for PATCH", async () => {
      mockContentSystem.getCollectionById.mockResolvedValue({
        _id: "col-1",
        name: "posts",
        fields: [{ name: "title", type: "text" }],
      });
      (mockDbAdapter as any).crud.update.mockResolvedValue({
        success: true,
        data: { _id: "updated-id" },
      });
      const response = await dispatch(
        event("PUT", "collections/col-1/entry-1", { title: "Updated via PUT" }),
      );
      const data = await response!.json();
      expect(data.success).toBe(true);
    });
  });
});
