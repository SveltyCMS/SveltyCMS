/**
 * @file tests/unit/utils/http-client.test.ts
 * @description Tests for the domain-free HTTP transport: envelope normalisation,
 * error mapping and CSRF header policy. Moved here from `api.test.ts` when the
 * transport split out of `@utils/api`, so `fetchApi` behaviour stays pinned.
 *
 * ### Features:
 * - 2xx JSON, 204 No Content and invalid-JSON envelopes
 * - 4xx/5xx error envelope (message/code) and network-error mapping
 * - CSRF header on mutations only, with the cookie token
 * - no transport re-export from `@utils/api` (the split has no compat bridge)
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";
import { fetchApi } from "@utils/http-client";
import { invalidateCollectionCache } from "@src/utils/api";
import { stubDocumentCookie, unstubAllGlobals } from "../helpers/stub-global";

describe("HTTP Client Transport", () => {
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

    it("attaches CSRF on POST mutations from cookie", async () => {
      globalFetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      });
      await fetchApi("/api/mutate", { method: "POST", body: "{}" });
      expect(globalFetchMock).toHaveBeenCalledWith(
        "/api/mutate",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            "X-CSRF-Token": "api-test-csrf",
          }),
        }),
      );
    });

    it("does not force CSRF on GET", async () => {
      globalFetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      });
      await fetchApi("/api/read");
      const opts = globalFetchMock.mock.calls[0][1];
      expect(opts.headers["X-CSRF-Token"]).toBeUndefined();
    });
  });

  describe("module split", () => {
    it("does not re-export the transport from @utils/api", async () => {
      const apiModule = await import("@utils/api");
      expect("fetchApi" in apiModule).toBe(false);
      expect("unwrapList" in apiModule).toBe(false);
    });
  });
});
