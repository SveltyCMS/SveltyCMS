/**
 * @file tests/unit/api/collections.test.ts
 * @description Whitebox unit tests for Collections API endpoints
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";

// Mock all dependencies
vi.mock("@src/content", () => ({
  contentManager: {
    getCollections: vi.fn(),
    getCollectionById: vi.fn(),
    invalidateSpecificCaches: vi.fn(),
  },
}));

vi.mock("@src/services/token/engine", () => ({
  replaceTokens: vi.fn().mockImplementation((text) => Promise.resolve(text)),
}));

vi.mock("@src/services/pub-sub", () => ({
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
import { _handler as dispatcher } from "@src/routes/api/[...path]/+server";
const GET_LIST = dispatcher;
const POST_CREATE = dispatcher;
const PATCH_ENTRY = dispatcher;
const DELETE_ENTRY = dispatcher;

describe("Collections API Unit Tests", () => {
  let mockContentManager: any;
  let mockGetPrivateSettingSync: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    const contentModule = await import("@src/content");
    mockContentManager = contentModule.contentManager;

    const settingsModule = await import("@src/services/settings-service");
    mockGetPrivateSettingSync = settingsModule.getPrivateSettingSync;
    mockGetPrivateSettingSync.mockReturnValue(false);
  });

  const createMockEvent = (
    method: string,
    path: string,
    body: any = {},
    user: any = { _id: "user-123", email: "test@example.com" },
    tenantId?: string,
  ) => {
    return {
      url: new URL(`http://localhost/api/${path}`),
      params: { path },
      request: {
        method,
        json: vi.fn().mockResolvedValue(body),
        headers: {
          get: vi.fn().mockReturnValue("application/json"),
        },
      },
      locals: {
        user: user ? { ...user, role: "admin-role" } : null,
        tenantId,
        roles: user
          ? [{ _id: "admin-role", name: "Administrator", isAdmin: true, permissions: [] }]
          : [],
        dbAdapter: {
          collection: {
            getModel: vi.fn().mockResolvedValue({ name: "collection_test" }),
          },
          crud: {
            findMany: vi.fn().mockResolvedValue({ success: true, data: [] }),
            findOne: vi.fn().mockResolvedValue({ success: true, data: {} }),
            insert: vi.fn().mockResolvedValue({ success: true, data: { _id: "new-id" } }),
            update: vi.fn().mockResolvedValue({ success: true, data: { _id: "updated-id" } }),
            delete: vi.fn().mockResolvedValue({ success: true }),
          },
        },
      },
      cookies: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
    } as unknown as RequestEvent;
  };

  describe("GET /api/collections - List Collections", () => {
    it("should return list of collections", async () => {
      mockContentManager.getCollections.mockResolvedValue([{ _id: "col-1", name: "posts" }]);
      const event = createMockEvent("GET", "collections", {});
      const response = await GET_LIST(event);
      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it("should throw TENANT_MISSING in multi-tenant mode without tenantId", async () => {
      mockGetPrivateSettingSync.mockReturnValue(true);
      const event = createMockEvent("GET", "collections", {}, { _id: "u1" }, undefined);
      await expect(GET_LIST(event)).rejects.toThrow("Tenant ID required");
    });
  });

  describe("POST /api/collections/[collectionId] - Create Entry", () => {
    it("should create a new entry successfully", async () => {
      mockContentManager.getCollectionById.mockResolvedValue({
        _id: "col-1",
        name: "posts",
        fields: [],
      });
      const event = createMockEvent("POST", "collections/col-1", { title: "Test" });
      const response = await POST_CREATE(event);
      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it("should reject if user is not authenticated", async () => {
      const event = createMockEvent("POST", "collections/col-1", {}, null);
      await expect(POST_CREATE(event)).rejects.toThrow("Authentication required");
    });
  });

  describe("PATCH /api/collections/[collectionId]/[entryId] - Update Entry", () => {
    it("should update an entry successfully", async () => {
      mockContentManager.getCollectionById.mockResolvedValue({
        _id: "col-1",
        name: "posts",
        fields: [],
      });
      const event = createMockEvent("PATCH", "collections/col-1/entry-1", { title: "Updated" });
      const response = await PATCH_ENTRY(event);
      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });

  describe("DELETE /api/collections/[collectionId]/[entryId] - Delete Entry", () => {
    it("should delete an entry successfully", async () => {
      mockContentManager.getCollectionById.mockResolvedValue({
        _id: "col-1",
        name: "posts",
        fields: [],
      });
      const event = createMockEvent("DELETE", "collections/col-1/entry-1");
      const response = await DELETE_ENTRY(event);
      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });
});
