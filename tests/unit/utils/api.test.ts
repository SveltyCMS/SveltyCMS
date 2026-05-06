/**
 * @file tests\unit\utils\api-client.test.ts
 * @description Tests for the API client utility functions.
 */

import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import {
  fetchApi,
  createEntry,
  updateEntry,
  deleteEntry,
  getData,
  invalidateCollectionCache,
  getCollections,
} from "@src/utils/api";

// Mock the publicEnv to avoid unresolved imports
vi.mock("@src/stores/global-settings.svelte.ts", () => ({
  publicEnv: {
    DEFAULT_CONTENT_LANGUAGE: "en",
  },
}));

describe("API Client Utilities", () => {
  let globalFetchMock: Mock;

  beforeEach(() => {
    globalFetchMock = vi.fn();
    (globalThis as any).fetch = globalFetchMock;

    // Clear internal cache by trying to invalidate
    invalidateCollectionCache("test-collection");
    invalidateCollectionCache("another-collection");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("fetchApi", () => {
    it("should handle successful 200 JSON responses", async () => {
      globalFetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 1, name: "Test" }),
      });

      const response = await fetchApi("/api/test");
      expect(response.success).toBe(true);
      expect(response).toHaveProperty("id", 1);
      expect(response).toHaveProperty("name", "Test");
    });

    it("should handle 204 No Content responses", async () => {
      globalFetchMock.mockResolvedValue({
        ok: true,
        status: 204,
      });

      const response = await fetchApi("/api/empty");
      expect(response.success).toBe(true);
    });

    it("should gracefully handle 200 OK with invalid JSON", async () => {
      globalFetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error("Parse error");
        },
      });

      const response = await fetchApi("/api/bad-json");
      expect(response.success).toBe(true);
    });

    it("should correctly handle 400 Bad Request errors", async () => {
      globalFetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          message: "Validation failed",
          code: "VALIDATION_ERROR",
        }),
      });

      const response = await fetchApi("/api/bad-req");
      expect(response.success).toBe(false);
      expect(response.message).toBe("Validation failed");
      expect(response.code).toBe("VALIDATION_ERROR");
    });

    it("should catch network errors (fetch throw)", async () => {
      globalFetchMock.mockRejectedValue(new Error("Network offline"));

      const response = await fetchApi("/api/network-down");
      expect(response.success).toBe(false);
      expect(response.message).toBe("Network offline");
      expect(response.code).toBe("NETWORK_ERROR");
    });
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
});
