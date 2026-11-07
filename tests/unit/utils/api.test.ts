/**
 * @file tests/unit/utils/api.test.ts
 * @description Tests for the collection API client: entry CRUD wrappers, the
 * cached list read and the batch actions. The HTTP transport itself (envelope,
 * error mapping, CSRF) is pinned in `http-client.test.ts`.
 *
 * ### Features:
 * - `createEntry`/`updateEntry`/`deleteEntry` request shape
 * - `getData` cache hit, invalidation and invalid-payload handling
 * - `getCollections` query params
 * - `batchUpdateEntries` status vs. update action selection
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";
import {
  createEntry,
  updateEntry,
  deleteEntry,
  batchUpdateEntries,
  getData,
  invalidateCollectionCache,
  getCollections,
} from "@src/utils/api";
import { stubDocumentCookie, unstubAllGlobals } from "../helpers/stub-global";

describe("API Client Utilities", () => {
  let globalFetchMock: Mock;

  beforeEach(() => {
    globalFetchMock = vi.fn();
    (globalThis as any).fetch = globalFetchMock;
    stubDocumentCookie(() => "csrf_token=api-test-csrf");

    // Clear internal cache by trying to invalidate
    invalidateCollectionCache("test-collection");
    invalidateCollectionCache("another-collection");
  });

  afterEach(() => {
    unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe("CRUD Entry Functions", () => {
    it("should call fetchApi with POST for createEntry", async () => {
      globalFetchMock.mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ id: "123", success: true }),
      });

      await createEntry("users", { name: "Alice" });

      expect(globalFetchMock).toHaveBeenCalledWith(
        "/api/collections/users",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "Alice" }),
        }),
      );
    });

    it("should call fetchApi with PATCH for updateEntry", async () => {
      globalFetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      await updateEntry("users", "123", { name: "Alice Updated" });

      expect(globalFetchMock).toHaveBeenCalledWith(
        "/api/collections/users/123",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ name: "Alice Updated" }),
        }),
      );
    });

    it("should call fetchApi with DELETE for deleteEntry", async () => {
      globalFetchMock.mockResolvedValue({ ok: true, status: 204 });

      await deleteEntry("users", "123");

      expect(globalFetchMock).toHaveBeenCalledWith(
        "/api/collections/users/123",
        expect.objectContaining({
          method: "DELETE",
        }),
      );
    });
  });

  describe("getData and Caching", () => {
    it("should fetch data and cache it", async () => {
      const mockData = { items: [{ id: 1 }], total: 1 };

      globalFetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: mockData }),
      });

      // First call (cache MISS)
      const res1 = await getData({ collectionId: "posts" });
      expect(res1.success).toBe(true);
      expect(globalFetchMock).toHaveBeenCalledTimes(1);

      // Second call (cache HIT)
      const res2 = await getData({ collectionId: "posts" });
      expect(res2.success).toBe(true);
      expect(globalFetchMock).toHaveBeenCalledTimes(1); // Fetch not called again
    });

    it("should invalidate cache correctly", async () => {
      const mockData = { items: [{ id: 1 }], total: 1 };

      globalFetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: mockData }),
      });

      // First call (cache MISS)
      await getData({ collectionId: "cached-posts" });
      expect(globalFetchMock).toHaveBeenCalledTimes(1);

      // Invalidate
      invalidateCollectionCache("cached-posts");

      // Second call (should be cache MISS again)
      await getData({ collectionId: "cached-posts" });
      expect(globalFetchMock).toHaveBeenCalledTimes(2);
    });

    it("should return invalid format error if items is missing", async () => {
      globalFetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { something: "else" } }),
      });

      const res = await getData({ collectionId: "bad-posts" });
      expect(res.success).toBe(false);
      expect(res.code).toBe("INVALID_RESPONSE");
    });
  });

  describe("getCollections", () => {
    it("should fetch collections with query params", async () => {
      globalFetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: [] }),
      });

      await getCollections({ includeFields: true });
      expect(globalFetchMock).toHaveBeenCalledWith(
        "/api/collections?includeFields=true",
        expect.any(Object),
      );
    });
  });

  describe("batchUpdateEntries", () => {
    it("should send status batch action when status is provided", async () => {
      globalFetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, count: 2 }),
      });

      const res = await batchUpdateEntries("posts", {
        ids: ["id1", "id2"],
        status: "publish",
      });

      expect(res.success).toBe(true);
      expect(globalFetchMock).toHaveBeenCalledWith(
        "/api/collections/posts/batch",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ action: "status", entryIds: ["id1", "id2"], status: "publish" }),
        }),
      );
    });

    it("should send update batch action when data fields are provided", async () => {
      globalFetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, count: 2 }),
      });

      const res = await batchUpdateEntries("posts", {
        ids: ["id1", "id2"],
        data: { author: "Admin", views: 42 },
      });

      expect(res.success).toBe(true);
      expect(globalFetchMock).toHaveBeenCalledWith(
        "/api/collections/posts/batch",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            action: "update",
            entryIds: ["id1", "id2"],
            data: { author: "Admin", views: 42 },
          }),
        }),
      );
    });

    it("should fail gracefully when no entryIds are provided", async () => {
      const res = await batchUpdateEntries("posts", { data: { author: "Admin" } });
      expect(res.success).toBe(false);
      expect(res.code).toBe("BAD_REQUEST");
    });
  });
});
