/**
 * @file tests/unit/routes/api-keys-handler.test.ts
 * @description Unit tests for API key admin handler.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";

vi.mock("@src/databases/db", () => ({
  auth: {
    listApiKeys: vi.fn(),
    createApiKey: vi.fn(),
    getApiKeyById: vi.fn(),
    revokeApiKey: vi.fn(),
  },
  getDbInitPromise: vi.fn().mockResolvedValue(null),
}));

vi.mock("@src/databases/auth/api-keys", () => ({
  generateApiKey: vi.fn(() => ({
    full: "sck_test_full_key_value",
    prefix: "sck_test",
    hash: "hashed-value",
  })),
}));

function mockEvent(method: string, user: any, body?: any): RequestEvent {
  return {
    request: {
      method,
      json: async () => body,
    } as any,
    locals: { user, isAdmin: true },
    url: new URL("http://localhost/api/api-keys"),
  } as RequestEvent;
}

describe("handleApiKeyRoutes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET should list keys without hash field", async () => {
    const { auth } = await import("@src/databases/db");
    (auth.listApiKeys as any).mockResolvedValue({
      success: true,
      data: [
        {
          _id: "k1",
          name: "CI",
          hash: "secret-hash",
          prefix: "sck_abcd",
          userId: "u1",
          permissions: [],
          scopes: [],
          revoked: false,
          usageCount: 0,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    const { handleApiKeyRoutes } = await import("@src/routes/api/[...path]/handlers/api-keys");
    const res = await handleApiKeyRoutes(
      mockEvent("GET", { _id: "u1", role: "admin" }),
      "global" as any,
      ["api-keys"],
    );
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data[0].hash).toBeUndefined();
    expect(body.data[0].prefix).toBe("sck_abcd");
  });

  it("POST should return plaintext key once", async () => {
    const { auth } = await import("@src/databases/db");
    (auth.createApiKey as any).mockResolvedValue({
      success: true,
      data: {
        _id: "k2",
        name: "Deploy",
        hash: "hashed",
        prefix: "sck_test",
        userId: "u1",
        permissions: [],
        scopes: [],
        revoked: false,
        usageCount: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    });

    const { handleApiKeyRoutes } = await import("@src/routes/api/[...path]/handlers/api-keys");
    const res = await handleApiKeyRoutes(
      mockEvent("POST", { _id: "u1", role: "admin" }, { name: "Deploy" }),
      "global" as any,
      ["api-keys"],
    );
    const body = await res.json();
    expect(body.data.key).toBe("sck_test_full_key_value");
    expect(body.data.hash).toBeUndefined();
  });
});
