/**
 * @file tests/unit/routes/token-routes-handler.test.ts
 * @description Unit tests for the invitation-token handler (`/api/token`).
 *
 * Pins the reported regression: editing/deleting from the admin list must resolve
 * the row by `_id` (the list only exposes the *hashed* token value, which
 * `getTokenByValue` re-hashes and cannot find) and must fail loudly instead of
 * pretending a delete succeeded.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";

vi.mock("@src/databases/cache/cache-service", () => ({
  cacheService: { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue(undefined) },
}));

function mockEvent(method: string, path: string, body?: unknown): RequestEvent {
  return {
    request: {
      method,
      json: async () => body,
      headers: new Headers(),
    } as any,
    locals: { user: { _id: "u1", role: "admin" }, isAdmin: true },
    url: new URL(`http://localhost/api/token/${path}`),
  } as any as RequestEvent;
}

function mockCms() {
  return {
    auth: {
      tokens: {
        delete: vi.fn(),
        update: vi.fn(),
        block: vi.fn(),
        unblock: vi.fn(),
      },
    },
    websiteTokens: {},
  } as any;
}

describe("token routes handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("pickTokenUpdateFields allowlist", () => {
    it("accepts lifecycle fields plus admin identity fields for admins", async () => {
      const { pickTokenUpdateFields } = await import("@src/routes/api/[...path]/handlers/tokens");
      const picked = pickTokenUpdateFields(
        { email: "a@b.co", role: "editor", expires: "2030-01-01T00:00:00.000Z", blocked: true },
        true,
      );
      expect(picked).toEqual({
        email: "a@b.co",
        role: "editor",
        expires: "2030-01-01T00:00:00.000Z",
        blocked: true,
      });
    });

    it("drops identity fields and non-columns for non-admins", async () => {
      const { pickTokenUpdateFields } = await import("@src/routes/api/[...path]/handlers/tokens");
      const picked = pickTokenUpdateFields(
        {
          email: "a@b.co",
          role: "admin",
          expires: "2030-01-01T00:00:00.000Z",
          expiresInHours: 48,
          token: "raw-or-hashed",
          user_id: "u2",
          type: "password_reset",
          tenantId: "other-tenant",
          _id: "t9",
        },
        false,
      );
      // `expires` is the supported validity field; `expiresInHours` is not a column.
      expect(picked).toEqual({ expires: "2030-01-01T00:00:00.000Z" });
    });

    it("never lets a caller re-point user_id/type/tenantId through the update body", async () => {
      const { pickTokenUpdateFields } = await import("@src/routes/api/[...path]/handlers/tokens");
      const picked = pickTokenUpdateFields(
        { user_id: "victim", type: "password_reset", tenantId: "t2" },
        true,
      );
      expect(picked).toEqual({});
    });
  });

  describe("DELETE /api/token/:tokenId", () => {
    it("answers 200 when a row was deleted", async () => {
      const cms = mockCms();
      cms.auth.tokens.delete.mockResolvedValue({
        success: true,
        data: { deletedCount: 1 },
        message: "Token deleted",
      });
      const { handleTokenRoutes } = await import("@src/routes/api/[...path]/handlers/tokens");
      const res = await handleTokenRoutes(mockEvent("DELETE", "row-id-123"), cms, "t1" as any, [
        "token",
        "row-id-123",
      ]);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
    });

    it("answers 404 instead of a silent no-op when nothing matched", async () => {
      const cms = mockCms();
      cms.auth.tokens.delete.mockResolvedValue({
        success: true,
        data: { deletedCount: 0 },
        message: "Token not found",
      });
      const { handleTokenRoutes } = await import("@src/routes/api/[...path]/handlers/tokens");
      await expect(
        handleTokenRoutes(mockEvent("DELETE", "hashed-row-value"), cms, "t1" as any, [
          "token",
          "hashed-row-value",
        ]),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("PUT /api/token/:tokenId", () => {
    it("routes the allowlisted update through the namespace and returns the row", async () => {
      const cms = mockCms();
      cms.auth.tokens.update.mockResolvedValue({
        _id: "abc",
        email: "a@b.co",
        role: "editor",
        expires: "2030-01-01T00:00:00.000Z",
      });
      const { handleTokenRoutes } = await import("@src/routes/api/[...path]/handlers/tokens");
      const res = await handleTokenRoutes(
        mockEvent("PUT", "abc", { newTokenData: { role: "editor" } }),
        cms,
        "t1" as any,
        ["token", "abc"],
      );
      expect(res.status).toBe(200);
      expect(cms.auth.tokens.update).toHaveBeenCalledWith(
        "abc",
        { role: "editor" },
        { tenantId: "t1" },
      );
    });

    it("answers 404 for an id the namespace cannot resolve (stale/hashed row value)", async () => {
      const cms = mockCms();
      cms.auth.tokens.update.mockResolvedValue(undefined);
      const { handleTokenRoutes } = await import("@src/routes/api/[...path]/handlers/tokens");
      await expect(
        handleTokenRoutes(
          mockEvent("PUT", "hashed", { newTokenData: { role: "editor" } }),
          cms,
          "t1" as any,
          ["token", "hashed"],
        ),
      ).rejects.toMatchObject({ status: 404 });
    });

    it("rejects an update body with no allowlisted fields", async () => {
      const cms = mockCms();
      const { handleTokenRoutes } = await import("@src/routes/api/[...path]/handlers/tokens");
      await expect(
        handleTokenRoutes(
          mockEvent("PUT", "abc", { newTokenData: { token: "hijack", user_id: "victim" } }),
          cms,
          "t1" as any,
          ["token", "abc"],
        ),
      ).rejects.toBeInstanceOf(AppError);
      expect(cms.auth.tokens.update).not.toHaveBeenCalled();
    });
  });
});
